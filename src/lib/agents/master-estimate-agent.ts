/**
 * Master Estimate Agent
 *
 * ЄДИНИЙ агент який генерує ПОВНИЙ детальний кошторис.
 * Генерація йде секція-за-секцією, але КОЖНА секція отримує
 * повний master context з pre-analysis (wizard + документи + Prozorro).
 *
 * Це дає:
 * - 16K токенів НА КОЖНУ секцію = 30-80 позицій на секцію
 * - Повний контекст для кожної секції (не гублять картину)
 * - Детальну розбивку по матеріалах, роботах, цінах
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentContext, EstimateSection, EstimateItem } from './base-agent';
import { findSimilarPrices } from '../prozorro-price-reference';

export interface MasterAgentOutput {
  sections: EstimateSection[];
  totalCost: number;
  warnings: string[];
  metadata: {
    sectionsGenerated: number;
    totalItems: number;
    prozorroPricesUsed: number;
    googlePricesUsed: number;
  };
}

export type MasterProgressCallback = (update: {
  sectionIndex: number;
  totalSections: number;
  sectionTitle: string;
  itemsGenerated: number;
  status: 'generating' | 'complete' | 'error';
}) => void;

/**
 * Структура секції: назва + детальний опис того що має бути в ній
 */
interface SectionSpec {
  title: string;
  description: string;
  required: boolean;
  minItems: number;
  scope: string[]; // Що саме треба включити
}

const BUILDING_SECTIONS: SectionSpec[] = [
  {
    title: 'Земляні роботи',
    description: 'Підготовка майданчика та земляні роботи',
    required: true,
    minItems: 10,
    scope: [
      'Розчистка території від рослинності',
      'Зняття рослинного шару ґрунту',
      'Розробка ґрунту екскаватором (котлован/траншеї)',
      'Розробка ґрунту вручну в місцях комунікацій',
      'Навантаження ґрунту на автосамоскиди',
      'Транспортування ґрунту на відвал (км)',
      'Зворотня засипка пазух',
      'Ущільнення ґрунту пошарово',
      'Планування майданчика бульдозером',
      'Влаштування дренажу',
      'Водопониження (якщо потрібно)',
      'Улаштування тимчасових доріг',
    ],
  },
  {
    title: 'Фундамент',
    description: 'Фундаментні роботи та підземні конструкції',
    required: true,
    minItems: 15,
    scope: [
      'Бетонна підготовка під фундаменти (М100)',
      'Армування фундаментів (арматура А500С різних діаметрів)',
      'В\'язання арматурних каркасів',
      'Встановлення опалубки щитової',
      'Укладання бетону (М250, М300, М350) з насосу',
      'Вібрування бетону',
      'Догляд за бетоном',
      'Розбирання опалубки',
      'Гідроізоляція обмазувальна (бітумна мастика)',
      'Гідроізоляція оклеювальна (рулонна 2 шари)',
      'Утеплення фундаменту (XPS 50-100мм)',
      'Захист утеплення (профільна мембрана)',
      'Фундаментні блоки ФБС (якщо збірний)',
      'Розчин для монтажу блоків',
      'Влаштування вимощення (бетон)',
    ],
  },
  {
    title: 'Стіни та конструкції',
    description: 'Несучі стіни, перегородки, колони, перекриття',
    required: true,
    minItems: 20,
    scope: [
      'Кладка несучих стін з газоблоку/цегли/бетону',
      'Розчин для кладки (клей/ЦПС)',
      'Армування кладки сіткою',
      'Перемички над отворами (залізобетонні)',
      'Монолітні залізобетонні колони (бетон + арматура + опалубка)',
      'Монолітні балки та прогони',
      'Монолітні перекриття (бетон + арматура + опалубка)',
      'Металеві колони (якщо є)',
      'Металеві ферми/балки перекриття',
      'Профнастил для перекриття',
      'Сходи залізобетонні',
      'Перегородки ГКЛ (каркас + гіпсокартон 2 шари)',
      'Перегородки з блоків',
      'Утеплення стін мінвата/пінопласт',
      'Пароізоляція/вітроізоляція',
      'Штукатурка стін чорнова',
      'Кладка димоходів/вентшахт',
    ],
  },
  {
    title: 'Покрівля',
    description: 'Покрівельна система: крокви, утеплення, покриття, водостік',
    required: true,
    minItems: 12,
    scope: [
      'Кроквяна система (брус сосна)',
      'Мауерлат',
      'Обрешітка (дошка/OSB)',
      'Контробрешітка',
      'Пароізоляція',
      'Утеплення даху (мінвата 150-200мм)',
      'Гідроізоляційна мембрана',
      'Покрівельне покриття (металочерепиця/бітум/мембрана)',
      'Коньок покрівлі',
      'Вітрові планки',
      'Снігозатримувачі',
      'Водостічна система (жолоби, труби, воронки)',
      'Примикання до стін',
      'Вихід вентиляції через покрівлю',
      'Парапети (для плоскої)',
    ],
  },
  {
    title: 'Електрика та IT',
    description: 'Електропостачання, освітлення, слабкострумові мережі',
    required: true,
    minItems: 20,
    scope: [
      'Вводно-розподільний пристрій (ВРП/ГРЩ)',
      'Силові кабелі (ВВГ 3х2.5, 3х4, 5х6, 5х10, 5х16 мм²)',
      'Кабельні лотки/труби гофра',
      'Розподільчі щити поверхові',
      'Автоматичні вимикачі',
      'УЗО (ПЗВ)',
      'Розетки (звичайні, вологозахищені, силові)',
      'Вимикачі',
      'Освітлення LED (панелі, світильники, прожектори)',
      'Аварійне освітлення + знаки EXIT',
      'Прокладка кабелю в стінах (штроби)',
      'Слабкострум - кабель UTP Cat6',
      'Слабкострум - оптоволокно',
      'IT шафа (стійка серверна)',
      'Відеонагляд (камери + DVR + кабелі)',
      'Контроль доступу (зчитувачі, електрозамки)',
      'Система пожежної сигналізації (сповіщувачі, шлейфи, ППКП)',
      'Заземлення + блискавкозахист',
      'Щит автоматики',
    ],
  },
  {
    title: 'Вентиляція та опалення (HVAC)',
    description: 'Припливно-витяжна вентиляція, кондиціонування, опалення, холод',
    required: true,
    minItems: 18,
    scope: [
      'Припливні установки (з рекуператором)',
      'Витяжні установки',
      'Повітроводи оцинковані круглі',
      'Повітроводи прямокутні',
      'Ізоляція повітроводів (K-flex/каучук)',
      'Дифузори припливні/витяжні',
      'Вогнезатримуючі клапани',
      'Опалення - котел/теплогенератор',
      'Радіатори/конвектори',
      'Труби опалення (PEX/метал)',
      'Циркуляційні насоси',
      'Колектори',
      'Тепла підлога (для адмін приміщень)',
      'Кондиціонери (спліт/мультиспліт)',
      'Холодильне обладнання (для торгового залу/складу)',
      'Холодоагентні труби (мідь)',
      'Компресорні установки',
      'Система управління (автоматика)',
    ],
  },
  {
    title: 'Сантехніка та каналізація',
    description: 'Водопостачання, каналізація, сантехприлади',
    required: true,
    minItems: 15,
    scope: [
      'Ввід водопроводу ПЕ труба',
      'Колодязь водопровідний',
      'Лічильник води + вузол обліку',
      'Водопровідні труби всередині (ПП/PEX)',
      'Фітинги, арматура',
      'Змішувачі',
      'Унітази з бачком',
      'Раковини + столи',
      'Душові кабіни (якщо є)',
      'Водонагрівач (бойлер)',
      'Каналізаційні труби ПВХ (різні діаметри)',
      'Ревізії, трапи',
      'Зливні лотки',
      'Зовнішня каналізація',
      'Каналізаційний колодязь',
      'Жироуловлювач (для комерції з кухнею)',
      'Дощова каналізація',
    ],
  },
  {
    title: 'Протипожежна система',
    description: 'Спринклерна система, пожежна сигналізація, димовидалення',
    required: true,
    minItems: 12,
    scope: [
      'Спринклерна система - насосна станція',
      'Труби сталеві для спринклерів',
      'Спринклерні зрошувачі',
      'Вузли управління',
      'Пожежні гідранти',
      'Пожежні шафи з рукавами',
      'Вогнегасники (різні типи)',
      'Знаки евакуації',
      'Димовидалення - вентилятори',
      'Вогнезатримуючі клапани',
      'Вогнезахист металоконструкцій',
      'Протипожежні двері',
      'Резервуар води для пожежогасіння',
    ],
  },
  {
    title: 'Оздоблення',
    description: 'Чистове оздоблення: підлоги, стіни, стелі, двері, вікна',
    required: true,
    minItems: 25,
    scope: [
      'Стяжка підлог (ЦПС)',
      'Гідроізоляція підлог (санвузли)',
      'Наливна підлога епоксидна (для комерції)',
      'Керамограніт для підлоги',
      'Керамічна плитка',
      'Клей для плитки',
      'Затирка швів',
      'Ламінат / паркет',
      'Плінтуси',
      'Штукатурка стін гіпсова',
      'Шпаклівка фінішна',
      'Грунтовка (глибокого проникнення)',
      'Фарбування стін (водоемульсійна)',
      'Шпалери / декоративна штукатурка',
      'Облицювання стін плиткою',
      'Підвісні стелі (Armstrong / ГКЛ)',
      'Натяжні стелі (для адмін)',
      'Двері міжкімнатні',
      'Двері вхідні металеві',
      'Двері технічні металеві',
      'Двері протипожежні',
      'Вікна металопластикові',
      'Вітражні конструкції (для фасаду торгового)',
      'Підвіконня',
      'Відкоси',
      'Фасадне оздоблення (штукатурка/сайдинг/вентфасад)',
      'Утеплення фасаду',
    ],
  },
];

export class MasterEstimateAgent {
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  /**
   * Генерувати повний детальний кошторис (секція-за-секцією)
   */
  async generate(
    context: AgentContext,
    onProgress?: MasterProgressCallback
  ): Promise<MasterAgentOutput> {
    console.log('🎯 MasterEstimateAgent: Starting detailed section-by-section generation...');

    // Визначити які секції потрібні
    const sectionsToGenerate = this.selectSections(context);
    console.log(`📋 Will generate ${sectionsToGenerate.length} sections`);

    const allWarnings: string[] = [];
    const sectionResults: (EstimateSection | null)[] = new Array(sectionsToGenerate.length).fill(null);

    // 🚀 Паралельна генерація батчами по 3 секції
    // Це укладається в Vercel maxDuration=300s (замість послідовних ~5+ хв)
    const BATCH_SIZE = 3;

    for (let batchStart = 0; batchStart < sectionsToGenerate.length; batchStart += BATCH_SIZE) {
      const batch = sectionsToGenerate.slice(batchStart, batchStart + BATCH_SIZE);

      console.log(`\n🚀 Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: paralle generation of ${batch.length} sections`);

      // Сповіщаємо UI про початок батчу
      batch.forEach((spec, idx) => {
        onProgress?.({
          sectionIndex: batchStart + idx,
          totalSections: sectionsToGenerate.length,
          sectionTitle: spec.title,
          itemsGenerated: 0,
          status: 'generating',
        });
      });

      // Запускаємо всі секції батчу паралельно
      const batchPromises = batch.map(async (spec, idx) => {
        const sectionIndex = batchStart + idx;
        try {
          console.log(`🔨 [${sectionIndex + 1}/${sectionsToGenerate.length}] Generating: ${spec.title}`);

          // Передаємо порожній previousSections — секції незалежні
          const section = await this.generateSection(spec, context, []);
          sectionResults[sectionIndex] = section;

          console.log(`   ✅ ${section.items.length} items, ${section.sectionTotal.toFixed(0)} ₴`);

          onProgress?.({
            sectionIndex,
            totalSections: sectionsToGenerate.length,
            sectionTitle: spec.title,
            itemsGenerated: section.items.length,
            status: 'complete',
          });

          return section;
        } catch (error) {
          console.error(`❌ Failed to generate section "${spec.title}":`, error);
          allWarnings.push(`Помилка генерації секції "${spec.title}": ${error instanceof Error ? error.message : 'Unknown'}`);

          onProgress?.({
            sectionIndex,
            totalSections: sectionsToGenerate.length,
            sectionTitle: spec.title,
            itemsGenerated: 0,
            status: 'error',
          });
          return null;
        }
      });

      await Promise.all(batchPromises);
    }

    // Зібрати всі успішні секції в правильному порядку
    const allSections: EstimateSection[] = sectionResults.filter((s): s is EstimateSection => s !== null);

    // Збагатити всі секції цінами з Prozorro
    console.log(`\n💰 Enriching all sections with Prozorro prices...`);
    const enrichedSections = await this.enrichWithProzorroPrices(allSections);

    // Розрахувати загальну суму
    const totalCost = enrichedSections.reduce((sum, section) => sum + section.sectionTotal, 0);

    // Статистика
    let prozorroPricesUsed = 0;
    let googlePricesUsed = 0;
    let totalItems = 0;

    enrichedSections.forEach(section => {
      totalItems += section.items.length;
      section.items.forEach(item => {
        if (item.priceSource?.includes('Prozorro')) {
          prozorroPricesUsed++;
        } else if (item.priceSource?.includes('Google')) {
          googlePricesUsed++;
        }
      });
    });

    console.log(`\n✅ MasterAgent complete: ${enrichedSections.length} sections, ${totalItems} items, ${totalCost.toFixed(0)} ₴`);
    console.log(`   Prozorro prices: ${prozorroPricesUsed}, Other: ${googlePricesUsed}`);

    return {
      sections: enrichedSections,
      totalCost,
      warnings: allWarnings,
      metadata: {
        sectionsGenerated: enrichedSections.length,
        totalItems,
        prozorroPricesUsed,
        googlePricesUsed,
      },
    };
  }

  /**
   * Вибрати які секції генерувати на основі wizard data
   */
  private selectSections(context: AgentContext): SectionSpec[] {
    const wizardData = context.wizardData;
    const workScope = wizardData?.workScope;
    const objectType = wizardData?.objectType;

    // Для ремонту/оздоблення — пропускаємо земляні/фундамент/стіни/покрівлю
    if (workScope === 'renovation' || workScope === 'finishing') {
      return BUILDING_SECTIONS.filter(s =>
        !['Земляні роботи', 'Фундамент', 'Стіни та конструкції', 'Покрівля'].includes(s.title)
      );
    }

    // Для нового будівництва — всі секції
    return BUILDING_SECTIONS;
  }

  /**
   * Генерувати одну секцію з взаємним fallback OpenAI ↔ Gemini
   * Якщо одна модель зависла/впала за 60с → друга страхує
   */
  private async generateSection(
    spec: SectionSpec,
    context: AgentContext,
    previousSections: EstimateSection[]
  ): Promise<EstimateSection> {
    const systemPrompt = this.getSectionSystemPrompt(spec);
    const userPrompt = this.buildSectionPrompt(spec, context, previousSections);

    let parsed: any;
    let usedModel = 'openai';

    // 1️⃣ Спроба OpenAI з 60с таймаутом
    try {
      console.log(`  🤖 [${spec.title}] Trying OpenAI gpt-4o...`);
      parsed = await this.callOpenAI(systemPrompt, userPrompt, spec.title);
    } catch (openaiError) {
      const errMsg = openaiError instanceof Error ? openaiError.message : 'Unknown';
      console.warn(`  ⚠️ [${spec.title}] OpenAI failed (${errMsg}) — fallback to Gemini`);

      // 2️⃣ Fallback на Gemini якщо OpenAI впав/timeout
      try {
        parsed = await this.callGemini(systemPrompt, userPrompt, spec.title);
        usedModel = 'gemini';
        console.log(`  ✅ [${spec.title}] Gemini fallback succeeded`);
      } catch (geminiError) {
        const geminiErrMsg = geminiError instanceof Error ? geminiError.message : 'Unknown';
        console.error(`  ❌ [${spec.title}] Both models failed. OpenAI: ${errMsg}, Gemini: ${geminiErrMsg}`);
        throw new Error(`Обидві моделі не змогли згенерувати секцію: OpenAI (${errMsg}), Gemini (${geminiErrMsg})`);
      }
    }

    const items: EstimateItem[] = (parsed.items || []).map((item: any) => ({
      description: item.description || '',
      quantity: Number(item.quantity) || 0,
      unit: item.unit || 'шт',
      unitPrice: Number(item.unitPrice) || 0,
      laborCost: Number(item.laborCost) || 0,
      totalCost: Number(item.totalCost) || (Number(item.quantity) * Number(item.unitPrice) + Number(item.laborCost || 0)),
      priceSource: item.priceSource || `AI оцінка (${usedModel})`,
      confidence: Number(item.confidence) || 0.7,
      notes: item.notes,
    }));

    const sectionTotal = items.reduce((sum, item) => sum + item.totalCost, 0);

    return {
      title: spec.title,
      items,
      sectionTotal,
    };
  }

  /**
   * Виклик OpenAI з таймаутом 60с
   */
  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    sectionTitle: string
  ): Promise<any> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`⏱️ OpenAI [${sectionTitle}] timeout after 60s — aborting`);
      abortController.abort();
    }, 60000);

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 8000,
      }, {
        signal: abortController.signal,
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      return JSON.parse(responseText);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Виклик Gemini з таймаутом 60с (як fallback)
   */
  private async callGemini(
    systemPrompt: string,
    userPrompt: string,
    sectionTitle: string
  ): Promise<any> {
    // Gemini не має нативного AbortSignal, обгортаємо у Promise.race
    const model = this.gemini.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 8000,
      },
    });

    // Об'єднуємо system + user в один промпт (Gemini не має ролей як OpenAI)
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}\n\nВідповідь у форматі JSON.`;

    const geminiPromise = model.generateContent(combinedPrompt).then(result => {
      const text = result.response.text();
      return JSON.parse(text);
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini timeout after 60s [${sectionTitle}]`)), 60000)
    );

    return Promise.race([geminiPromise, timeoutPromise]);
  }

  /**
   * System prompt для генерації однієї секції
   */
  private getSectionSystemPrompt(spec: SectionSpec): string {
    return `Ти - ДОСВІДЧЕНИЙ ІНЖЕНЕР-КОШТОРИСНИК з 20-річним стажем, спеціалізація: "${spec.title}".

ТВОЯ ЗАДАЧА:
Згенерувати МАКСИМАЛЬНО ДЕТАЛЬНИЙ кошторис для секції "${spec.title}".

КРИТИЧНО ВАЖЛИВО:
1. МІНІМУМ ${spec.minItems} позицій у секції (бажано більше для великих об'єктів)
2. Кожну роботу розбивай ДЕТАЛЬНО:
   - Матеріал окремо (кожен тип, марка, діаметр, товщина)
   - Робота окремо (монтаж, укладання, зварювання)
   - Обладнання окремо (насоси, компресори, установки)
3. Для КОЖНОЇ позиції конкретна одиниця виміру (м², м³, м.п., шт, т, кг)
4. Ціни РЕАЛІСТИЧНІ для України 2026 року (з інфляцією)
5. Обсяги РЕАЛЬНІ залежно від площі об'єкта
6. Якщо є дані з Prozorro у контексті — використовуй їх як орієнтир

ЯК РОЗБИВАТИ ПОЗИЦІЇ:
❌ НЕ ТРЕБА: "Електромонтажні роботи — 1 комплект — 500000 ₴"
✅ ТРЕБА:
  - "Кабель ВВГнг-LS 3х2.5 мм² — 850 м.п. — 38 ₴/м.п."
  - "Прокладання кабелю в гофротрубі — 850 м.п. — 22 ₴/м.п."
  - "Розетка з з/к IP44 Legrand — 45 шт — 185 ₴/шт"
  - "Монтаж розетки — 45 шт — 95 ₴/шт"
  - "Автомат C16 1P Schneider — 28 шт — 165 ₴/шт"
  - ... (ще 30+ позицій)

ОБЛАСТЬ ЦІЄЇ СЕКЦІЇ:
${spec.scope.map((s, i) => `${i + 1}. ${s}`).join('\n')}

ФОРМАТ ВІДПОВІДІ — ВАЛІДНИЙ JSON:
{
  "items": [
    {
      "description": "Детальний опис (матеріал/марка/розмір)",
      "quantity": число,
      "unit": "м²|м³|м.п.|шт|т|кг|комп",
      "unitPrice": число (ціна матеріалу за одиницю),
      "laborCost": число (вартість роботи ЗА ВСЮ позицію),
      "totalCost": число (quantity * unitPrice + laborCost),
      "priceSource": "Prozorro|Ринкова 2026|Специфікація",
      "confidence": 0.7-0.95,
      "notes": "опціональні примітки"
    }
  ]
}

ВИМОГИ:
- МІНІМУМ ${spec.minItems} позицій (це обов'язково!)
- Кожна позиція — конкретна (не загальні фрази)
- totalCost = quantity * unitPrice + laborCost (математично правильно)
- НЕ дублюй позиції з інших секцій (див. "Вже згенеровані секції" у промті)`;
  }

  /**
   * Побудувати user prompt для секції
   */
  private buildSectionPrompt(
    spec: SectionSpec,
    context: AgentContext,
    previousSections: EstimateSection[]
  ): string {
    let prompt = `# ЗАВДАННЯ: Згенерувати детальну секцію "${spec.title}"\n\n`;

    // Master Context з pre-analysis (wizard + документи + Prozorro)
    if (context.masterContext) {
      prompt += `## КОНТЕКСТ ПРОЕКТУ (pre-analysis)\n`;
      prompt += context.masterContext;
      prompt += '\n\n';
    }

    // Wizard data
    prompt += `## ПАРАМЕТРИ ПРОЕКТУ\n`;
    prompt += `- Площа: ${context.wizardData.totalArea} м²\n`;
    prompt += `- Тип об'єкта: ${context.wizardData.objectType}\n`;

    if (context.wizardData.objectType === 'commercial') {
      const cd = context.wizardData.commercialData;
      if (cd?.purpose) prompt += `- Призначення: ${cd.purpose}\n`;
      if (cd?.floors) prompt += `- Поверхів: ${cd.floors}\n`;
      if (cd?.hvac) prompt += `- Холодильне обладнання: так\n`;
    }

    if (context.wizardData.houseData) {
      const hd = context.wizardData.houseData;
      if (hd.floors) prompt += `- Поверхів: ${hd.floors}\n`;
      if (hd.rooms) prompt += `- Кімнат: ${hd.rooms}\n`;
    }

    // Вже згенеровані секції (щоб не дублювати)
    if (previousSections.length > 0) {
      prompt += `\n## ВЖЕ ЗГЕНЕРОВАНІ СЕКЦІЇ (не дублюй!)\n`;
      previousSections.forEach(s => {
        prompt += `- ${s.title}: ${s.items.length} позицій, ${s.sectionTotal.toFixed(0)} ₴\n`;
      });
    }

    prompt += `\n## ІНСТРУКЦІЯ\n`;
    prompt += `Згенеруй ДЕТАЛЬНУ секцію "${spec.title}" з МІНІМУМ ${spec.minItems} позиціями.\n`;
    prompt += `Площа об'єкта ${context.wizardData.totalArea} м² — використовуй це для розрахунку обсягів.\n`;
    prompt += `Обов'язково покрий ВСЮ область роботи (див. system prompt).\n`;
    prompt += `Розбивай МАКСИМАЛЬНО детально: матеріал окремо, робота окремо, обладнання окремо.\n`;
    prompt += `Поверни JSON.\n`;

    return prompt;
  }

  /**
   * Збагатити позиції цінами з Prozorro
   */
  private async enrichWithProzorroPrices(
    sections: EstimateSection[]
  ): Promise<EstimateSection[]> {
    const enrichedSections: EstimateSection[] = [];

    for (const section of sections) {
      const enrichedItems: EstimateItem[] = [];

      for (const item of section.items) {
        let enrichedItem = { ...item };

        try {
          const prozorroResult = await findSimilarPrices(item.description, item.unit, {
            maxAge: 12,
            applyInflation: true,
            minSimilarity: 70,
            limit: 3,
          });

          if (prozorroResult.length > 0) {
            const prices = prozorroResult.map(r => r.adjustedPrice).sort((a, b) => a - b);
            const medianPrice = prices[Math.floor(prices.length / 2)];

            enrichedItem.unitPrice = medianPrice;
            enrichedItem.totalCost = enrichedItem.quantity * medianPrice + (enrichedItem.laborCost || 0);
            enrichedItem.priceSource = `Prozorro (${prozorroResult.length} тендерів, медіана)`;
            enrichedItem.confidence = 0.9;
          }
        } catch (error) {
          // silent fail - залишаємо AI ціну
        }

        enrichedItems.push(enrichedItem);
      }

      const sectionTotal = enrichedItems.reduce((sum, item) => sum + item.totalCost, 0);

      enrichedSections.push({
        ...section,
        items: enrichedItems,
        sectionTotal,
      });
    }

    return enrichedSections;
  }
}
