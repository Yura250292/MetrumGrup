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
  /** Текст помилки коли status='error'. */
  error?: string;
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
  /** Use gpt-4o-mini for simpler sections to save tokens (~50% cheaper). */
  useMiniModel?: boolean;
}

/**
 * Секція демонтажу — додається ТІЛЬКИ коли в wizard обрано
 * "demolitionRequired: true". Генерується першою, бо демонтаж
 * фізично передує будь-яким новим роботам і суттєво впливає
 * на загальний кошторис (може додати 10-30% вартості).
 */
const DEMOLITION_SECTION: SectionSpec = {
  title: 'Демонтажні роботи',
  description: 'Розбирання існуючих конструкцій, вивезення будівельного сміття, підготовка майданчика під нове будівництво',
  required: true,
  minItems: 12,
  scope: [
    'Демонтаж покрівлі (зняття покриття, розбирання кроквяної системи)',
    'Демонтаж перекриттів (плити / дерев\'яні балки)',
    'Демонтаж несучих стін (цегла/бетон/блоки)',
    'Демонтаж перегородок',
    'Демонтаж підлоги та стяжки',
    'Демонтаж фундаменту (якщо потрібно)',
    'Демонтаж інженерних мереж (електрика, сантехніка, опалення)',
    'Демонтаж вікон та дверей',
    'Демонтаж оздоблення (штукатурка, плитка, підвісні стелі)',
    'Розбирання сходів',
    'Навантаження та вивезення будівельного сміття (м³)',
    'Утилізація будівельних відходів',
    'Захисне огородження та тимчасові конструкції',
    'Протипилові заходи (зрошення, завіси)',
    'Ручне розбирання в складних місцях (біля комунікацій)',
  ],
};

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
    useMiniModel: true,
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
    useMiniModel: true,
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
    useMiniModel: true,
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
    useMiniModel: true,
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

  private parseAiNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const normalized = String(value)
      .trim()
      .replace(/\s+/g, '')
      .replace(/₴|грн|uah/gi, '')
      .replace(',', '.');

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseItems(parsed: any, usedModel: string): EstimateItem[] {
    return (parsed.items || []).map((item: any) => {
      const quantity = this.parseAiNumber(item.quantity);
      const unitPrice = this.parseAiNumber(item.unitPrice);
      const laborCost = this.parseAiNumber(item.laborCost);
      const totalCost = this.parseAiNumber(item.totalCost) || (quantity * unitPrice + laborCost);
      const confidence = this.parseAiNumber(item.confidence) || 0.7;
      return {
        description: item.description || '',
        quantity,
        unit: item.unit || 'шт',
        unitPrice,
        laborCost,
        totalCost,
        priceSource: item.priceSource || `AI оцінка (${usedModel})`,
        confidence,
        notes: item.notes,
      };
    });
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

      // Collect completed sections from previous batches for deduplication
      const completedSections = sectionResults.filter((s): s is EstimateSection => s !== null);

      // Запускаємо всі секції батчу паралельно
      const batchPromises = batch.map(async (spec, idx) => {
        const sectionIndex = batchStart + idx;
        try {
          console.log(`🔨 [${sectionIndex + 1}/${sectionsToGenerate.length}] Generating: ${spec.title}`);

          // Pass completed sections from previous batches for dedup context
          // sectionIndex > 0 gets compact master context to save tokens
          const section = await this.generateSection(spec, context, completedSections, sectionIndex);
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
          const errMsg = error instanceof Error ? error.message : String(error);
          const errStack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : '';
          console.error(`❌ Failed to generate section "${spec.title}":`, error);
          allWarnings.push(`Помилка генерації секції "${spec.title}": ${errMsg}`);

          onProgress?.({
            sectionIndex,
            totalSections: sectionsToGenerate.length,
            sectionTitle: spec.title,
            itemsGenerated: 0,
            status: 'error',
            error: errStack ? `${errMsg} | ${errStack}` : errMsg,
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
   * Вибрати які секції генерувати на основі wizard data.
   *
   * Логіка:
   * - renovation / finishing → ремонт без важких конструкцій
   * - apartment / office → квартирний/офісний фронт без земляних/фундаменту/покрівлі
   * - commercial без fireRating → можна пропустити протипожежну
   * - house без extras (basement/attic/garage) → не додаємо окрему секцію (її і так немає)
   */
  private selectSections(context: AgentContext): SectionSpec[] {
    const wizardData = context.wizardData;
    const workScope = wizardData?.workScope;
    const objectType = wizardData?.objectType;

    let sections = [...BUILDING_SECTIONS];

    // 1. Ремонт/оздоблення — без важких конструкцій
    if (workScope === 'renovation' || workScope === 'finishing') {
      sections = sections.filter(s =>
        !['Земляні роботи', 'Фундамент', 'Стіни та конструкції', 'Покрівля'].includes(s.title)
      );
    }

    // 2. Квартира/офіс — апріорі не мають земляних/фундаменту/покрівлі
    if (objectType === 'apartment' || objectType === 'office') {
      sections = sections.filter(s =>
        !['Земляні роботи', 'Фундамент', 'Покрівля'].includes(s.title)
      );
    }

    // 3. Комерція без fireRating — пропускаємо протипожежну
    if (objectType === 'commercial' && wizardData?.commercialData?.fireRating === false) {
      sections = sections.filter(s => s.title !== 'Протипожежна система');
    }

    // 4. Не-комерція без явного fireRating → також без протипожежної
    //    (для приватних будинків/квартир спринклерна система не потрібна)
    if (objectType !== 'commercial') {
      sections = sections.filter(s => s.title !== 'Протипожежна система');
    }

    // 5. Демонтаж — якщо обрано в wizard, додаємо ПЕРШОЮ секцією.
    //    Перевіряємо всі можливі джерела: houseData, townhouseData,
    //    commercialData, renovationData, а також currentState.
    const needsDemolition =
      wizardData?.houseData?.demolitionRequired === true ||
      wizardData?.townhouseData?.demolitionRequired === true ||
      wizardData?.commercialData?.demolitionRequired === true ||
      wizardData?.renovationData?.demolitionRequired === true ||
      wizardData?.houseData?.currentState === 'existing_building' ||
      wizardData?.commercialData?.currentState === 'existing_building';

    if (needsDemolition) {
      sections = [DEMOLITION_SECTION, ...sections];
    }

    return sections;
  }

  /**
   * Генерувати одну секцію з взаємним fallback OpenAI ↔ Gemini
   * Якщо одна модель зависла/впала за 60с → друга страхує
   */
  private async generateSection(
    spec: SectionSpec,
    context: AgentContext,
    previousSections: EstimateSection[],
    sectionIndex: number = 0
  ): Promise<EstimateSection> {
    const systemPrompt = this.getSectionSystemPrompt(spec);
    const userPrompt = this.buildSectionPrompt(spec, context, previousSections, sectionIndex);

    let parsed: any;
    let usedModel = 'openai';

    // 1️⃣ Спроба OpenAI з 60с таймаутом
    const useMini = spec.useMiniModel ?? false;
    try {
      console.log(`  🤖 [${spec.title}] Trying OpenAI ${useMini ? 'gpt-4o-mini' : 'gpt-4o'}...`);
      parsed = await this.callOpenAI(systemPrompt, userPrompt, spec.title, useMini);
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

    let items: EstimateItem[] = this.parseItems(parsed, usedModel);

    // Retry once if section is critically under-filled (less than 50% of minItems)
    const minThreshold = Math.ceil(spec.minItems * 0.5);
    if (items.length < minThreshold) {
      console.warn(`  ⚠️ [${spec.title}] Only ${items.length}/${spec.minItems} items — retrying with Gemini...`);
      try {
        const retryParsed = await this.callGemini(systemPrompt, userPrompt + `\n\n⚠️ ПОПЕРЕДНЯ СПРОБА ДАЛА ЛИШЕ ${items.length} ПОЗИЦІЙ. Потрібно МІНІМУМ ${spec.minItems}. Додай БІЛЬШЕ деталей!`, spec.title);
        const retryItems = this.parseItems(retryParsed, 'gemini');
        if (retryItems.length > items.length) {
          console.log(`  ✅ [${spec.title}] Retry: ${retryItems.length} items (was ${items.length})`);
          items = retryItems;
        }
      } catch (e) {
        console.warn(`  ⚠️ [${spec.title}] Retry failed, keeping original ${items.length} items`);
      }
    }

    const sectionTotal = items.reduce((sum, item) => sum + item.totalCost, 0);

    return {
      title: spec.title,
      items,
      sectionTotal,
    };
  }

  /**
   * Виклик OpenAI з таймаутом 60с.
   * Uses gpt-4o-mini for simple sections to save ~50% per call.
   */
  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    sectionTitle: string,
    useMiniModel: boolean = false
  ): Promise<any> {
    const model = useMiniModel ? 'gpt-4o-mini' : 'gpt-4o';
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`⏱️ OpenAI [${sectionTitle}] timeout after 60s — aborting`);
      abortController.abort();
    }, 60000);

    try {
      const completion = await this.openai.chat.completions.create({
        model,
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

      // Token usage logging
      if (completion.usage) {
        const u = completion.usage;
        console.log(`  📊 [${sectionTitle}] ${model}: ${u.prompt_tokens} in + ${u.completion_tokens} out = ${u.total_tokens} tokens`);
      }

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
    // Gemini не має нативного AbortSignal, обгортаємо у Promise.race.
    //
    // ВАЖЛИВО: модель `gemini-2.0-flash-exp` повертає 404 — Google прибрав
    // experimental endpoint. Усі інші файли проекту вже використовують
    // `gemini-3-flash-preview`, тому уніфіковуємось до нього.
    const model = this.gemini.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 8000,
      },
    });

    // Об'єднуємо system + user в один промпт (Gemini не має ролей як OpenAI)
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}\n\nВідповідь у форматі JSON.`;

    const geminiPromise = model.generateContent(combinedPrompt).then(result => {
      // Token usage logging for Gemini
      const usage = result.response.usageMetadata;
      if (usage) {
        console.log(`  📊 [${sectionTitle}] gemini-3-flash: ${usage.promptTokenCount ?? '?'} in + ${usage.candidatesTokenCount ?? '?'} out = ${usage.totalTokenCount ?? '?'} tokens`);
      }
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
    // Для демонтажних робіт — додатковий наголос на масштаб і вартість.
    const demolitionExtra = spec.title === 'Демонтажні роботи'
      ? `\n\n🚨 ДЕМОНТАЖ — ЦЕ ДОРОГА РОБОТА:
- Повний демонтаж будівлі коштує 10-15% від вартості нового будівництва.
- Ніколи не генеруй секцію дешевше ніж 5% від загальної вартості проєкту.
- Якщо загальний кошторис ~60-70 млн ₴ — демонтаж має бути 6-10 млн ₴.
- Обсяги вивезення сміття рахуй від площі: 1 м² будівлі ≈ 0.5-0.7 м³ сміття.
- Не забудь механізовану техніку (екскаватори, автокрани, самоскиди).`
      : '';

    return `Ти - ДОСВІДЧЕНИЙ ІНЖЕНЕР-КОШТОРИСНИК з 20-річним стажем, спеціалізація: "${spec.title}".${demolitionExtra}

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
   * Create a compact summary of master context (~200-300 tokens instead of 1500-2000).
   * Used for sections after the first one to save ~19K tokens per estimate.
   */
  private compactMasterContext(fullContext: string, wizardData: any): string {
    const wd = wizardData;
    let compact = `Проект: ${wd.objectType || '?'}, ${wd.totalArea || '?'}м², ${wd.floors || 1} пов.`;
    if (wd.budgetRange) compact += `, клас: ${wd.budgetRange}`;
    if (wd.workScope) compact += `, обсяг: ${wd.workScope}`;
    compact += `\n`;

    // Extract key numeric facts from master context (area, budget ranges, key materials)
    const areaMatch = fullContext.match(/площ[аі]\s*[:=]\s*([\d\s,.]+)\s*м/i);
    if (areaMatch) compact += `Площа з документів: ${areaMatch[1].trim()} м²\n`;

    const budgetMatch = fullContext.match(/бюджет\s*[:=]\s*([\d\s,.₴]+)/i);
    if (budgetMatch) compact += `Бюджет: ${budgetMatch[1].trim()}\n`;

    // Include Prozorro price hints if present (they're valuable but short)
    const prozorroLines = fullContext.split('\n').filter(l =>
      l.includes('Prozorro') || l.includes('prozorro') || l.includes('тендер')
    );
    if (prozorroLines.length > 0) {
      compact += `Prozorro: ${prozorroLines.slice(0, 3).join('; ').substring(0, 300)}\n`;
    }

    return compact;
  }

  /**
   * Побудувати user prompt для секції.
   * sectionIndex=0 gets full master context, subsequent sections get compact version.
   */
  private buildSectionPrompt(
    spec: SectionSpec,
    context: AgentContext,
    previousSections: EstimateSection[],
    sectionIndex: number = 0
  ): string {
    let prompt = `# ЗАВДАННЯ: Згенерувати детальну секцію "${spec.title}"\n\n`;

    // Master Context: full for first section, compact for subsequent
    if (context.masterContext) {
      if (sectionIndex === 0) {
        prompt += `## КОНТЕКСТ ПРОЕКТУ (pre-analysis)\n`;
        prompt += context.masterContext;
        prompt += '\n\n';
      } else {
        prompt += `## КОНТЕКСТ ПРОЕКТУ (стислий)\n`;
        prompt += this.compactMasterContext(context.masterContext, context.wizardData);
        prompt += '\n\n';
      }
    }

    // Спеціальні вказівки для секції "Демонтажні роботи": AI має розуміти
    // масштаб і вартість демонтажу відносно нового будівництва.
    const wd = context.wizardData;
    if (spec.title === 'Демонтажні роботи') {
      const area = wd.totalArea || 0;
      const floors = wd.floors || 1;
      const demolDesc =
        wd.houseData?.demolitionDescription ||
        wd.commercialData?.demolitionDescription ||
        (wd.renovationData as any)?.demolitionDescription ||
        '';
      const wallMaterial = wd.houseData?.walls?.material || wd.commercialData?.wallMaterial || 'невідомо';

      prompt += `## ⚠️ ВАЖЛИВО: МАСШТАБ ДЕМОНТАЖНИХ РОБІТ\n`;
      prompt += `Демонтується ІСНУЮЧА БУДІВЛЯ перед новим будівництвом.\n`;
      prompt += `- Загальна площа будівлі: ${area} м² (${floors} пов.)\n`;
      prompt += `- Орієнтовний об'єм демонтажу: ${Math.round(area * floors * 0.6)} м³ конструкцій\n`;
      prompt += `- Матеріал стін: ${wallMaterial}\n`;
      if (demolDesc) {
        prompt += `- Опис від замовника: ${demolDesc}\n`;
      }
      prompt += `\n`;
      prompt += `ПРАВИЛА РОЗРАХУНКУ ДЕМОНТАЖУ:\n`;
      prompt += `1. Вартість демонтажу ПОВНОГО розбирання будівлі = 10-15% від вартості нового будівництва аналогічної площі.\n`;
      prompt += `2. Для будівлі ${area} м² × ${floors} поверхів демонтаж має коштувати МІЛЬЙОНИ гривень, не сотні тисяч.\n`;
      prompt += `3. Обов'язково врахуй:\n`;
      prompt += `   - Механізований демонтаж (екскаватор з гідромолотом, автокран)\n`;
      prompt += `   - Ручний демонтаж в складних місцях\n`;
      prompt += `   - ВЕЛИКІ об'єми вивезення сміття (${Math.round(area * floors * 0.4)}-${Math.round(area * floors * 0.7)} м³)\n`;
      prompt += `   - Утилізацію на полігоні (коштує ~200-400 ₴/м³)\n`;
      prompt += `   - Роботу спецтехніки (від 3000-8000 ₴/зміна)\n`;
      prompt += `   - Тимчасове огородження, протипилові заходи\n`;
      prompt += `4. НЕ занижуй обсяги. Площа демонтажу = площа будівлі.\n`;
      prompt += `\n`;
    }

    prompt += `## ПАРАМЕТРИ ПРОЕКТУ\n`;
    prompt += `- Тип об'єкта: ${wd.objectType}\n`;
    prompt += `- Обсяг робіт: ${wd.workScope}\n`;
    prompt += `- Площа: ${wd.totalArea} м²\n`;
    if (wd.floors) prompt += `- Поверхів: ${wd.floors}\n`;
    if (wd.ceilingHeight) prompt += `- Висота стелі: ${wd.ceilingHeight} м\n`;
    if (wd.budgetRange) {
      const budgetLabels: Record<string, string> = {
        economy: 'ЕКОНОМ — найдешевші матеріали, бюджетні бренди, мінімальна якість фінішу',
        standard: 'СТАНДАРТ — середній ціновий сегмент, перевірені бренди',
        premium: 'ПРЕМІУМ — якісні європейські бренди, підвищена якість фінішу, сертифіковані майстри',
        luxury: 'ЛЮКС — топові бренди (Grohe, Hansgrohe, Villeroy&Boch, ArcelorMittal), ідеальний фініш, VIP якість',
      };
      prompt += `- Бюджетний клас: ${budgetLabels[wd.budgetRange] ?? wd.budgetRange}\n`;
      prompt += `⚠️ ВАЖЛИВО: Вибирай матеріали та ціни ВІДПОВІДНО до бюджетного класу!\n`;
      prompt += `  - Для ЕКОНОМ: бюджетні вітчизняні бренди, мінімальні ціни\n`;
      prompt += `  - Для СТАНДАРТ: середній сегмент, надійні бренди\n`;
      prompt += `  - Для ПРЕМІУМ: якісні імпортні бренди, ціни вище середнього на 30-50%\n`;
      prompt += `  - Для ЛЮКС: топові бренди, ціни вище стандарту в 2-3 рази\n\n`;
    }

    // 🏠 Будинок / таунхаус — повна геометрія + фундамент + стіни + дах
    if ((wd.objectType === 'house' || wd.objectType === 'townhouse') && wd.houseData) {
      const hd = wd.houseData;
      prompt += `\n## ДАНІ ПРО БУДИНОК\n`;
      prompt += `- Поточний стан: ${hd.currentState}\n`;
      if (hd.demolitionRequired) {
        prompt += `- Потрібен демонтаж: ${hd.demolitionDescription || 'так (опис не надано)'}\n`;
      }
      if (hd.terrain) {
        prompt += `- Грунт: ${hd.terrain.soilType}, ґрунтові води: ${hd.terrain.groundwaterDepth}, рельєф: ${hd.terrain.slope}\n`;
        if (hd.terrain.needsExcavation) prompt += `- Потрібні земляні роботи: так\n`;
        if (hd.terrain.needsDrainage) prompt += `- Потрібен дренаж: так\n`;
      }
      if (hd.foundation) {
        prompt += `- Фундамент: ${hd.foundation.type}, глибина ${hd.foundation.depth}м, ширина ${hd.foundation.width}м, армування: ${hd.foundation.reinforcement}\n`;
        if (hd.foundation.waterproofing) prompt += `- Гідроізоляція фундаменту: так\n`;
        if (hd.foundation.insulation) {
          prompt += `- Утеплення фундаменту: ${hd.foundation.insulationThickness ?? 50}мм XPS\n`;
        }
      }
      if (hd.walls) {
        prompt += `- Стіни: ${hd.walls.material}, товщина ${hd.walls.thickness}мм\n`;
        if (hd.walls.insulation) {
          prompt += `- Утеплення стін: ${hd.walls.insulationType ?? 'mineral'} ${hd.walls.insulationThickness ?? 100}мм\n`;
        }
        prompt += `- Перегородки: ${hd.walls.partitionMaterial}\n`;
        if (hd.walls.hasLoadBearing) prompt += `- Несучі стіни: так\n`;
      }
      if (hd.roof) {
        prompt += `- Дах: ${hd.roof.type}, ${hd.roof.material}`;
        if (hd.roof.pitchAngle) prompt += `, кут ${hd.roof.pitchAngle}°`;
        prompt += `\n`;
        if (hd.roof.insulation) {
          prompt += `- Утеплення даху: ${hd.roof.insulationThickness ?? 150}мм\n`;
        }
        prompt += `- Горище: ${hd.roof.attic}\n`;
        if (hd.roof.gutterSystem) prompt += `- Водостічна система: так\n`;
        if (hd.roof.roofWindows && hd.roof.roofWindows > 0) {
          prompt += `- Мансардних вікон: ${hd.roof.roofWindows} шт\n`;
        }
      }
      if (hd.hasGarage) prompt += `- Гараж: ${hd.garageArea ?? '?'}м² (${hd.garageType ?? 'attached'})\n`;
      if (hd.hasBasement) prompt += `- Підвал: ${hd.basementArea ?? '?'}м²\n`;
      if (hd.hasAttic) prompt += `- Мансарда: ${hd.atticArea ?? '?'}м²\n`;
    }

    // 🏢 Квартира / офіс — реновація з детальним переліком робіт
    if ((wd.objectType === 'apartment' || wd.objectType === 'office') && wd.renovationData) {
      const rd = wd.renovationData;
      prompt += `\n## ДАНІ ПРО РЕНОВАЦІЮ\n`;
      prompt += `- Поточний етап: ${rd.currentStage}\n`;
      if (rd.rooms) {
        prompt += `- Кімнати: ${rd.rooms.bedrooms} спалень, ${rd.rooms.bathrooms} санвузлів, кухня: ${rd.rooms.kitchen}, вітальня: ${rd.rooms.living}, інше: ${rd.rooms.other}\n`;
      }
      if (rd.existing) {
        const existingDone = Object.entries(rd.existing).filter(([_, v]) => v).map(([k]) => k);
        if (existingDone.length > 0) {
          prompt += `- Вже зроблено (НЕ повторювати!): ${existingDone.join(', ')}\n`;
        }
      }
      if (rd.workRequired) {
        const workNeeded = Object.entries(rd.workRequired)
          .filter(([_, v]) => v && v !== 'none')
          .map(([k, v]) => typeof v === 'string' ? `${k}=${v}` : k);
        if (workNeeded.length > 0) {
          prompt += `- Потрібні роботи: ${workNeeded.join(', ')}\n`;
        }
      }
      if (rd.layoutChange) prompt += `- Зміна планування: так\n`;
      if (rd.newPartitions) {
        prompt += `- Нові перегородки: ${rd.newPartitionsLength ?? '?'} м.п.\n`;
      }
    }

    // 🏭 Комерція — повна специфіка
    if (wd.objectType === 'commercial' && wd.commercialData) {
      const cd = wd.commercialData;
      prompt += `\n## ДАНІ ПРО КОМЕРЦІЙНИЙ ОБ'ЄКТ\n`;
      prompt += `- Призначення: ${cd.purpose}\n`;
      if (cd.currentState) prompt += `- Поточний стан: ${cd.currentState}\n`;
      if (cd.demolitionRequired) {
        prompt += `- Потрібен демонтаж: ${cd.demolitionDescription || 'так'}\n`;
      }
      if (cd.floor) {
        prompt += `- Підлога: ${cd.floor.type}`;
        if (cd.floor.coating) prompt += `, покриття ${cd.floor.coating}`;
        if (cd.floor.loadCapacity) prompt += `, навантаження ${cd.floor.loadCapacity} кг/м²`;
        if (cd.floor.antiStatic) prompt += `, антистатика`;
        prompt += `\n`;
      }
      if (cd.fireRating) prompt += `- Протипожежна система: обов'язково (спринклери, сповіщення, евакуація)\n`;
      if (cd.hvac) prompt += `- Промислова вентиляція: так\n`;
      if (cd.heavyDutyElectrical) prompt += `- Промислова електрика (3-фази, висока потужність): так\n`;
      if (cd.accessControl) prompt += `- Контроль доступу: так\n`;
      if (cd.surveillance) prompt += `- Відеоспостереження: так\n`;
    }

    // ⚡ Інженерні системи — для всіх типів
    if (wd.utilities) {
      const u = wd.utilities;
      prompt += `\n## ІНЖЕНЕРНІ СИСТЕМИ\n`;
      if (u.electrical) {
        prompt += `- Електрика: ${u.electrical.power}`;
        if (u.electrical.capacity) prompt += `, ${u.electrical.capacity} кВт`;
        prompt += `, розеток: ${u.electrical.outlets}, вимикачів: ${u.electrical.switches}, точок освітлення: ${u.electrical.lightPoints}\n`;
        if (u.electrical.outdoorLighting) prompt += `- Вуличне освітлення: так\n`;
        if (u.electrical.needsConnection) {
          prompt += `- Потрібно підключення електрики (відстань ${u.electrical.connectionDistance ?? '?'} м)\n`;
        }
        if (u.electrical.needsTransformer) prompt += `- Потрібна трансформаторна підстанція\n`;
      }
      if (u.heating) {
        prompt += `- Опалення: ${u.heating.type}`;
        if (u.heating.boilerPower) prompt += `, котел ${u.heating.boilerPower} кВт`;
        if (u.heating.radiators) prompt += `, ${u.heating.radiators} радіаторів`;
        prompt += `\n`;
        if (u.heating.underfloor) {
          prompt += `- Тепла підлога: ${u.heating.underfloorArea ?? '?'} м²\n`;
        }
        if (u.heating.needsGasConnection) {
          prompt += `- Потрібно підключення газу (відстань ${u.heating.gasConnectionDistance ?? '?'} м)\n`;
        }
      }
      if (u.water) {
        const ws: string[] = [];
        if (u.water.coldWater) ws.push('холодна');
        if (u.water.hotWater) ws.push('гаряча');
        prompt += `- Вода: ${ws.join(' + ') || 'немає'}, джерело: ${u.water.source}\n`;
        if (u.water.boilerType && u.water.boilerType !== 'none') {
          prompt += `- Бойлер: ${u.water.boilerType}${u.water.boilerVolume ? ` ${u.water.boilerVolume}л` : ''}\n`;
        }
        if (u.water.needsConnection) {
          prompt += `- Потрібно підключення води (відстань ${u.water.connectionDistance ?? '?'} м)\n`;
        }
        if (u.water.needsPump) prompt += `- Потрібна насосна станція\n`;
      }
      if (u.sewerage) {
        prompt += `- Каналізація: ${u.sewerage.type}\n`;
        if (u.sewerage.needsLift) prompt += `- Потрібна каналізаційна підіймальна установка\n`;
        if (u.sewerage.pumpNeeded) prompt += `- Потрібен фекальний насос\n`;
      }
      if (u.ventilation) {
        const v: string[] = [];
        if (u.ventilation.natural) v.push('природна');
        if (u.ventilation.forced) v.push('примусова');
        if (u.ventilation.recuperation) v.push('рекуперація');
        if (v.length) prompt += `- Вентиляція: ${v.join(', ')}\n`;
      }
    }

    // 🎨 Оздоблення — детальна розбивка з конкретними площами
    if (wd.finishing) {
      const f = wd.finishing;
      prompt += `\n## ОЗДОБЛЕННЯ (ДЕТАЛЬНО)\n`;
      if (f.walls) {
        prompt += `- Стіни: ${f.walls.material}, клас ${f.walls.qualityLevel}`;
        if (f.walls.tileArea) prompt += `, плитка на стінах: ${f.walls.tileArea} м²`;
        prompt += `\n`;
      }
      if (f.flooring) {
        prompt += `- ПІДЛОГА (використовуй ЦІ площі як quantity для розрахунків):\n`;
        if (f.flooring.tile) prompt += `  • Плитка: ${f.flooring.tile} м² (клей + затирка + укладання)\n`;
        if (f.flooring.laminate) prompt += `  • Ламінат: ${f.flooring.laminate} м² (підкладка + укладання)\n`;
        if (f.flooring.parquet) prompt += `  • Паркет: ${f.flooring.parquet} м² (клей/лаги + укладання + лакування)\n`;
        if (f.flooring.vinyl) prompt += `  • Вініл: ${f.flooring.vinyl} м² (клей + укладання)\n`;
        if (f.flooring.carpet) prompt += `  • Ковролін: ${f.flooring.carpet} м² (укладання)\n`;
        if (f.flooring.epoxy) prompt += `  • Епоксидна підлога: ${f.flooring.epoxy} м² (ґрунт + 2 шари)\n`;
        const totalFlooring = Object.values(f.flooring).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0);
        if (totalFlooring > 0) prompt += `  ЗАГАЛОМ підлоги: ${totalFlooring} м² (+ стяжка під ВСЮ площу)\n`;
      }
      if (f.ceiling) {
        prompt += `- Стеля: ${f.ceiling.type}`;
        if (f.ceiling.levels) prompt += `, рівнів: ${f.ceiling.levels}`;
        if (f.ceiling.lighting) prompt += `, освітлення: ${f.ceiling.lighting}`;
        prompt += `\n`;
      }
      if (f.preparation?.needsSpackle) {
        prompt += `- Підготовка: потрібна шпаклівка стін\n`;
      }
    }

    // 🚪 Вікна та двері
    if (wd.openings) {
      const o = wd.openings;
      prompt += `\n## ВІКНА ТА ДВЕРІ\n`;
      if (o.windows) {
        prompt += `- Вікна: ${o.windows.count} шт`;
        if (o.windows.totalArea) prompt += ` (${o.windows.totalArea} м²)`;
        prompt += `, ${o.windows.type}, склопакет: ${o.windows.glazing}\n`;
      }
      if (o.doors) {
        prompt += `- Двері: вхідних ${o.doors.entrance}, міжкімнатних ${o.doors.interior}, тип: ${o.doors.type}\n`;
      }
    }

    if (wd.specialRequirements) {
      prompt += `\n## ОСОБЛИВІ ВИМОГИ\n${wd.specialRequirements}\n`;
    }

    // Вже згенеровані секції — перелік позицій для запобігання дублюванню
    if (previousSections.length > 0) {
      prompt += `\n## ⚠️ ВЖЕ ЗГЕНЕРОВАНІ ПОЗИЦІЇ (НЕ ДУБЛЮЙ!)\n`;
      prompt += `Наступні позиції вже є в інших секціях. НЕ додавай їх повторно:\n`;
      for (const s of previousSections) {
        // Show top items (up to 10 per section to avoid token bloat)
        const topItems = s.items.slice(0, 10).map(i => i.description).join(', ');
        prompt += `- [${s.title}]: ${topItems}${s.items.length > 10 ? ` (+${s.items.length - 10} ін.)` : ''}\n`;
      }
      prompt += `\n`;
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
