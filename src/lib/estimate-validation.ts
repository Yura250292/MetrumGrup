/**
 * Estimate Validation System
 * Перевіряє кошториси на галюцинації AI та логічні помилки
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: EstimateStats;
}

export interface ValidationError {
  type: 'CRITICAL' | 'ERROR';
  code: string;
  message: string;
  section?: string;
  itemIndex?: number;
}

export interface ValidationWarning {
  type: 'WARNING' | 'INFO';
  code: string;
  message: string;
  section?: string;
  itemIndex?: number;
}

export interface EstimateStats {
  totalItems: number;
  totalCost: number;
  materialsCost: number;
  laborCost: number;
  itemsPerSquareMeter: number;
  avgPricePerItem: number;
}

/**
 * Перевіряє кошторис на помилки та галюцинації
 */
export function validateEstimate(
  estimate: any,
  context: {
    area: number;
    wizardData?: any;
    files?: number;
  }
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Структурна валідація
  if (!estimate.sections || !Array.isArray(estimate.sections)) {
    errors.push({
      type: 'CRITICAL',
      code: 'MISSING_SECTIONS',
      message: 'Кошторис не містить секцій',
    });
    return { valid: false, errors, warnings, stats: getEmptyStats() };
  }

  // 2. Підрахунок статистики
  const stats = calculateStats(estimate, context.area);

  // 3. Перевірка кількості позицій
  validateItemCount(estimate, context, stats, errors, warnings);

  // 4. Перевірка цін (галюцинації)
  validatePrices(estimate, errors, warnings);

  // 5. Перевірка кількостей
  validateQuantities(estimate, context, errors, warnings);

  // 6. Перевірка на дублікати
  validateDuplicates(estimate, warnings);

  // 7. Перевірка розрахунків (сума)
  validateCalculations(estimate, errors, warnings);

  // 8. Перевірка на заборонені позиції (демонтаж для shell)
  validateForbiddenItems(estimate, context, errors);

  // 9. Перевірка на відповідність wizard даним
  validateWizardCompliance(estimate, context, warnings);

  return {
    valid: errors.filter((e) => e.type === 'CRITICAL' || e.type === 'ERROR').length === 0,
    errors,
    warnings,
    stats,
  };
}

function calculateStats(estimate: any, area: number): EstimateStats {
  let totalItems = 0;
  let totalCost = 0;
  let materialsCost = 0;
  let laborCost = 0;

  estimate.sections?.forEach((section: any) => {
    section.items?.forEach((item: any) => {
      totalItems++;
      totalCost += item.totalCost || 0;
      materialsCost += (item.quantity || 0) * (item.unitPrice || 0);
      laborCost += item.laborCost || 0;
    });
  });

  return {
    totalItems,
    totalCost,
    materialsCost,
    laborCost,
    itemsPerSquareMeter: area > 0 ? totalItems / area : 0,
    avgPricePerItem: totalItems > 0 ? totalCost / totalItems : 0,
  };
}

function validateItemCount(
  estimate: any,
  context: any,
  stats: EstimateStats,
  errors: ValidationError[],
  warnings: ValidationWarning[]
) {
  const { area, wizardData } = context;

  // Мінімум позицій на м²
  const minItemsPerM2 = 0.8; // Мінімум 0.8 позицій на м² (120 позицій для 150 м²)
  const maxItemsPerM2 = 3.0; // Максимум 3 позиції на м² (450 позицій для 150 м²)

  if (stats.itemsPerSquareMeter < minItemsPerM2) {
    warnings.push({
      type: 'WARNING',
      code: 'TOO_FEW_ITEMS',
      message: `Занадто мало позицій для площі ${area} м². Є ${stats.totalItems}, очікується мінімум ${Math.floor(area * minItemsPerM2)}`,
    });
  }

  if (stats.itemsPerSquareMeter > maxItemsPerM2) {
    warnings.push({
      type: 'WARNING',
      code: 'TOO_MANY_ITEMS',
      message: `Можливо занадто багато позицій для площі ${area} м². Є ${stats.totalItems}, зазвичай не більше ${Math.floor(area * maxItemsPerM2)}`,
    });
  }

  // Перевірка пустих секцій
  estimate.sections.forEach((section: any, idx: number) => {
    if (!section.items || section.items.length === 0) {
      warnings.push({
        type: 'WARNING',
        code: 'EMPTY_SECTION',
        message: `Секція "${section.title}" не містить позицій`,
        section: section.title,
      });
    }
  });
}

function validatePrices(
  estimate: any,
  errors: ValidationError[],
  warnings: ValidationWarning[]
) {
  estimate.sections?.forEach((section: any) => {
    section.items?.forEach((item: any, idx: number) => {
      // Перевірка на нульові/від'ємні ціни
      if (!item.unitPrice || item.unitPrice <= 0) {
        errors.push({
          type: 'ERROR',
          code: 'INVALID_PRICE',
          message: `"${item.name}": ціна ${item.unitPrice} недопустима (має бути > 0)`,
          section: section.title,
          itemIndex: idx,
        });
      }

      // Перевірка на нереалістично низькі ціни (можлива галюцинація)
      if (item.unitPrice > 0 && item.unitPrice < 1) {
        warnings.push({
          type: 'WARNING',
          code: 'SUSPICIOUSLY_LOW_PRICE',
          message: `"${item.name}": ціна ${item.unitPrice} грн виглядає нереалістично низькою. Перевірте!`,
          section: section.title,
          itemIndex: idx,
        });
      }

      // Перевірка на нереалістично високі ціни
      if (item.unitPrice > 100000) {
        warnings.push({
          type: 'WARNING',
          code: 'SUSPICIOUSLY_HIGH_PRICE',
          message: `"${item.name}": ціна ${item.unitPrice} грн виглядає нереалістично високою. Перевірте!`,
          section: section.title,
          itemIndex: idx,
        });
      }

      // Перевірка на "круглі" ціни (часта ознака галюцинації)
      if (item.unitPrice >= 100 && item.unitPrice % 100 === 0) {
        warnings.push({
          type: 'INFO',
          code: 'ROUND_PRICE',
          message: `"${item.name}": ціна ${item.unitPrice} грн "кругла". AI міг її вигадати. Перевірте реальну ціну!`,
          section: section.title,
          itemIndex: idx,
        });
      }
    });
  });
}

function validateQuantities(
  estimate: any,
  context: any,
  errors: ValidationError[],
  warnings: ValidationWarning[]
) {
  const { area, wizardData } = context;

  estimate.sections?.forEach((section: any) => {
    section.items?.forEach((item: any, idx: number) => {
      // Перевірка на нульові/від'ємні кількості
      if (!item.quantity || item.quantity <= 0) {
        errors.push({
          type: 'ERROR',
          code: 'INVALID_QUANTITY',
          message: `"${item.name}": кількість ${item.quantity} недопустима (має бути > 0)`,
          section: section.title,
          itemIndex: idx,
        });
      }

      // Перевірка на нереалістично великі кількості
      // Приклад: 500 розеток для 150 м² - явна помилка
      const name = item.name?.toLowerCase() || '';

      if (name.includes('розетк') && item.quantity > area * 0.8) {
        warnings.push({
          type: 'WARNING',
          code: 'EXCESSIVE_QUANTITY',
          message: `"${item.name}": кількість ${item.quantity} виглядає завеликою для ${area} м² (зазвичай ~0.3-0.5 на м²)`,
          section: section.title,
          itemIndex: idx,
        });
      }

      if (name.includes('вимикач') && item.quantity > area * 0.5) {
        warnings.push({
          type: 'WARNING',
          code: 'EXCESSIVE_QUANTITY',
          message: `"${item.name}": кількість ${item.quantity} виглядає завеликою для ${area} м² (зазвичай ~0.15-0.2 на м²)`,
          section: section.title,
          itemIndex: idx,
        });
      }

      if (name.includes('світильник') && item.quantity > area * 0.4) {
        warnings.push({
          type: 'WARNING',
          code: 'EXCESSIVE_QUANTITY',
          message: `"${item.name}": кількість ${item.quantity} виглядає завеликою для ${area} м²`,
          section: section.title,
          itemIndex: idx,
        });
      }
    });
  });

  // Перевірка на відповідність wizard даним
  if (wizardData?.utilities?.electrical) {
    const outletsFromWizard = wizardData.utilities.electrical.outlets || 0;
    let outletsInEstimate = 0;

    estimate.sections?.forEach((section: any) => {
      section.items?.forEach((item: any) => {
        const name = item.name?.toLowerCase() || '';
        if (name.includes('розетк') && !name.includes('підрозетник')) {
          outletsInEstimate += item.quantity || 0;
        }
      });
    });

    if (outletsInEstimate > 0 && Math.abs(outletsInEstimate - outletsFromWizard) > outletsFromWizard * 0.3) {
      warnings.push({
        type: 'WARNING',
        code: 'WIZARD_MISMATCH',
        message: `Розеток в кошторисі: ${outletsInEstimate}, в wizard: ${outletsFromWizard}. Розбіжність більше 30%!`,
      });
    }
  }
}

function validateDuplicates(estimate: any, warnings: ValidationWarning[]) {
  const itemNames = new Map<string, number>();

  estimate.sections?.forEach((section: any) => {
    section.items?.forEach((item: any, idx: number) => {
      // Нормалізуємо назву (lowercase, без спецсимволів)
      const normalizedName = item.name
        ?.toLowerCase()
        .replace(/[^а-яёa-z0-9\s]/g, '')
        .trim();

      if (normalizedName) {
        const count = itemNames.get(normalizedName) || 0;
        itemNames.set(normalizedName, count + 1);

        if (count > 0) {
          warnings.push({
            type: 'WARNING',
            code: 'POSSIBLE_DUPLICATE',
            message: `"${item.name}": можливий дублікат (схожа назва вже є в кошторисі ${count} раз)`,
            section: section.title,
            itemIndex: idx,
          });
        }
      }
    });
  });
}

function validateCalculations(
  estimate: any,
  errors: ValidationError[],
  warnings: ValidationWarning[]
) {
  estimate.sections?.forEach((section: any) => {
    let sectionTotalCalc = 0;

    section.items?.forEach((item: any, idx: number) => {
      // Перевірка розрахунку позиції
      const expectedTotal =
        (item.quantity || 0) * (item.unitPrice || 0) + (item.laborCost || 0);
      const actualTotal = item.totalCost || 0;

      if (Math.abs(expectedTotal - actualTotal) > 1) {
        // Допуск 1 грн на округлення
        errors.push({
          type: 'ERROR',
          code: 'CALCULATION_ERROR',
          message: `"${item.name}": неправильний totalCost. Має бути ${expectedTotal.toFixed(2)}, а є ${actualTotal}`,
          section: section.title,
          itemIndex: idx,
        });
      }

      sectionTotalCalc += actualTotal;
    });

    // Перевірка суми секції
    if (section.sectionTotal && Math.abs(section.sectionTotal - sectionTotalCalc) > 1) {
      errors.push({
        type: 'ERROR',
        code: 'SECTION_TOTAL_ERROR',
        message: `Секція "${section.title}": неправильний sectionTotal. Має бути ${sectionTotalCalc.toFixed(2)}, а є ${section.sectionTotal}`,
        section: section.title,
      });
    }
  });

  // Перевірка загальної суми
  if (estimate.summary) {
    let totalMaterials = 0;
    let totalLabor = 0;

    estimate.sections?.forEach((section: any) => {
      section.items?.forEach((item: any) => {
        totalMaterials += (item.quantity || 0) * (item.unitPrice || 0);
        totalLabor += item.laborCost || 0;
      });
    });

    if (Math.abs(totalMaterials - estimate.summary.materialsCost) > 1) {
      errors.push({
        type: 'ERROR',
        code: 'SUMMARY_MATERIALS_ERROR',
        message: `Неправильна сума матеріалів в summary. Має бути ${totalMaterials.toFixed(2)}, а є ${estimate.summary.materialsCost}`,
      });
    }

    if (Math.abs(totalLabor - estimate.summary.laborCost) > 1) {
      errors.push({
        type: 'ERROR',
        code: 'SUMMARY_LABOR_ERROR',
        message: `Неправильна сума робіт в summary. Має бути ${totalLabor.toFixed(2)}, а є ${estimate.summary.laborCost}`,
      });
    }
  }
}

function validateForbiddenItems(
  estimate: any,
  context: any,
  errors: ValidationError[]
) {
  const { wizardData } = context;

  // Перевірка чи НЕ потрібен демонтаж
  const demolitionRequired =
    wizardData?.houseData?.demolitionRequired ??
    wizardData?.townhouseData?.demolitionRequired;

  if (demolitionRequired === false) {
    // Користувач ЯВНО вказав що демонтаж НЕ потрібен
    const forbiddenKeywords = [
      'демонтаж',
      'зняття',
      'розбирання',
      'видалення',
      'демонтувати',
      'зняти',
      'розібрати',
      'видалити',
    ];

    estimate.sections?.forEach((section: any) => {
      // Перевірка назви секції
      const sectionName = section.title?.toLowerCase() || '';
      if (forbiddenKeywords.some((kw) => sectionName.includes(kw))) {
        errors.push({
          type: 'CRITICAL',
          code: 'FORBIDDEN_DEMOLITION_SECTION',
          message: `ЗАБОРОНЕНА СЕКЦІЯ: "${section.title}". Користувач вказав що демонтаж НЕ потрібен!`,
          section: section.title,
        });
      }

      // Перевірка позицій
      section.items?.forEach((item: any, idx: number) => {
        const itemName = item.name?.toLowerCase() || '';
        if (forbiddenKeywords.some((kw) => itemName.includes(kw))) {
          errors.push({
            type: 'CRITICAL',
            code: 'FORBIDDEN_DEMOLITION_ITEM',
            message: `ЗАБОРОНЕНА ПОЗИЦІЯ: "${item.name}". Користувач вказав що демонтаж НЕ потрібен!`,
            section: section.title,
            itemIndex: idx,
          });
        }
      });
    });
  }
}

function validateWizardCompliance(
  estimate: any,
  context: any,
  warnings: ValidationWarning[]
) {
  const { wizardData } = context;
  if (!wizardData) return;

  // Перевірка наявності необхідних секцій на основі wizard
  if (wizardData.utilities?.heating?.type && wizardData.utilities.heating.type !== 'none') {
    const hasHeatingSection = estimate.sections?.some((s: any) =>
      s.title?.toLowerCase().includes('опален')
    );
    if (!hasHeatingSection) {
      warnings.push({
        type: 'WARNING',
        code: 'MISSING_HEATING',
        message: `В wizard вказано опалення (${wizardData.utilities.heating.type}), але в кошторисі немає секції з опаленням`,
      });
    }
  }

  if (wizardData.utilities?.electrical?.outlets > 0) {
    const hasElectricalSection = estimate.sections?.some((s: any) =>
      s.title?.toLowerCase().includes('електр')
    );
    if (!hasElectricalSection) {
      warnings.push({
        type: 'WARNING',
        code: 'MISSING_ELECTRICAL',
        message: `В wizard вказано ${wizardData.utilities.electrical.outlets} розеток, але в кошторисі немає секції з електрикою`,
      });
    }
  }

  // Матеріал стін
  if (wizardData.houseData?.walls?.material) {
    const material = wizardData.houseData.walls.material;
    const materialNames: Record<string, string[]> = {
      gasblock: ['газоблок', 'газобетон', 'aeroc'],
      brick: ['цегла', 'керамоблок'],
      wood: ['дерево', 'брус', 'каркас'],
      panel: ['панель', 'сип'],
    };

    const expectedKeywords = materialNames[material] || [];
    const hasMaterial = estimate.sections?.some((s: any) =>
      s.items?.some((item: any) =>
        expectedKeywords.some((kw) => item.name?.toLowerCase().includes(kw))
      )
    );

    if (!hasMaterial && expectedKeywords.length > 0) {
      warnings.push({
        type: 'WARNING',
        code: 'MISSING_WALL_MATERIAL',
        message: `В wizard вказано матеріал стін "${material}", але в кошторисі не знайдено відповідних позицій (очікувалось: ${expectedKeywords.join(', ')})`,
      });
    }
  }

  // NEW: Geological validation
  if (context.parsedData?.geological) {
    const geo = context.parsedData.geological;

    // Check if drainage is in estimate when groundwater is high
    if (geo.groundwaterLevel !== null && geo.groundwaterLevel < 2) {
      const hasDrainage = estimate.sections?.some((s: any) =>
        s.items?.some((item: any) =>
          item.name?.toLowerCase().includes('дренаж') ||
          item.name?.toLowerCase().includes('drainage')
        )
      );

      if (!hasDrainage) {
        warnings.push({
          type: 'WARNING',
          code: 'MISSING_DRAINAGE',
          message: `⚠️ КРИТИЧНО: Геологічний звіт показує високий УГВ (${geo.groundwaterLevel} м), але в кошторисі немає дренажної системи!`,
        });
      }
    }

    // Check if foundation type matches recommendation
    if (geo.recommendedFoundation) {
      const hasCorrectFoundation = estimate.sections?.some((s: any) =>
        s.items?.some((item: any) =>
          item.name?.toLowerCase().includes(geo.recommendedFoundation.toLowerCase())
        )
      );

      if (!hasCorrectFoundation) {
        warnings.push({
          type: 'WARNING',
          code: 'FOUNDATION_TYPE_MISMATCH',
          message: `Геологія рекомендує ${geo.recommendedFoundation} фундамент, але в кошторисі його не знайдено`,
        });
      }
    }
  }

  // NEW: Site plan validation
  if (context.parsedData?.sitePlan) {
    const site = context.parsedData.sitePlan;

    // Check if earthworks are in estimate when elevation difference is significant
    if (site.elevationDifference && site.elevationDifference > 1) {
      const hasEarthworks = estimate.sections?.some((s: any) =>
        s.title?.toLowerCase().includes('земля') ||
        s.items?.some((item: any) =>
          item.name?.toLowerCase().includes('земля') ||
          item.name?.toLowerCase().includes('планування')
        )
      );

      if (!hasEarthworks) {
        warnings.push({
          type: 'WARNING',
          code: 'MISSING_EARTHWORKS',
          message: `Перепад висот ${site.elevationDifference.toFixed(2)} м, але в кошторисі немає земляних робіт`,
        });
      }
    }

    // Check if utility connections are in estimate
    if (!site.existingUtilities.water || !site.existingUtilities.sewerage) {
      const hasUtilityConnection = estimate.sections?.some((s: any) =>
        s.items?.some((item: any) =>
          item.name?.toLowerCase().includes('підключення') ||
          item.name?.toLowerCase().includes('зовнішні мережі')
        )
      );

      if (!hasUtilityConnection) {
        warnings.push({
          type: 'WARNING',
          code: 'MISSING_UTILITY_CONNECTIONS',
          message: `На ділянці відсутні комунікації, але в кошторисі немає підключення до зовнішніх мереж`,
        });
      }
    }
  }

  // NEW: Review validation
  if (context.parsedData?.review) {
    const review = context.parsedData.review;

    if (review.criticalCount > 0) {
      warnings.push({
        type: 'WARNING',
        code: 'CRITICAL_REVIEW_COMMENTS',
        message: `Є ${review.criticalCount} критичних зауважень з рецензії. Переконайтесь що всі враховані в кошторисі`,
      });
    }
  }
}

function getEmptyStats(): EstimateStats {
  return {
    totalItems: 0,
    totalCost: 0,
    materialsCost: 0,
    laborCost: 0,
    itemsPerSquareMeter: 0,
    avgPricePerItem: 0,
  };
}

/**
 * Форматує результат валідації у текстовий звіт
 */
export function formatValidationReport(result: ValidationResult): string {
  let report = '';

  report += `📊 СТАТИСТИКА КОШТОРИСУ:\n`;
  report += `- Позицій: ${result.stats.totalItems}\n`;
  report += `- Загальна вартість: ${result.stats.totalCost.toFixed(2)} грн\n`;
  report += `- Матеріали: ${result.stats.materialsCost.toFixed(2)} грн\n`;
  report += `- Роботи: ${result.stats.laborCost.toFixed(2)} грн\n`;
  report += `- Позицій на м²: ${result.stats.itemsPerSquareMeter.toFixed(2)}\n`;
  report += `- Середня ціна позиції: ${result.stats.avgPricePerItem.toFixed(2)} грн\n\n`;

  if (result.errors.length > 0) {
    report += `❌ ПОМИЛКИ (${result.errors.length}):\n`;
    result.errors.forEach((err) => {
      report += `  - [${err.code}] ${err.message}\n`;
    });
    report += '\n';
  }

  if (result.warnings.length > 0) {
    report += `⚠️ ПОПЕРЕДЖЕННЯ (${result.warnings.length}):\n`;
    result.warnings.forEach((warn) => {
      report += `  - [${warn.code}] ${warn.message}\n`;
    });
    report += '\n';
  }

  if (result.valid && result.errors.length === 0 && result.warnings.length === 0) {
    report += `✅ Кошторис валідний, помилок не знайдено!\n`;
  }

  return report;
}
