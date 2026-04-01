import Decimal from "decimal.js";
import type { EstimateItem, EstimateSection } from "@/lib/schemas/estimate";

// Конфігурація Decimal глобально для всього додатку
// precision: 20 - достатньо для фінансових розрахунків
// rounding: ROUND_HALF_UP - стандартне округлення (0.5 → 1)
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP
});

/**
 * EstimateCalculator - централізований клас для всіх розрахунків кошторисів
 *
 * Використовує Decimal.js для точних фінансових обчислень без помилок округлення JavaScript Number.
 *
 * Приклад використання:
 * ```typescript
 * const item = { quantity: new Decimal(123.456), unitPrice: new Decimal(789.12), ... };
 * const amount = EstimateCalculator.calculateItemAmount(item);
 * console.log(amount.toString()); // "98809.73"
 * ```
 */
export class EstimateCalculator {
  /**
   * Розрахувати загальну суму позиції: (quantity × unitPrice) + (laborHours × laborRate)
   *
   * @param item - позиція кошторису
   * @returns Decimal - загальна сума з точністю до копійки
   */
  static calculateItemAmount(item: EstimateItem): Decimal {
    const materialCost = new Decimal(item.quantity).times(item.unitPrice);
    const laborCost = new Decimal(item.laborHours || 0).times(item.laborRate || 0);
    return materialCost.plus(laborCost);
  }

  /**
   * Розрахувати вартість матеріалів для позиції: quantity × unitPrice
   *
   * @param item - позиція кошторису
   * @returns Decimal - вартість тільки матеріалів
   */
  static calculateMaterialCost(item: EstimateItem): Decimal {
    return new Decimal(item.quantity).times(item.unitPrice);
  }

  /**
   * Розрахувати вартість робіт для позиції: laborHours × laborRate
   *
   * @param item - позиція кошторису
   * @returns Decimal - вартість тільки робіт
   */
  static calculateLaborCost(item: EstimateItem): Decimal {
    return new Decimal(item.laborHours || 0).times(item.laborRate || 0);
  }

  /**
   * Розрахувати загальну суму секції: сума всіх позицій
   *
   * @param section - секція кошторису з позиціями
   * @returns Decimal - загальна сума секції
   */
  static calculateSectionTotal(section: EstimateSection): Decimal {
    return section.items.reduce(
      (sum, item) => sum.plus(this.calculateItemAmount(item)),
      new Decimal(0)
    );
  }

  /**
   * Розрахувати всі підсумки кошторису
   *
   * @param sections - всі секції кошторису
   * @param overheadPercent - відсоток накладних витрат (за замовчуванням 15)
   * @returns об'єкт з усіма розрахованими сумами
   */
  static calculateTotals(
    sections: EstimateSection[],
    overheadPercent: Decimal = new Decimal(15)
  ) {
    let totalMaterials = new Decimal(0);
    let totalLabor = new Decimal(0);

    // Підрахувати матеріали та роботи по всім секціям
    sections.forEach(section => {
      section.items.forEach(item => {
        totalMaterials = totalMaterials.plus(this.calculateMaterialCost(item));
        totalLabor = totalLabor.plus(this.calculateLaborCost(item));
      });
    });

    // Розрахувати накладні витрати: (матеріали + роботи) × overhead%
    const subtotal = totalMaterials.plus(totalLabor);
    const overhead = subtotal.times(overheadPercent).dividedBy(100);

    // Фінальна сума до знижки
    const totalAmount = subtotal.plus(overhead);

    return {
      totalMaterials,
      totalLabor,
      overhead,
      totalAmount,
    };
  }

  /**
   * Застосувати знижку до суми: totalAmount × (1 - discount%)
   *
   * @param totalAmount - сума до знижки
   * @param discountPercent - відсоток знижки (0-100)
   * @returns Decimal - фінальна сума після знижки
   */
  static applyDiscount(totalAmount: Decimal, discountPercent: Decimal): Decimal {
    const discountMultiplier = new Decimal(1).minus(discountPercent.dividedBy(100));
    return totalAmount.times(discountMultiplier);
  }

  /**
   * Конвертувати Decimal у number для JSON серіалізації (з контрольованою точністю)
   *
   * УВАГА: використовувати тільки для відображення в UI або JSON response.
   * Для всіх розрахунків використовувати Decimal!
   *
   * @param decimal - значення Decimal
   * @param precision - кількість знаків після коми (за замовчуванням 2)
   * @returns number - округлене число
   */
  static toNumber(decimal: Decimal, precision: number = 2): number {
    return decimal.toDecimalPlaces(precision).toNumber();
  }

  /**
   * Конвертувати Decimal у string для Prisma
   *
   * Prisma очікує string для Decimal полів у БД.
   *
   * @param decimal - значення Decimal
   * @param precision - кількість знаків після коми (за замовчуванням 2)
   * @returns string - рядкове представлення числа
   */
  static toString(decimal: Decimal, precision: number = 2): string {
    return decimal.toFixed(precision);
  }

  /**
   * Форматувати Decimal для відображення користувачу: "1 000,00 ₴"
   *
   * Використовує українську локаль для форматування.
   *
   * @param decimal - значення Decimal
   * @returns string - відформатоване значення
   */
  static format(decimal: Decimal): string {
    const number = decimal.toDecimalPlaces(2).toNumber();
    return number.toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Форматувати Decimal для валюти: "1 000,00"
   *
   * Без символу валюти, з українським форматуванням.
   *
   * @param decimal - значення Decimal
   * @param withCurrency - чи додавати символ ₴ (за замовчуванням false)
   * @returns string - відформатоване значення
   */
  static formatCurrency(decimal: Decimal, withCurrency: boolean = false): string {
    const formatted = this.format(decimal);
    return withCurrency ? `${formatted} ₴` : formatted;
  }
}
