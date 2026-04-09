/**
 * Базовий клас для спеціалізованих агентів кошторису
 */

import { MaterialWithPrice } from '../materials-database-extended';
import { WorkItemWithPrice } from '../work-items-database-extended';
import { searchMaterialPrice, searchLaborCost } from '../price-search';
import { ragSearch, getExtractedProjectData, isProjectVectorized } from '../rag/vectorizer';
import { findSimilarPrices, getRecommendedPrice, type PriceReference } from '../prozorro-price-reference';
import type { ProjectFacts } from '../project-facts/types';
import type { EngineCategory, EngineItem } from '../quantity-engine/types';
import { formatEngineItemsForPrompt, runQuantityEngine } from '../quantity-engine';
import { mergeEngineAndLlm } from '../quantity-engine/merge';
import { lookupPrice } from '../price-engine';

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
  masterContext?: string; // 🆕 Комплексний аналіз всіх даних
  projectFacts?: ProjectFacts; // 🆕 Нормалізовані факти проекту з джерелами
}

export interface EstimateItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  laborCost: number;
  totalCost: number;
  priceSource: string; // "Google Search (Епіцентр)" або "База матеріалів" або "Prozorro"
  confidence: number; // 0-1
  notes?: string;
  prozorroReferences?: PriceReference[]; // 🆕 Посилання на схожі позиції з Prozorro
  // 🆕 Quantity engine metadata (Phase 3.2). Persisted to DB.
  itemType?: 'material' | 'labor' | 'equipment' | 'composite';
  engineKey?: string;
  quantityFormula?: string;
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
   * Запустити quantity engine для категорії агента.
   * Повертає список детермінованих позицій або порожній масив, якщо
   * `projectFacts` недоступні чи engine впав.
   */
  protected runEngine(
    category: EngineCategory | null,
    context: AgentContext
  ): EngineItem[] {
    if (!category || !context.projectFacts || !context.wizardData) return [];
    try {
      const result = runQuantityEngine(category, {
        facts: context.projectFacts,
        wizardData: context.wizardData,
      });
      if (result.items.length > 0) {
        console.log(
          `🔧 [${this.config.name}] Quantity engine produced ${result.items.length} items for ${category}`
        );
      }
      return result.items;
    } catch (e) {
      console.warn(`⚠️ [${this.config.name}] Quantity engine failed:`, e);
      return [];
    }
  }

  /**
   * Збагатити позиції секції цінами через price-engine (Plan Stage 4).
   *
   * Замінює дублювання `enrichWithPrices` у 5+ агентах єдиним пайплайном:
   *   catalog → prozorro → scrape (stub) → llm-fallback
   *
   * Працює тільки з позиціями, які мають низьку confidence або відсутню
   * ціну. Підвищувати confidence через "звичайний" пошук уже не дублюємо.
   */
  protected async enrichWithPriceEngine(output: AgentOutput): Promise<AgentOutput> {
    const enriched: EstimateItem[] = [];
    let updatedCount = 0;
    for (const item of output.items) {
      // Skip items that already have a confident price.
      if (item.priceSource && item.confidence >= 0.75 && item.unitPrice > 0) {
        enriched.push(item);
        continue;
      }
      try {
        const priceResult = await lookupPrice({
          description: item.description,
          unit: item.unit,
          canonicalKey: item.engineKey,
          kind: item.itemType === 'labor' ? 'labor' : 'material',
        });
        if (priceResult && priceResult.confidence > (item.confidence ?? 0)) {
          const updated: EstimateItem = {
            ...item,
            unitPrice: priceResult.unitPrice > 0 ? priceResult.unitPrice : item.unitPrice,
            laborCost: priceResult.laborCost ?? item.laborCost ?? 0,
            priceSource: priceResult.source,
            confidence: priceResult.confidence,
          };
          updated.totalCost = updated.quantity * updated.unitPrice + (updated.laborCost ?? 0);
          enriched.push(updated);
          updatedCount++;
        } else {
          enriched.push(item);
        }
      } catch (e) {
        console.warn(
          `[${this.config.name}] price-engine lookup failed for "${item.description}":`,
          e
        );
        enriched.push(item);
      }
    }
    if (updatedCount > 0) {
      console.log(
        `💰 [${this.config.name}] price-engine: enriched ${updatedCount}/${output.items.length} items`
      );
    }
    const newTotal = enriched.reduce((s, i) => s + (i.totalCost ?? 0), 0);
    return { ...output, items: enriched, totalCost: newTotal };
  }

  /**
   * Об'єднати детерміновані позиції від engine з відповіддю LLM.
   * Engine items зберігаються 1:1 (quantity/unit/description), LLM лише
   * додає net-new позиції та постачає ціни.
   */
  protected mergeWithEngine(
    engineItems: EngineItem[],
    output: AgentOutput
  ): AgentOutput {
    if (engineItems.length === 0) return output;
    const mergedItems = mergeEngineAndLlm(engineItems, output.items);
    const newTotal = mergedItems.reduce((s, i) => s + (i.totalCost ?? 0), 0);
    return {
      ...output,
      items: mergedItems,
      totalCost: newTotal,
    };
  }

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
   * 🆕 Пошук ціни з Prozorro розпарсених кошторисів
   * Використовує реальні дані з завершених тендерів
   */
  protected async getProzorroPrice(
    itemDescription: string,
    unit: string
  ): Promise<{
    price: number;
    source: string;
    confidence: number;
    references?: PriceReference[];
  } | null> {
    try {
      const recommendation = await getRecommendedPrice(itemDescription, unit, {
        maxAge: 12,          // Останні 12 місяців
        applyInflation: true, // Застосувати інфляцію для старих даних
        minSimilarity: 65,    // Мінімум 65% схожості
      });

      if (!recommendation) {
        return null; // Не знайдено схожих позицій
      }

      // Мапінг confidence
      const confidenceMap = {
        high: 0.9,
        medium: 0.75,
        low: 0.6,
      };

      const source = `Prozorro (${recommendation.statistics.count} тендерів, медіана)`;

      console.log(`💰 Prozorro ціна для "${itemDescription}": ${recommendation.price} ₴ (confidence: ${recommendation.confidence})`);

      return {
        price: recommendation.price,
        source,
        confidence: confidenceMap[recommendation.confidence],
        references: recommendation.references,
      };
    } catch (error) {
      console.warn(`⚠️ Помилка пошуку Prozorro ціни для "${itemDescription}":`, error);
      return null;
    }
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
   * Отримати контекст про реальні ціни будівництва
   */
  protected getPriceContext(context: AgentContext): string {
    // Конвертувати area в число (може прийти як string)
    const areaRaw = context.wizardData?.totalArea || context.wizardData?.area || 0;
    const area = typeof areaRaw === 'string' ? parseFloat(areaRaw) : areaRaw;
    const buildingType = context.wizardData?.buildingType || 'commercial';

    if (!area || area === 0 || isNaN(area)) {
      return `
⚠️ КРИТИЧНА ПОМИЛКА - ПЛОЩА НЕ ВКАЗАНА!

Площа проекту = 0 або не вказана.
БЕЗ ПЛОЩІ НЕМОЖЛИВО РОЗРАХУВАТИ КОШТОРИС!

🚨 НЕ ВИКОРИСТОВУЙ ДЕФОЛТНУ ПЛОЩУ 150м²!
🚨 Попроси користувача вказати площу проекту.
`;
    }

    return `
⚠️ ВАЖЛИВО - МАСШТАБ ПРОЕКТУ ТА РЕАЛЬНІ ЦІНИ:

Площа проекту: ${area} м²
Тип будівлі: ${buildingType}

АКТУАЛЬНІ РИНКОВІ ЦІНИ БУДІВНИЦТВА В УКРАЇНІ (КВІТЕНЬ 2026):

📊 КОМЕРЦІЙНА НЕРУХОМІСТЬ (офіси, магазини, ТРЦ):
- Торгові центри: 40,000 ₴/м² (~$1,000/м²) [СТАНДАРТ]
- Офіси/магазини: 32,000-48,000 ₴/м² ($800-1,200/м²)
- Модульні: 22,000-28,000 ₴/м² ($550-700/м²)

🏠 ЖИТЛОВА НЕРУХОМІСТЬ:
- Під ключ: 22,000-32,000 ₴/м² ($550-800/м²)
- Модульні будинки: 20,000-25,000 ₴/м² ($500-625/м²)

🏭 ПРОМИСЛОВІ ОБ'ЄКТИ:
- Промислові будівлі: 24,000-36,000 ₴/м² ($600-900/м²)
- Склади: 20,000-28,000 ₴/м² ($500-700/м²)

🔨 РЕМОНТ КВАРТИР:
- Капітальний: 10,000-15,000 ₴/м² ($250-375/м²)
- Під ключ преміум: 15,000-25,000 ₴/м² ($375-625/м²)

💥 ДЕМОНТАЖ (додатково):
- Промислова будівля: 150-200 ₴/м² (~$4-5/м²)
- Житловий будинок: 200-300 ₴/м² (~$5-7/м²)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ДЛЯ ЦЬОГО ПРОЕКТУ (${area} м² ${buildingType}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${buildingType === 'commercial'
  ? `Очікувана ЗАГАЛЬНА вартість: ${Math.round(area * 40000).toLocaleString()} ₴ (~$${Math.round(area * 1000).toLocaleString()})
📌 Базова ставка: 40,000 ₴/м² (торговий центр стандарт)
📌 З демонтажем додай: ${Math.round(area * 150).toLocaleString()} ₴`
  : buildingType === 'residential'
  ? `Очікувана ЗАГАЛЬНА вартість: ${Math.round(area * 26000).toLocaleString()} ₴ (~$${Math.round(area * 650).toLocaleString()})
📌 Базова ставка: 26,000 ₴/м² (житловий будинок стандарт)
📌 З демонтажем додай: ${Math.round(area * 250).toLocaleString()} ₴`
  : buildingType === 'industrial'
  ? `Очікувана ЗАГАЛЬНА вартість: ${Math.round(area * 30000).toLocaleString()} ₴ (~$${Math.round(area * 750).toLocaleString()})
📌 Базова ставка: 30,000 ₴/м² (промисловий об'єкт стандарт)`
  : `Очікувана ЗАГАЛЬНА вартість: ${Math.round(area * 24000).toLocaleString()} ₴ (~$${Math.round(area * 600).toLocaleString()})
📌 Базова ставка: 24,000 ₴/м² (склад стандарт)`
}

⚠️ КРИТИЧНО ВАЖЛИВО:
• Це орієнтир для ВСЬОГО кошторису (всі розділи разом)
• ТВІЙ РОЗДІЛ = адекватна частка від цієї загальної суми
• НЕ ЗАНИЖУЙ ціни - використовуй реальні ринкові ціни 2026 року
• Приклад: АТБ 1400м² = ~56 млн ₴, а НЕ 3 млн ₴!
`;
  }

  /**
   * Побудувати промпт для AI моделі.
   *
   * Якщо передано `engineItems` — додасться блок з детермінованими позиціями
   * від quantity engine, які LLM зобов'язана зберегти і лише довстановити ціни.
   */
  protected async buildPrompt(
    context: AgentContext,
    engineItems?: EngineItem[]
  ): Promise<string> {
    // Отримати RAG контекст (якщо проект векторизований)
    const ragContext = await this.getRagContext(context);

    // Отримати автоматично витягнуті дані
    const extractedData = await this.getExtractedData(context);

    // Отримати контекст про реальні ціни
    const priceContext = this.getPriceContext(context);

    // Quantity engine block (опціонально)
    const engineBlock = engineItems && engineItems.length > 0
      ? formatEngineItemsForPrompt(engineItems)
      : '';

    return `${this.config.systemPrompt}
${priceContext}

КОНТЕКСТ ПРОЕКТУ:
${this.buildContextBlock(context, extractedData)}

БАЗА МАТЕРІАЛІВ (${this.config.materials.length} позицій):
${this.formatMaterialsDatabase()}

БАЗА РОБІТ (${this.config.workItems.length} позицій):
${this.formatWorkItemsDatabase()}

${this.getPreviousSectionsContext(context)}

${ragContext}
${engineBlock}
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
      block += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      block += `🎯 ДАНІ З WIZARD (ВВЕДЕНІ КОРИСТУВАЧЕМ - НАЙВИЩИЙ ПРІОРИТЕТ!)\n`;
      block += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Конвертувати площу в число
      const areaRaw = context.wizardData.totalArea || context.wizardData.area;
      const area = areaRaw ? (typeof areaRaw === 'string' ? parseFloat(areaRaw) : areaRaw) : null;

      if (area && area > 0 && !isNaN(area)) {
        block += `🏗️ ПЛОЩА ПРОЕКТУ: ${area.toLocaleString()} м²\n`;
      } else {
        block += `⚠️ ПЛОЩА: НЕ ВКАЗАНА (${areaRaw})\n`;
      }

      block += `📊 Тип об'єкту: ${context.wizardData.objectType || context.wizardData.buildingType || 'не вказано'}\n`;
      block += `📐 Поверхів: ${context.wizardData.floors || 'не вказано'}\n`;
      block += `📏 Висота стелі: ${context.wizardData.ceilingHeight || 'не вказано'}\n`;
      block += `🔨 Обсяг робіт: ${context.wizardData.workScope || 'не вказано'}\n\n`;

      // Демонтаж
      const needsDemolition =
        context.wizardData.houseData?.demolitionRequired ||
        context.wizardData.townhouseData?.demolitionRequired ||
        context.wizardData.commercialData?.demolitionRequired ||
        context.wizardData.renovationData?.workRequired?.demolition ||
        context.wizardData.workScope === 'reconstruction';

      if (needsDemolition) {
        block += `🔨 ДЕМОНТАЖ: ПОТРІБЕН\n`;
        const demolitionDesc =
          context.wizardData.houseData?.demolitionDescription ||
          context.wizardData.townhouseData?.demolitionDescription ||
          context.wizardData.commercialData?.demolitionDescription;
        if (demolitionDesc) {
          block += `   Опис: ${demolitionDesc}\n`;
        }
      } else {
        block += `✅ ДЕМОНТАЖ: НЕ ПОТРІБЕН (нова будівля з нуля)\n`;
      }

      block += `\n`;

      // Стіни (для будинків)
      if (context.wizardData.houseData?.walls) {
        block += `🧱 СТІНИ:\n`;
        block += `   Матеріал: ${context.wizardData.houseData.walls.material}\n`;
        block += `   Товщина: ${context.wizardData.houseData.walls.thickness} мм\n`;
        if (context.wizardData.houseData.walls.insulation) {
          block += `   Утеплення: ${context.wizardData.houseData.walls.insulationType}, ${context.wizardData.houseData.walls.insulationThickness} мм\n`;
        }
        block += `\n`;
      } else if (context.wizardData.wallMaterial) {
        block += `🧱 Матеріал стін: ${context.wizardData.wallMaterial}\n\n`;
      }

      // Покрівля (для будинків)
      if (context.wizardData.houseData?.roof) {
        block += `🏠 ПОКРІВЛЯ:\n`;
        block += `   Тип: ${context.wizardData.houseData.roof.type}\n`;
        block += `   Матеріал: ${context.wizardData.houseData.roof.material}\n`;
        if (context.wizardData.houseData.roof.pitchAngle) {
          block += `   Кут нахилу: ${context.wizardData.houseData.roof.pitchAngle}°\n`;
        }
        if (context.wizardData.houseData.roof.insulation) {
          block += `   Утеплення: ${context.wizardData.houseData.roof.insulationThickness} мм\n`;
        }
        block += `\n`;
      }

      // Фундамент (для будинків)
      if (context.wizardData.houseData?.foundation) {
        block += `🏗️ ФУНДАМЕНТ:\n`;
        block += `   Тип: ${context.wizardData.houseData.foundation.type}\n`;
        block += `   Глибина: ${context.wizardData.houseData.foundation.depth} м\n`;
        block += `   Армування: ${context.wizardData.houseData.foundation.reinforcement}\n`;
        if (context.wizardData.houseData.foundation.waterproofing) {
          block += `   Гідроізоляція: ТАК\n`;
        }
        block += `\n`;
      } else if (context.wizardData.foundationType) {
        block += `🏗️ Тип фундаменту: ${context.wizardData.foundationType}\n\n`;
      }

      // Ґрунт та місцевість
      if (context.wizardData.houseData?.terrain) {
        block += `🌍 МІСЦЕВІСТЬ:\n`;
        block += `   Тип ґрунту: ${context.wizardData.houseData.terrain.soilType}\n`;
        block += `   Ґрунтові води: ${context.wizardData.houseData.terrain.groundwaterDepth}\n`;
        block += `   Нахил: ${context.wizardData.houseData.terrain.slope}\n`;
        if (context.wizardData.houseData.terrain.needsDrainage) {
          block += `   ⚠️ Потрібен дренаж\n`;
        }
        block += `\n`;
      }

      // Комерційна нерухомість
      if (context.wizardData.commercialData) {
        block += `🏬 КОМЕРЦІЙНА НЕРУХОМІСТЬ:\n`;
        block += `   Призначення: ${context.wizardData.commercialData.purpose}\n`;
        if (context.wizardData.commercialData.currentState) {
          block += `   Стан: ${context.wizardData.commercialData.currentState}\n`;
        }
        if (context.wizardData.commercialData.floor) {
          block += `   Підлога: ${context.wizardData.commercialData.floor.type}, покриття: ${context.wizardData.commercialData.floor.coating}\n`;
        }
        block += `\n`;
      }

      // Інженерні системи
      if (context.wizardData.utilities) {
        block += `⚡ ІНЖЕНЕРНІ СИСТЕМИ:\n`;
        if (context.wizardData.utilities.electrical) {
          block += `   Електрика: ${context.wizardData.utilities.electrical.power}, ${context.wizardData.utilities.electrical.capacity || '?'} кВт\n`;
        }
        if (context.wizardData.utilities.heating) {
          block += `   Опалення: ${context.wizardData.utilities.heating.type}\n`;
        }
        if (context.wizardData.utilities.water) {
          block += `   Вода: ${context.wizardData.utilities.water.source}\n`;
        }
        block += `\n`;
      }

      block += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      block += `🚨 КРИТИЧНО ВАЖЛИВО:\n`;
      block += `• ВИКОРИСТОВУЙ ТІЛЬКИ ТІ МАТЕРІАЛИ ЩО ВКАЗАНІ ВИЩЕ!\n`;
      block += `• НЕ ВИГАДУЙ СВОЇХ МАТЕРІАЛІВ (газоблок, цегла тощо) ЯКЩО ЇХ НЕМАЄ У WIZARD!\n`;
      block += `• ЯКЩО ДЕМОНТАЖ НЕ ПОТРІБЕН - НЕ ДОДАВАЙ ЖОДНОЇ ПОЗИЦІЇ ДЕМОНТАЖУ!\n`;
      block += `• ДОТРИМУЙСЯ ВКАЗАНОЇ ПЛОЩІ: ${area ? area.toLocaleString() + ' м²' : 'НЕ ВКАЗАНА'}!\n`;
      block += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
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
