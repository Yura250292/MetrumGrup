/**
 * Валідатор цін для перевірки реалістичності кошторису
 */

import { EstimateSection } from './base-agent';

interface ProjectContext {
  totalArea?: number;
  buildingType?: string;
  floors?: number;
}

interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
  expectedRange?: {
    min: number;
    max: number;
  };
}

/**
 * Мінімальні та максимальні ціни за м² для різних типів будівель (₴/м²)
 * Джерело: ринкові дані України 2024-2026
 */
const PRICE_RANGES_PER_SQM = {
  commercial: {
    min: 35000,  // Мінімум для комерційної нерухомості
    max: 120000, // Максимум для premium комерції
    typical: 65000 // Типова ціна
  },
  industrial: {
    min: 25000,
    max: 80000,
    typical: 45000
  },
  residential: {
    min: 20000,
    max: 100000,
    typical: 40000
  },
  warehouse: {
    min: 15000,
    max: 50000,
    typical: 28000
  }
};

/**
 * Валідація загальної вартості кошторису
 */
export function validateTotalCost(
  sections: EstimateSection[],
  wizardData: any
): ValidationResult {
  const totalCost = sections.reduce((sum, s) => sum + s.sectionTotal, 0);

  // Витягти параметри проекту
  const projectContext: ProjectContext = {
    totalArea: wizardData.totalArea || wizardData.area || 0,
    buildingType: wizardData.buildingType || 'commercial',
    floors: wizardData.floors || 1
  };

  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!projectContext.totalArea || projectContext.totalArea === 0) {
    return {
      isValid: true,
      warnings: ['⚠️ Площа проекту не вказана - не можу валідувати вартість'],
      suggestions: []
    };
  }

  // Визначити діапазон цін для типу будівлі
  const buildingTypeKey = projectContext.buildingType?.toLowerCase() || 'commercial';
  const priceRange = PRICE_RANGES_PER_SQM[buildingTypeKey as keyof typeof PRICE_RANGES_PER_SQM]
    || PRICE_RANGES_PER_SQM.commercial;

  const expectedMin = projectContext.totalArea * priceRange.min;
  const expectedMax = projectContext.totalArea * priceRange.max;
  const expectedTypical = projectContext.totalArea * priceRange.typical;

  const costPerSqm = totalCost / projectContext.totalArea;

  console.log(`\n💰 Валідація вартості кошторису:`);
  console.log(`   Площа: ${projectContext.totalArea} м²`);
  console.log(`   Тип: ${projectContext.buildingType}`);
  console.log(`   Загальна вартість: ${totalCost.toFixed(0)} ₴`);
  console.log(`   Вартість за м²: ${costPerSqm.toFixed(0)} ₴/м²`);
  console.log(`   Очікуваний діапазон: ${priceRange.min.toLocaleString()}-${priceRange.max.toLocaleString()} ₴/м²`);

  // Перевірка чи ціна занадто низька
  if (costPerSqm < priceRange.min * 0.3) {
    warnings.push(
      `🚨 КРИТИЧНО НИЗЬКА ЦІНА: ${costPerSqm.toFixed(0)} ₴/м² (очікується мінімум ${priceRange.min.toLocaleString()} ₴/м²)`
    );
    suggestions.push(
      `Для ${buildingTypeKey} будівлі ${projectContext.totalArea}м² очікувана вартість: ${expectedTypical.toLocaleString()} ₴ (${priceRange.typical.toLocaleString()} ₴/м²)`
    );
    suggestions.push(
      `Можливі причини: AI недооцінив обсяги робіт, пропустив важливі розділи, або використав застарілі ціни`
    );

    return {
      isValid: false,
      warnings,
      suggestions,
      expectedRange: {
        min: expectedMin,
        max: expectedMax
      }
    };
  }

  if (costPerSqm < priceRange.min * 0.7) {
    warnings.push(
      `⚠️ НИЗЬКА ЦІНА: ${costPerSqm.toFixed(0)} ₴/м² (очікується ${priceRange.min.toLocaleString()}-${priceRange.max.toLocaleString()} ₴/м²)`
    );
    suggestions.push(
      `Рекомендована вартість для ${buildingTypeKey}: ${expectedTypical.toLocaleString()} ₴`
    );
  }

  if (costPerSqm > priceRange.max * 1.3) {
    warnings.push(
      `⚠️ ВИСОКА ЦІНА: ${costPerSqm.toFixed(0)} ₴/м² (очікується ${priceRange.min.toLocaleString()}-${priceRange.max.toLocaleString()} ₴/м²)`
    );
  }

  // Все ок
  if (warnings.length === 0) {
    console.log(`   ✅ Ціна в межах норми`);
  }

  return {
    isValid: warnings.length === 0 || costPerSqm >= priceRange.min * 0.7,
    warnings,
    suggestions,
    expectedRange: {
      min: expectedMin,
      max: expectedMax
    }
  };
}

/**
 * Застосувати коефіцієнт масштабування якщо ціна занадто низька
 */
export function applyScalingIfNeeded(
  sections: EstimateSection[],
  wizardData: any
): { sections: EstimateSection[]; scaled: boolean; factor: number } {
  const validation = validateTotalCost(sections, wizardData);

  if (!validation.isValid && validation.expectedRange) {
    const currentTotal = sections.reduce((sum, s) => sum + s.sectionTotal, 0);
    const targetTotal = (validation.expectedRange.min + validation.expectedRange.max) / 2;
    const scalingFactor = targetTotal / currentTotal;

    console.log(`\n📊 Застосування коефіцієнту масштабування: ${scalingFactor.toFixed(2)}x`);
    console.log(`   Було: ${currentTotal.toFixed(0)} ₴`);
    console.log(`   Стало: ${targetTotal.toFixed(0)} ₴`);

    const scaledSections = sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        unitPrice: item.unitPrice * scalingFactor,
        laborCost: item.laborCost * scalingFactor,
        totalCost: item.totalCost * scalingFactor
      })),
      sectionTotal: section.sectionTotal * scalingFactor
    }));

    return {
      sections: scaledSections,
      scaled: true,
      factor: scalingFactor
    };
  }

  return {
    sections,
    scaled: false,
    factor: 1
  };
}
