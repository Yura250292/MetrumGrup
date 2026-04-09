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
 * Джерело: Актуальні ринкові дані України 2026
 * Оновлено: квітень 2026
 */
const PRICE_RANGES_PER_SQM = {
  commercial: {
    min: 32000,  // Модульні комерційні будівлі ($800/м²)
    max: 48000,  // Торгові центри, офіси преміум ($1200/м²)
    typical: 40000 // Торгові центри стандарт ($1000/м²)
  },
  industrial: {
    min: 24000,  // Промислові об'єкти базові ($600/м²)
    max: 36000,  // Промислові об'єкти складні ($900/м²)
    typical: 30000 // Типова промислова будівля ($750/м²)
  },
  residential: {
    min: 22000,  // Модульні будинки ($550/м²)
    max: 32000,  // Класичне будівництво під ключ ($800/м²)
    typical: 26000 // Стандартний будинок ($650/м²)
  },
  warehouse: {
    min: 20000,  // Модульні склади ($500/м²)
    max: 28000,  // Склади з обладнанням ($700/м²)
    typical: 24000 // Типовий склад ($600/м²)
  },
  renovation: {
    min: 10000,  // Капітальний ремонт базовий ($250/м²)
    max: 25000,  // Ремонт під ключ преміум ($625/м²)
    typical: 15000 // Капітальний ремонт стандарт ($375/м²)
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

  console.log(`\n💰 Валідація вартості кошторису (Актуальні ціни 2026):`);
  console.log(`   Площа: ${projectContext.totalArea} м²`);
  console.log(`   Тип: ${projectContext.buildingType}`);
  console.log(`   Загальна вартість: ${totalCost.toLocaleString()} ₴ (~$${(totalCost / 40).toLocaleString()})`);
  console.log(`   Вартість за м²: ${costPerSqm.toFixed(0)} ₴/м² (~$${(costPerSqm / 40).toFixed(0)}/м²)`);
  console.log(`   Очікуваний діапазон: ${priceRange.min.toLocaleString()}-${priceRange.max.toLocaleString()} ₴/м²`);
  console.log(`   Очікувана типова ціна: ${priceRange.typical.toLocaleString()} ₴/м²`);

  // Перевірка чи ціна занадто низька
  if (costPerSqm < priceRange.min * 0.3) {
    const typicalInUSD = Math.round(priceRange.typical / 40);
    warnings.push(
      `🚨 КРИТИЧНО НИЗЬКА ЦІНА: ${costPerSqm.toLocaleString()} ₴/м² (~$${Math.round(costPerSqm / 40)}/м²)`
    );
    warnings.push(
      `📊 Очікується мінімум: ${priceRange.min.toLocaleString()} ₴/м² (~$${Math.round(priceRange.min / 40)}/м²)`
    );
    suggestions.push(
      `✅ ПРАВИЛЬНА ЦІНА для ${buildingTypeKey} ${projectContext.totalArea}м²:`
    );
    suggestions.push(
      `   Типова: ${expectedTypical.toLocaleString()} ₴ (~$${Math.round(expectedTypical / 40).toLocaleString()}) при ${priceRange.typical.toLocaleString()} ₴/м²`
    );
    suggestions.push(
      `   Діапазон: ${expectedMin.toLocaleString()}-${expectedMax.toLocaleString()} ₴`
    );
    suggestions.push(
      `💡 Можливі причини занижених цін:`
    );
    suggestions.push(
      `   • AI недооцінив обсяги робіт`
    );
    suggestions.push(
      `   • Пропущені важливі розділи (інженерні системи, опорядження)`
    );
    suggestions.push(
      `   • Використані застарілі або нереалістичні ціни матеріалів`
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
      `⚠️ НИЗЬКА ЦІНА: ${costPerSqm.toLocaleString()} ₴/м² (~$${Math.round(costPerSqm / 40)}/м²)`
    );
    warnings.push(
      `📊 Очікується: ${priceRange.min.toLocaleString()}-${priceRange.max.toLocaleString()} ₴/м²`
    );
    suggestions.push(
      `💡 Рекомендована вартість для ${buildingTypeKey} ${projectContext.totalArea}м²:`
    );
    suggestions.push(
      `   ${expectedTypical.toLocaleString()} ₴ (~$${Math.round(expectedTypical / 40).toLocaleString()}) при ${priceRange.typical.toLocaleString()} ₴/м²`
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
