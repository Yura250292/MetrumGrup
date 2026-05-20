/**
 * Pre-Analysis Agent
 * Комплексний аналіз проекту перед генерацією кошторису
 *
 * Аналізує:
 * 1. Wizard Data (опитувалка)
 * 2. Документи через RAG
 * 3. Додаткову інформацію
 *
 * Результат: Master Context для AI генерації
 */

import { WizardData } from '../wizard-types';
import { ragSearch, isProjectVectorized } from '../rag/vectorizer';
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
    /** Структурований обмір з креслень (Gemini Vision). */
    drawingsVisual?: string;
  };
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
    console.log('📋 Крок 1/3: Аналіз опитувалки...');
    const wizardAnalysis = this.analyzeWizardData(input.wizardData);

    // 2️⃣ Аналіз документів через RAG
    console.log('📄 Крок 2/3: Аналіз документів...');
    const documentsAnalysis = await this.analyzeDocuments(input);

    // 3️⃣ Створення Master Context
    console.log('🤖 Крок 3/3: Формування master context...');
    const masterContext = await this.buildMasterContext({
      wizardAnalysis,
      documentsAnalysis,
      input,
    });

    // Генерація project summary
    const projectSummary = this.generateProjectSummary({
      wizardAnalysis,
      documentsAnalysis,
    });

    console.log('✅ PreAnalysisAgent: Analysis complete!');

    return {
      projectSummary,
      wizardAnalysis,
      documentsAnalysis,
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
    const hasVisual = !!input.documents.drawingsVisual;

    const hasDocuments = hasPlans || hasSpecs || hasGeology || hasPhotos || hasVisual;

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
    if (hasVisual) keyFindings.push('Візуальний обмір креслень: виконано (Gemini Vision)');
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
   * 3️⃣ Створення Master Context
   */
  private async buildMasterContext(params: {
    wizardAnalysis: PreAnalysisResult['wizardAnalysis'];
    documentsAnalysis: PreAnalysisResult['documentsAnalysis'];
    input: PreAnalysisInput;
  }): Promise<string> {
    const { wizardAnalysis, documentsAnalysis, input } = params;

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

    // Примітка: візуальний обмір креслень НЕ дублюється тут — він
    // інжектиться окремо у промпт кожної секції (buildSectionPrompt),
    // щоб не роздувати masterContext і не губитись при компактуванні.

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

    // Додаткова інформація
    if (input.projectNotes) {
      context += `\n## 3. ДОДАТКОВА ІНФОРМАЦІЯ\n`;
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
  }): string {
    const { wizardAnalysis, documentsAnalysis } = params;

    let summary = `Проект: ${wizardAnalysis.objectType}, ${wizardAnalysis.totalArea} м²`;

    if (documentsAnalysis.hasDocuments) {
      summary += ` з документацією`;
    }

    return summary;
  }
}
