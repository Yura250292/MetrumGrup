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
    }>;
    priceDatabase: Map<string, number>; // category → avg price
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

      // 🆕 ПОВНОЦІННИЙ ТЕКСТОВИЙ ПОШУК через prozorro.gov.ua
      // Старий /api/2.5/tenders ігнорує фільтри і повертає тендери з 2015 року
      const tenders = await prozorroClient.searchTendersByText({
        text: searchQuery,
        perPage: 10,
        status: 'complete', // тільки завершені для відомих фінальних цін
      });

      console.log(`📊 Знайдено ${tenders.length} релевантних тендерів за запитом "${searchQuery}"`);

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

      // Топ схожі проекти — ВСІ тендери з повними даними
      const topSimilarProjects = tenders
        .slice(0, 10)
        .map(t => {
          const tenderKey = t.tenderID || t.id || '';
          const parsed = parsedEstimates.find(e => e.tenderId === tenderKey);
          // Беремо ціну: спершу awarded (фінальна), потім value (стартова)
          const awardedAmount = t.awards?.find((a: any) => a.status === 'active')?.value?.amount;
          const budget = awardedAmount || t.value?.amount || 0;

          return {
            title: t.title || t.tenderID || 'Без назви',
            budget,
            similarity: 85, // TODO: розрахувати реальну схожість через embeddings
            itemsCount: parsed?.totalItems || 0,
            tenderID: t.tenderID || t.id,
            procuringEntity: t.procuringEntity?.name || '',
            datePublished: t.datePublished,
            status: t.status,
          };
        })
        .filter(p => p.budget > 0);

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

    // 🆕 Визначити рівень цін на основі ВСІХ тендерів з валідною ціною
    // (бюджет беремо з awarded або value)
    const tenderBudgets = tenders.map(t => {
      const awardedAmount = t.awards?.find((a: any) => a.status === 'active')?.value?.amount;
      return awardedAmount || t.value?.amount || 0;
    }).filter(b => b > 0);

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

    console.log(`✅ Prozorro: ${tenders.length} тендерів, ${tenderBudgets.length} з ціною, середня ${avgBudget.toFixed(0)} ₴, ${parsedEstimates.length} розпарсено`);

    return {
      similarProjectsFound: tenders.length,
      totalItemsParsed,
      averagePriceLevel,
      topSimilarProjects,
      priceDatabase,
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
}
