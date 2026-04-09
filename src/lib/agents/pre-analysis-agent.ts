/**
 * Pre-Analysis Agent
 * Комплексний аналіз проекту перед генерацією кошторису
 *
 * Аналізує:
 * 1. Wizard Data (опитувалка)
 * 2. Документи через RAG
 * 3. Prozorro тендери
 * 4. Додаткову інформацію
 *
 * Результат: Master Context для AI генерації
 */

import { WizardData } from '../wizard-types';
import { prozorroClient } from '../prozorro-client';
import { extractSearchAttributes } from '../prozorro-matcher';
import { findSimilarPrices, getCategoryPriceStats } from '../prozorro-price-reference';
import { ragSearch, isProjectVectorized } from '../rag/vectorizer';
import { prisma } from '../prisma';
import OpenAI from 'openai';

export interface PreAnalysisInput {
  wizardData: WizardData;
  projectId?: string;
  projectNotes?: string;
  documents: {
    plans?: string[];
    specifications?: string[];
    geology?: string;
    sitePhotos?: string[];
  };
  prozorroSearchQuery?: string; // Опис для пошуку на Prozorro
}

export interface PreAnalysisResult {
  // Загальна інформація
  projectSummary: string;

  // Аналіз Wizard
  wizardAnalysis: {
    objectType: string;
    totalArea: number;
    floors?: number;
    constructionType?: string;
    keyParameters: Record<string, any>;
  };

  // Аналіз документів
  documentsAnalysis: {
    hasDocuments: boolean;
    keyFindings: string[];
    specifications: string[];
    constraints: string[];
  };

  // Аналіз Prozorro
  prozorroAnalysis: {
    similarProjectsFound: number;
    totalItemsParsed: number;
    averagePriceLevel: 'low' | 'medium' | 'high';
    topSimilarProjects: Array<{
      title: string;
      budget: number;
      similarity: number;
      itemsCount: number;
      tenderID?: string;
      procuringEntity?: string;
      datePublished?: string;
      status?: string;
      city?: string;
    }>;
    priceDatabase: Map<string, number>; // category → avg price
    // 🆕 Згруповано за локацією — сума всіх тендерів навколо одного об'єкта
    aggregatedLocations?: Array<{
      location: string;       // "Хмельницький" / "Львів, вул. Зарічанська"
      city: string;
      totalAmount: number;    // сума всіх тендерів у цій локації
      tenderCount: number;
      tenders: Array<{
        title: string;
        amount: number;
        tenderID?: string;
        status: string;
      }>;
    }>;
  };

  // Master Context для AI
  masterContext: string;

  // Рекомендації
  recommendations: string[];
  warnings: string[];
}

export class PreAnalysisAgent {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Виконати комплексний аналіз проекту
   */
  async analyze(input: PreAnalysisInput): Promise<PreAnalysisResult> {
    console.log('🔍 PreAnalysisAgent: Starting comprehensive analysis...');

    const recommendations: string[] = [];
    const warnings: string[] = [];

    // 1️⃣ Аналіз Wizard Data
    console.log('📋 Крок 1/4: Аналіз опитувалки...');
    const wizardAnalysis = this.analyzeWizardData(input.wizardData);

    // 2️⃣ Аналіз документів через RAG
    console.log('📄 Крок 2/4: Аналіз документів...');
    const documentsAnalysis = await this.analyzeDocuments(input);

    // 3️⃣ Аналіз Prozorro тендерів
    console.log('💰 Крок 3/4: Аналіз Prozorro тендерів...');
    const prozorroAnalysis = await this.analyzeProzorroTenders(input);

    if (prozorroAnalysis.similarProjectsFound === 0) {
      warnings.push('Не знайдено схожих проектів на Prozorro. Ціни базуватимуться на Google Search та базі даних.');
    } else {
      recommendations.push(`Знайдено ${prozorroAnalysis.similarProjectsFound} схожих тендерів з ${prozorroAnalysis.totalItemsParsed} позиціями для референсу цін.`);
    }

    // 4️⃣ Створення Master Context
    console.log('🤖 Крок 4/4: Формування master context...');
    const masterContext = await this.buildMasterContext({
      wizardAnalysis,
      documentsAnalysis,
      prozorroAnalysis,
      input,
    });

    // Генерація project summary
    const projectSummary = this.generateProjectSummary({
      wizardAnalysis,
      documentsAnalysis,
      prozorroAnalysis,
    });

    console.log('✅ PreAnalysisAgent: Analysis complete!');

    return {
      projectSummary,
      wizardAnalysis,
      documentsAnalysis,
      prozorroAnalysis,
      masterContext,
      recommendations,
      warnings,
    };
  }

  /**
   * 1️⃣ Аналіз Wizard Data
   */
  private analyzeWizardData(wizardData: WizardData): PreAnalysisResult['wizardAnalysis'] {
    const wd = wizardData as any;
    const totalArea = parseFloat(wd.totalArea || '0');

    const keyParameters: Record<string, any> = {
      objectType: wd.objectType,
      totalArea,
    };

    // Додаткові параметри залежно від типу об'єкта
    if (wd.objectType === 'apartment') {
      keyParameters.rooms = wd.apartmentData?.rooms;
      keyParameters.floor = wd.apartmentData?.floor;
      keyParameters.workScope = wd.apartmentData?.workScope;
    } else if (wd.objectType === 'house') {
      keyParameters.floors = wd.houseData?.floors;
      keyParameters.foundationType = wd.houseData?.foundationType;
      keyParameters.wallMaterial = wd.houseData?.wallMaterial;
    } else if (wd.objectType === 'commercial') {
      keyParameters.purpose = wd.commercialData?.purpose;
      keyParameters.hvac = wd.commercialData?.hvac;
    }

    return {
      objectType: wd.objectType || 'unknown',
      totalArea,
      floors: keyParameters.floors || 1,
      constructionType: keyParameters.wallMaterial || keyParameters.foundationType,
      keyParameters,
    };
  }

  /**
   * 2️⃣ Аналіз документів через RAG
   */
  private async analyzeDocuments(
    input: PreAnalysisInput
  ): Promise<PreAnalysisResult['documentsAnalysis']> {
    const keyFindings: string[] = [];
    const specifications: string[] = [];
    const constraints: string[] = [];

    // Перевірити чи є документи
    const hasPlans = (input.documents.plans?.length || 0) > 0;
    const hasSpecs = (input.documents.specifications?.length || 0) > 0;
    const hasGeology = !!input.documents.geology;
    const hasPhotos = (input.documents.sitePhotos?.length || 0) > 0;

    const hasDocuments = hasPlans || hasSpecs || hasGeology || hasPhotos;

    if (!hasDocuments) {
      return {
        hasDocuments: false,
        keyFindings: ['Документи не надано'],
        specifications: [],
        constraints: [],
      };
    }

    // RAG пошук якщо проект векторизований
    if (input.projectId) {
      try {
        const isVectorized = await isProjectVectorized(input.projectId);

        if (isVectorized) {
          // Пошук специфікацій матеріалів
          const materialsQuery = 'матеріали, специфікації, конструкції, обробка';
          const materialsResults = await ragSearch(materialsQuery, input.projectId, 5, 0.7);

          materialsResults.forEach(result => {
            specifications.push(result.content);
          });

          // Пошук обмежень та вимог
          const constraintsQuery = 'вимоги, обмеження, особливості, умови';
          const constraintsResults = await ragSearch(constraintsQuery, input.projectId, 3, 0.7);

          constraintsResults.forEach(result => {
            constraints.push(result.content);
          });

          keyFindings.push(`RAG: знайдено ${materialsResults.length} специфікацій матеріалів`);
          keyFindings.push(`RAG: знайдено ${constraintsResults.length} обмежень/вимог`);
        }
      } catch (error) {
        console.warn('⚠️ RAG search failed:', error);
      }
    }

    // Додати інформацію про наявні документи
    if (hasPlans) keyFindings.push(`Креслення: ${input.documents.plans!.length} файлів`);
    if (hasSpecs) keyFindings.push(`Специфікації: ${input.documents.specifications!.length} файлів`);
    if (hasGeology) keyFindings.push('Геологічні дані: наявні');
    if (hasPhotos) keyFindings.push(`Фото об'єкта: ${input.documents.sitePhotos!.length} шт`);

    return {
      hasDocuments,
      keyFindings,
      specifications,
      constraints,
    };
  }

  /**
   * 3️⃣ Аналіз Prozorro тендерів
   */
  private async analyzeProzorroTenders(
    input: PreAnalysisInput
  ): Promise<PreAnalysisResult['prozorroAnalysis']> {
    try {
      // Якщо немає пошукового запиту - використати wizard data
      const searchQuery = input.prozorroSearchQuery || this.buildDefaultProzorroQuery(input.wizardData);

      console.log(`🔍 Prozorro search query: "${searchQuery}"`);

      // Атрибути для розрахунків (площа, бюджет)
      const searchAttrs = extractSearchAttributes(
        {
          id: 'temp',
          title: searchQuery,
          description: input.projectNotes || '',
          totalAmount: 0,
          totalMaterials: 0,
          totalLabor: 0,
          sections: [],
        } as any,
        input.wizardData,
        searchQuery
      );

      // 🆕 MULTI-QUERY ПОШУК — кілька запитів паралельно для повного покриття
      // Бо приватні компанії типу АТБ не публікують власні тендери,
      // але всі дотичні роботи (електропостачання, тротуари, благоустрій) — є
      const multiQueries = this.buildMultiQueries(searchQuery);
      console.log(`🔍 Multi-query: ${multiQueries.length} паралельних пошуків`);

      const searchResults = await Promise.all(
        multiQueries.map(q =>
          prozorroClient.searchTendersByText({
            text: q,
            perPage: 20,
          }).catch(() => [])
        )
      );

      // Об'єднуємо та видаляємо дублікати по tenderID
      const seen = new Set<string>();
      const tenders = searchResults.flat().filter(t => {
        const key = t.tenderID || t.id || '';
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`📊 Multi-query: знайдено ${tenders.length} унікальних тендерів`);

      // Перевірка prisma перед використанням
      if (!prisma) {
        console.error('❌ Prisma client not available');
        return this.getEmptyProzorroAnalysis();
      }

      // 🆕 Текстовий пошук повертає tenderID (UA-2025-...) як ідентифікатор
      // Отримати розпарсені кошториси для цих тендерів (якщо є в кеші)
      const tenderIds: string[] = tenders
        .map(t => t.tenderID || t.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      const parsedEstimates = await prisma.prozorroEstimateData.findMany({
        where: {
          tenderId: { in: tenderIds },
          parseStatus: 'success',
        },
        include: {
          items: true,
          tender: true,
        },
        take: 10,
      });

      const totalItemsParsed = parsedEstimates.reduce((sum: number, est: any) => sum + est.totalItems, 0);

      // 🆕 Збагатити кожен тендер: бюджет, локація, ключ
      const enrichedTenders = tenders.map(t => {
        const tenderKey = t.tenderID || t.id || '';
        const parsed = parsedEstimates.find((e: any) => e.tenderId === tenderKey);
        const awardedAmount = t.awards?.find((a: any) => a.status === 'active')?.value?.amount;
        const budget = awardedAmount || t.value?.amount || 0;
        const location = this.extractLocation(t);

        return {
          title: t.title || t.tenderID || 'Без назви',
          budget,
          similarity: 85,
          itemsCount: parsed?.totalItems || 0,
          tenderID: t.tenderID || t.id,
          procuringEntity: t.procuringEntity?.name || '',
          datePublished: t.datePublished,
          status: t.status,
          city: location.city,
          location: location.full,
        };
      }).filter(p => p.budget > 0);

      // Топ-10 для відображення
      const topSimilarProjects = enrichedTenders
        .sort((a, b) => b.budget - a.budget)
        .slice(0, 10)
        .map(({ location, ...rest }) => rest); // прибираємо location з топ-списку

      // 🆕 Групуємо тендери за локацією (місто) — щоб побачити "сукупний кошторис"
      // всіх дотичних робіт навколо одного об'єкта (АТБ)
      const locationGroups = new Map<string, typeof enrichedTenders>();
      for (const t of enrichedTenders) {
        const key = t.city || 'Невідомо';
        if (!locationGroups.has(key)) locationGroups.set(key, []);
        locationGroups.get(key)!.push(t);
      }

      const aggregatedLocations = Array.from(locationGroups.entries())
        .map(([city, tendersInLocation]) => ({
          location: city,
          city,
          totalAmount: tendersInLocation.reduce((sum, t) => sum + t.budget, 0),
          tenderCount: tendersInLocation.length,
          tenders: tendersInLocation
            .sort((a, b) => b.budget - a.budget)
            .map(t => ({
              title: t.title,
              amount: t.budget,
              tenderID: t.tenderID,
              status: t.status,
            })),
        }))
        .filter(g => g.tenderCount > 0 && g.city !== 'Невідомо')
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10); // топ-10 локацій за сумарною вартістю

      console.log(`📍 Згруповано за локаціями: ${aggregatedLocations.length} міст`);

    // Створити price database за категоріями (з розпарсених)
    const priceDatabase = new Map<string, number>();

    for (const estimate of parsedEstimates as any[]) {
      for (const item of (estimate.items || []) as any[]) {
        const category = item.category || 'general';
        const currentAvg = priceDatabase.get(category) || 0;
        const currentCount = priceDatabase.get(`${category}_count`) || 0;

        const newAvg = (currentAvg * currentCount + parseFloat(item.unitPrice.toString())) / (currentCount + 1);

        priceDatabase.set(category, newAvg);
        priceDatabase.set(`${category}_count`, currentCount + 1);
      }
    }

    // Визначити рівень цін на основі тендерів з валідною ціною
    const tenderBudgets = enrichedTenders.map(t => t.budget);
    const avgBudget = tenderBudgets.length > 0
      ? tenderBudgets.reduce((sum, b) => sum + b, 0) / tenderBudgets.length
      : 0;
    const pricePerSqm = avgBudget / (searchAttrs.area || 1);

    let averagePriceLevel: 'low' | 'medium' | 'high';
    if (pricePerSqm < 20000) {
      averagePriceLevel = 'low';
    } else if (pricePerSqm < 40000) {
      averagePriceLevel = 'medium';
    } else {
      averagePriceLevel = 'high';
    }

    console.log(`✅ Prozorro: ${tenders.length} тендерів, ${enrichedTenders.length} з ціною, середня ${avgBudget.toFixed(0)} ₴, ${parsedEstimates.length} розпарсено, ${aggregatedLocations.length} локацій`);

    return {
      similarProjectsFound: tenders.length,
      totalItemsParsed,
      averagePriceLevel,
      topSimilarProjects,
      priceDatabase,
      aggregatedLocations,
    };
    } catch (error) {
      console.error('❌ Помилка аналізу Prozorro тендерів:', error);
      return this.getEmptyProzorroAnalysis();
    }
  }

  /**
   * Порожній результат Prozorro аналізу (fallback)
   */
  private getEmptyProzorroAnalysis(): PreAnalysisResult['prozorroAnalysis'] {
    return {
      similarProjectsFound: 0,
      totalItemsParsed: 0,
      averagePriceLevel: 'medium',
      topSimilarProjects: [],
      priceDatabase: new Map(),
    };
  }

  /**
   * 4️⃣ Створення Master Context
   */
  private async buildMasterContext(params: {
    wizardAnalysis: PreAnalysisResult['wizardAnalysis'];
    documentsAnalysis: PreAnalysisResult['documentsAnalysis'];
    prozorroAnalysis: PreAnalysisResult['prozorroAnalysis'];
    input: PreAnalysisInput;
  }): Promise<string> {
    const { wizardAnalysis, documentsAnalysis, prozorroAnalysis, input } = params;

    let context = `# КОМПЛЕКСНИЙ АНАЛІЗ ПРОЕКТУ\n\n`;

    // Wizard Data
    context += `## 1. ПАРАМЕТРИ З ОПИТУВАЛКИ\n`;
    context += `- Тип об'єкта: ${wizardAnalysis.objectType}\n`;
    context += `- Загальна площа: ${wizardAnalysis.totalArea} м²\n`;
    context += `- Поверхів: ${wizardAnalysis.floors}\n`;
    if (wizardAnalysis.constructionType) {
      context += `- Тип конструкції: ${wizardAnalysis.constructionType}\n`;
    }
    context += `\nДодаткові параметри:\n`;
    Object.entries(wizardAnalysis.keyParameters).forEach(([key, value]) => {
      context += `- ${key}: ${value}\n`;
    });

    // Документи
    context += `\n## 2. АНАЛІЗ ДОКУМЕНТІВ\n`;
    if (documentsAnalysis.hasDocuments) {
      context += `Знайдено:\n`;
      documentsAnalysis.keyFindings.forEach(finding => {
        context += `- ${finding}\n`;
      });

      if (documentsAnalysis.specifications.length > 0) {
        context += `\nСпецифікації матеріалів:\n`;
        documentsAnalysis.specifications.slice(0, 3).forEach(spec => {
          context += `- ${spec.substring(0, 200)}...\n`;
        });
      }

      if (documentsAnalysis.constraints.length > 0) {
        context += `\nОбмеження та вимоги:\n`;
        documentsAnalysis.constraints.forEach(constr => {
          context += `- ${constr.substring(0, 200)}...\n`;
        });
      }
    } else {
      context += `Документи не надано. Генерація базується на параметрах з опитувалки.\n`;
    }

    // Prozorro
    context += `\n## 3. АНАЛІЗ PROZORRO ТЕНДЕРІВ\n`;
    if (prozorroAnalysis.similarProjectsFound > 0) {
      context += `Знайдено ${prozorroAnalysis.similarProjectsFound} схожих проектів з ${prozorroAnalysis.totalItemsParsed} позиціями.\n`;
      context += `Рівень цін: ${prozorroAnalysis.averagePriceLevel}\n\n`;

      context += `Топ-5 найбільш схожих проектів:\n`;
      prozorroAnalysis.topSimilarProjects.forEach((proj, i) => {
        context += `${i + 1}. "${proj.title}" - ${proj.budget.toLocaleString()} ₴ (${proj.itemsCount} позицій, схожість ${proj.similarity}%)\n`;
      });

      context += `\n📊 БАЗА ЦІН З PROZORRO (за категоріями):\n`;
      Array.from(prozorroAnalysis.priceDatabase.entries())
        .filter(([key]) => !key.endsWith('_count'))
        .slice(0, 10)
        .forEach(([category, avgPrice]) => {
          context += `- ${category}: ~${avgPrice.toFixed(2)} ₴ (середнє)\n`;
        });

      context += `\n⚠️ ВАЖЛИВО: Використовуй ціни з Prozorro як ПРІОРИТЕТ для всіх позицій!\n`;
    } else {
      context += `Схожих проектів на Prozorro не знайдено.\n`;
      context += `Використовуй Google Search та базу даних для ціноутворення.\n`;
    }

    // Додаткова інформація
    if (input.projectNotes) {
      context += `\n## 4. ДОДАТКОВА ІНФОРМАЦІЯ\n`;
      context += `${input.projectNotes}\n`;
    }

    return context;
  }

  /**
   * Генерація короткого резюме проекту
   */
  private generateProjectSummary(params: {
    wizardAnalysis: PreAnalysisResult['wizardAnalysis'];
    documentsAnalysis: PreAnalysisResult['documentsAnalysis'];
    prozorroAnalysis: PreAnalysisResult['prozorroAnalysis'];
  }): string {
    const { wizardAnalysis, documentsAnalysis, prozorroAnalysis } = params;

    let summary = `Проект: ${wizardAnalysis.objectType}, ${wizardAnalysis.totalArea} м²`;

    if (documentsAnalysis.hasDocuments) {
      summary += ` з документацією`;
    }

    if (prozorroAnalysis.similarProjectsFound > 0) {
      summary += `. Знайдено ${prozorroAnalysis.similarProjectsFound} схожих тендерів на Prozorro`;
    }

    return summary;
  }

  /**
   * Побудувати запит для Prozorro якщо не вказано
   */
  private buildDefaultProzorroQuery(wizardData: WizardData): string {
    const objectTypeMap: Record<string, string> = {
      apartment: 'Ремонт квартири',
      house: 'Будівництво будинку',
      townhouse: 'Будівництво таунхаусу',
      commercial: 'Комерційне приміщення',
      office: 'Офісне приміщення',
    };

    let query = objectTypeMap[wizardData.objectType] || 'Будівельні роботи';

    if (wizardData.totalArea) {
      query += ` ${wizardData.totalArea}м²`;
    }

    if (wizardData.objectType === 'commercial' && (wizardData as any).commercialData?.purpose === 'shop') {
      query = 'Магазин супермаркет';
    }

    return query;
  }

  /**
   * 🆕 Будує кілька варіантів пошукового запиту для широкого покриття
   *
   * Приклад: для "Магазин АТБ" повертає:
   *   - "Магазин АТБ"               (точний)
   *   - "будівництво магазину АТБ"  (з типом робіт)
   *   - "АТБ електропостачання"     (інфраструктура)
   *   - "АТБ благоустрій"           (територія)
   *   - "АТБ-Маркет"                (юр. назва)
   */
  private buildMultiQueries(searchQuery: string): string[] {
    const trimmed = searchQuery.trim();
    const queries = new Set<string>([trimmed]);

    // Якщо в запиті згадується "АТБ" — додаємо варіанти
    if (/АТБ/i.test(trimmed)) {
      queries.add('будівництво магазину АТБ');
      queries.add('АТБ-Маркет');
      queries.add('електропостачання магазину АТБ');
      queries.add('благоустрій АТБ');
    }
    // Якщо згадується "магазин" або "супермаркет"
    else if (/магазин|супермаркет/i.test(trimmed)) {
      queries.add(`будівництво ${trimmed}`);
      queries.add(`електропостачання ${trimmed}`);
      queries.add(`благоустрій ${trimmed}`);
    }
    // Загальне будівництво
    else {
      queries.add(`будівництво ${trimmed}`);
      queries.add(`реконструкція ${trimmed}`);
    }

    return Array.from(queries).slice(0, 5); // максимум 5 запитів
  }

  /**
   * 🆕 Витягує локацію з тендера: спочатку пробує parsing title, потім fallback
   * на procuringEntity.address
   */
  private extractLocation(tender: any): { city?: string; full: string } {
    const title = (tender.title || '') as string;

    // 1. Місто з тайтлу: "м. Хмельницький", "м.Київ", "в м. Ужгороді"
    const cityFromTitle = title.match(/м\.\s*([А-ЯЇЄІҐ][А-ЯЇЄІҐа-яїєіґʼ\-]+)/);

    let city = cityFromTitle?.[1];

    // Нормалізуємо словоформи: "Хмельницькому" → "Хмельницький"
    if (city) {
      city = city
        .replace(/ому$/, 'ий')
        .replace(/ові$/, 'ів')
        .replace(/і$/, '')
        .replace(/у$/, '')
        .replace(/а$/, '');
    }

    // 2. Якщо нема — fallback на адресу замовника
    if (!city && tender.procuringEntity?.address?.locality) {
      const locality = tender.procuringEntity.address.locality as string;
      // прибираємо префікси типу "село", "місто"
      city = locality
        .replace(/^(село|місто|с\.|м\.)\s+/i, '')
        .trim();
    }

    // 3. Витягуємо вулицю з тайтлу для повної адреси
    const streetMatch = title.match(/вул(?:иц[яі])?\.?\s*([А-ЯЇЄІҐ][А-ЯЇЄІҐа-яїєіґʼ\-\s]*?)(?:[,\s]\s*\d|[,;]|$)/);
    const street = streetMatch?.[1]?.trim();

    const full = [city, street && `вул. ${street}`].filter(Boolean).join(', ') || 'Невідомо';

    return { city, full };
  }
}
