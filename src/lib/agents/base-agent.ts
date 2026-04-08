/**
 * Базовий клас для спеціалізованих агентів кошторису
 */

import { MaterialWithPrice } from '../materials-database-extended';
import { WorkItemWithPrice } from '../work-items-database-extended';
import { searchMaterialPrice, searchLaborCost } from '../price-search';
import { ragSearch, getExtractedProjectData, isProjectVectorized } from '../rag/vectorizer';

export interface AgentConfig {
  name: string;
  model: 'gemini' | 'openai';
  category: string;
  systemPrompt: string;
  materials: MaterialWithPrice[];
  workItems: WorkItemWithPrice[];
}

export interface AgentContext {
  projectId?: string; // Для RAG пошуку
  wizardData: any;
  documents: {
    plans?: string[];
    specifications?: string[];
    geology?: string;
    sitePhotos?: string[];
  };
  previousSections?: EstimateSection[];
}

export interface EstimateItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  laborCost: number;
  totalCost: number;
  priceSource: string; // "Google Search (Епіцентр)" або "База матеріалів"
  confidence: number; // 0-1
  notes?: string;
}

export interface EstimateSection {
  title: string;
  items: EstimateItem[];
  sectionTotal: number;
}

export interface AgentOutput {
  sectionTitle: string;
  items: EstimateItem[];
  totalCost: number;
  warnings: string[];
}

/**
 * Абстрактний базовий клас для всіх агентів
 */
export abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Головний метод генерації секції кошторису
   */
  abstract generate(context: AgentContext): Promise<AgentOutput>;

  /**
   * Пошук актуальної ціни через Google Search
   */
  protected async searchPrice(
    materialName: string,
    unit: string
  ): Promise<{ price: number; source: string; confidence: number }> {
    // Спочатку перевіряємо в базі даних
    const dbMaterial = this.config.materials.find(m =>
      m.name.toLowerCase().includes(materialName.toLowerCase()) ||
      m.searchKeywords.some(k => materialName.toLowerCase().includes(k.toLowerCase()))
    );

    // Якщо знайдено в базі - використовуємо як fallback
    const fallbackPrice = dbMaterial?.averagePrice || 0;
    const fallbackSource = dbMaterial ? `База матеріалів (${dbMaterial.brands[0]?.source || 'середнє'})` : 'Невідоме джерело';

    // Спробувати знайти через Google Search (Gemini)
    try {
      const result = await searchMaterialPrice(materialName, unit);

      if (result.confidence > 0.7 && result.averagePrice > 0) {
        const source = result.sources[0]?.shop
          ? `Google Search (${result.sources[0].shop})`
          : 'Google Search';

        return {
          price: result.averagePrice,
          source,
          confidence: result.confidence
        };
      }
    } catch (error) {
      console.warn(`Failed to search price for "${materialName}":`, error);
    }

    // Fallback до бази даних
    return {
      price: fallbackPrice,
      source: fallbackSource,
      confidence: dbMaterial ? 0.7 : 0.3
    };
  }

  /**
   * Пошук вартості робіт через Google Search
   */
  protected async searchLabor(
    workName: string,
    unit: string
  ): Promise<{ laborRate: number; confidence: number }> {
    // Спочатку перевіряємо в базі даних
    const dbWork = this.config.workItems.find(w =>
      w.name.toLowerCase().includes(workName.toLowerCase()) ||
      w.searchKeywords.some(k => workName.toLowerCase().includes(k.toLowerCase()))
    );

    const fallbackRate = dbWork?.laborRate || 0;

    // Спробувати знайти через Google Search
    try {
      const result = await searchLaborCost(workName, unit);

      if (result.confidence > 0.7 && result.laborRate > 0) {
        return {
          laborRate: result.laborRate,
          confidence: result.confidence
        };
      }
    } catch (error) {
      console.warn(`Failed to search labor cost for "${workName}":`, error);
    }

    // Fallback до бази даних
    return {
      laborRate: fallbackRate,
      confidence: dbWork ? 0.7 : 0.3
    };
  }

  /**
   * RAG пошук релевантного контенту для агента
   */
  protected async getRagContext(context: AgentContext): Promise<string> {
    if (!context.projectId) {
      return '';
    }

    try {
      // Перевірити чи проект векторизований
      const vectorized = await isProjectVectorized(context.projectId);
      if (!vectorized) {
        console.warn(`⚠️  Project ${context.projectId} not vectorized, skipping RAG`);
        return '';
      }

      // Пошук релевантних фрагментів для цього агента
      const query = this.buildRagQuery(context);
      const results = await ragSearch(query, context.projectId, 5, 0.7);

      if (results.length === 0) {
        return '';
      }

      // Форматувати результати
      let ragContext = `\n\nРЕЛЕВАНТНА ІНФОРМАЦІЯ З ДОКУМЕНТІВ ПРОЕКТУ:\n`;

      results.forEach((result, idx) => {
        ragContext += `\n[${idx + 1}] Джерело: ${result.fileName} (схожість: ${(result.similarity * 100).toFixed(0)}%)\n`;
        ragContext += `${result.content}\n`;
      });

      ragContext += `\n⚠️ Використовуй ЦЮ інформацію для точніших розрахунків!\n`;

      return ragContext;

    } catch (error) {
      console.error('RAG search failed:', error);
      return '';
    }
  }

  /**
   * Побудувати запит для RAG пошуку (специфічний для кожного агента)
   */
  protected buildRagQuery(context: AgentContext): string {
    // Базовий запит - підкласи можуть перевизначити
    return `${this.config.category} ${this.config.name}`;
  }

  /**
   * Отримати витягнуті дані проекту (автоматично з векторизації)
   */
  protected async getExtractedData(context: AgentContext) {
    if (!context.projectId) {
      return null;
    }

    try {
      return await getExtractedProjectData(context.projectId);
    } catch (error) {
      console.error('Failed to get extracted data:', error);
      return null;
    }
  }

  /**
   * Побудувати промпт для AI моделі
   */
  protected async buildPrompt(context: AgentContext): Promise<string> {
    // Отримати RAG контекст (якщо проект векторизований)
    const ragContext = await this.getRagContext(context);

    // Отримати автоматично витягнуті дані
    const extractedData = await this.getExtractedData(context);

    return `${this.config.systemPrompt}

КОНТЕКСТ ПРОЕКТУ:
${this.buildContextBlock(context, extractedData)}

БАЗА МАТЕРІАЛІВ (${this.config.materials.length} позицій):
${this.formatMaterialsDatabase()}

БАЗА РОБІТ (${this.config.workItems.length} позицій):
${this.formatWorkItemsDatabase()}

${this.getPreviousSectionsContext(context)}

${ragContext}

ІНСТРУКЦІЇ:
1. Використовуй ТІЛЬКИ матеріали з бази або які можна знайти через пошук
2. Вказуй реалістичні ціни відповідно до бази
3. Рахуй totalCost = quantity × unitPrice + laborCost
4. Вказуй джерело ціни в priceSource
5. Якщо впевненість < 0.7 → додай попередження в warnings
6. НЕ ВИГАДУЙ ціни! Використовуй базу або вказуй низьку впевненість

ФОРМАТ ВІДПОВІДІ (JSON):
{
  "sectionTitle": "${this.config.name}",
  "items": [
    {
      "description": "Назва роботи/матеріалу",
      "quantity": 10.5,
      "unit": "м²",
      "unitPrice": 500,
      "laborCost": 200,
      "totalCost": 5450,
      "priceSource": "База матеріалів (Епіцентр)",
      "confidence": 0.85,
      "notes": ""
    }
  ],
  "totalCost": 5450,
  "warnings": []
}`;
  }

  /**
   * Форматувати контекст проекту
   */
  protected buildContextBlock(context: AgentContext, extractedData?: any): string {
    let block = '';

    // Автоматично витягнуті дані (з векторизації)
    if (extractedData) {
      block += `АВТОМАТИЧНО ВИТЯГНУТІ ДАНІ (з аналізу документів):\n`;

      if (extractedData.totalArea) block += `- Площа: ${extractedData.totalArea} м²\n`;
      if (extractedData.floors) block += `- Поверхів: ${extractedData.floors}\n`;
      if (extractedData.floorHeight) block += `- Висота поверху: ${extractedData.floorHeight} м\n`;
      if (extractedData.buildingType) block += `- Тип: ${extractedData.buildingType}\n`;
      if (extractedData.foundationType) block += `- Фундамент: ${extractedData.foundationType}\n`;
      if (extractedData.wallMaterial) block += `- Матеріал стін: ${extractedData.wallMaterial}\n`;
      if (extractedData.roofType) block += `- Покрівля: ${extractedData.roofType}\n`;

      if (extractedData.geology) {
        block += `ГЕОЛОГІЯ:\n`;
        if (extractedData.geology.ugv) block += `  - УГВ: ${extractedData.geology.ugv} м\n`;
        if (extractedData.geology.soilType) block += `  - Грунт: ${extractedData.geology.soilType}\n`;
        if (extractedData.geology.bearingCapacity) block += `  - Несуча здатність: ${extractedData.geology.bearingCapacity} кг/см²\n`;
      }

      if (extractedData.siteCondition) {
        block += `СТАН ОБ'ЄКТА (з фото):\n`;
        block += `  - ${extractedData.siteCondition.description}\n`;
        if (extractedData.siteCondition.needsDemolition) block += `  - ⚠️ Потрібен демонтаж\n`;
      }

      block += `\n`;
    }

    // Wizard дані (пріоритетніші за автоматично витягнуті)
    if (context.wizardData) {
      block += `ДАНІ З WIZARD (введені користувачем):\n`;
      block += `- Площа: ${context.wizardData.totalArea || 'не вказано'} м²\n`;
      block += `- Поверхів: ${context.wizardData.floors || 'не вказано'}\n`;
      block += `- Тип об'єкту: ${context.wizardData.buildingType || 'не вказано'}\n`;
      if (context.wizardData.foundationType) {
        block += `- Тип фундаменту: ${context.wizardData.foundationType}\n`;
      }
      if (context.wizardData.wallMaterial) {
        block += `- Матеріал стін: ${context.wizardData.wallMaterial}\n`;
      }
      block += `\n`;
    }

    // Документи
    if (context.documents) {
      if (context.documents.plans && context.documents.plans.length > 0) {
        block += `ПЛАНИ: ${context.documents.plans.length} файлів\n`;
      }
      if (context.documents.specifications && context.documents.specifications.length > 0) {
        block += `СПЕЦИФІКАЦІЇ: ${context.documents.specifications.length} файлів\n`;
      }
      if (context.documents.geology) {
        block += `ГЕОЛОГІЯ: є\n`;
      }
      if (context.documents.sitePhotos && context.documents.sitePhotos.length > 0) {
        block += `ФОТО: ${context.documents.sitePhotos.length} файлів\n`;
      }
      block += `\n`;
    }

    return block;
  }

  /**
   * Форматувати базу матеріалів для промпту
   */
  protected formatMaterialsDatabase(): string {
    if (this.config.materials.length === 0) {
      return '(немає матеріалів для цієї категорії)';
    }

    return this.config.materials
      .slice(0, 30) // Обмежуємо для розміру промпту
      .map(m => {
        const brandInfo = m.brands[0]
          ? ` | ${m.brands[0].name}: ${m.brands[0].price} ₴ (${m.brands[0].source})`
          : '';
        return `- ${m.name}: ~${m.averagePrice} ₴/${m.unit}${brandInfo}`;
      })
      .join('\n');
  }

  /**
   * Форматувати базу робіт для промпту
   */
  protected formatWorkItemsDatabase(): string {
    if (this.config.workItems.length === 0) {
      return '(немає робіт для цієї категорії)';
    }

    return this.config.workItems
      .slice(0, 25) // Обмежуємо для розміру промпту
      .map(w => `- ${w.name}: ~${w.laborRate} ₴/${w.unit} (${w.complexity})`)
      .join('\n');
  }

  /**
   * Отримати контекст з попередніх секцій
   */
  protected getPreviousSectionsContext(context: AgentContext): string {
    if (!context.previousSections || context.previousSections.length === 0) {
      return '';
    }

    let block = `\nРЕЗУЛЬТАТИ ПОПЕРЕДНІХ АГЕНТІВ:\n`;

    for (const section of context.previousSections) {
      block += `\n${section.title}: ${section.items.length} позицій, ${section.sectionTotal.toFixed(0)} ₴\n`;

      // Показуємо перші кілька позицій для контексту
      section.items.slice(0, 3).forEach(item => {
        block += `  - ${item.description}: ${item.quantity} ${item.unit} × ${item.unitPrice} ₴\n`;
      });

      if (section.items.length > 3) {
        block += `  ... ще ${section.items.length - 3} позицій\n`;
      }
    }

    block += `\nВРАХОВУЙ попередні результати щоб уникнути дублювання робіт!\n`;

    return block;
  }

  /**
   * Валідація результату
   */
  protected validateOutput(output: AgentOutput): string[] {
    const errors: string[] = [];

    if (!output.sectionTitle) {
      errors.push('Відсутня назва секції');
    }

    if (!output.items || output.items.length === 0) {
      errors.push('Секція не містить позицій');
    }

    output.items.forEach((item, index) => {
      if (!item.description) {
        errors.push(`Позиція ${index + 1}: відсутній опис`);
      }

      if (item.quantity === null || item.quantity === undefined || item.quantity <= 0) {
        errors.push(`Позиція ${index + 1} (${item.description}): некоректна кількість`);
      }

      if (item.unitPrice === null || item.unitPrice === undefined || item.unitPrice < 0) {
        errors.push(`Позиція ${index + 1} (${item.description}): некоректна ціна`);
      }

      if (!item.unit) {
        errors.push(`Позиція ${index + 1} (${item.description}): відсутня одиниця виміру`);
      }

      // Перевірка розрахунку totalCost
      const expectedTotal = item.quantity * item.unitPrice + (item.laborCost || 0);
      if (Math.abs(item.totalCost - expectedTotal) > 1) {
        errors.push(
          `Позиція ${index + 1} (${item.description}): ` +
          `некоректний totalCost (${item.totalCost} ₴ замість ${expectedTotal.toFixed(2)} ₴)`
        );
      }

      // Попередження про низьку впевненість
      if (item.confidence < 0.5) {
        errors.push(
          `Позиція ${index + 1} (${item.description}): ` +
          `низька впевненість у ціні (${(item.confidence * 100).toFixed(0)}%)`
        );
      }
    });

    // Перевірка загальної суми
    const calculatedTotal = output.items.reduce((sum, item) => sum + item.totalCost, 0);
    if (Math.abs(output.totalCost - calculatedTotal) > 1) {
      errors.push(
        `Некоректна загальна сума секції: ` +
        `${output.totalCost} ₴ замість ${calculatedTotal.toFixed(2)} ₴`
      );
    }

    return errors;
  }
}
