/**
 * Модуль розрахунків фінансових параметрів для кошторисів
 */

import { TaxationType } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

interface FinancialParams {
  taxationType: TaxationType;
  globalMarginPercent: number;
  logisticsCost: number;
  items: Array<{
    amount: number;
    useCustomMargin: boolean;
    customMarginPercent?: number;
  }>;
}

interface CalculatedItem {
  priceWithMargin: number;
  marginAmount: number;
}

interface CalculatedFinancials {
  items: CalculatedItem[];
  subtotal: number;           // Сума без податків та логістики
  totalMargin: number;        // Загальна рентабельність
  taxRate: number;            // Ставка податку (%)
  taxAmount: number;          // Сума податку
  logisticsCost: number;
  finalAmount: number;        // Фінальна сума
}

/**
 * Розраховує фінансові параметри для кошториса
 */
export function calculateFinancials(params: FinancialParams): CalculatedFinancials {
  const taxRate = getTaxRate(params.taxationType);

  // Розрахунок для кожної позиції
  const calculatedItems = params.items.map(item => {
    const marginPercent = item.useCustomMargin && item.customMarginPercent != null
      ? item.customMarginPercent
      : params.globalMarginPercent;

    const priceWithMargin = item.amount * (1 + marginPercent / 100);
    const marginAmount = priceWithMargin - item.amount;

    return {
      priceWithMargin: Math.round(priceWithMargin * 100) / 100,
      marginAmount: Math.round(marginAmount * 100) / 100,
    };
  });

  // Загальна сума без податків
  const subtotal = calculatedItems.reduce((sum, item) => sum + item.priceWithMargin, 0);

  // Загальна рентабельність (маржа)
  const totalMargin = calculatedItems.reduce((sum, item) => sum + item.marginAmount, 0);

  // Податок
  const taxAmount = (subtotal * taxRate) / 100;

  // Фінальна сума
  const finalAmount = subtotal + taxAmount + params.logisticsCost;

  return {
    items: calculatedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    totalMargin: Math.round(totalMargin * 100) / 100,
    taxRate,
    taxAmount: Math.round(taxAmount * 100) / 100,
    logisticsCost: params.logisticsCost,
    finalAmount: Math.round(finalAmount * 100) / 100,
  };
}

/**
 * Повертає ставку податку для типу оподаткування
 */
export function getTaxRate(taxationType: TaxationType): number {
  switch (taxationType) {
    case "CASH":
      return 0;
    case "VAT":
      return 20;
    case "FOP":
      return 6;
    default:
      return 0;
  }
}

/**
 * Повертає людино-читабельну назву типу оподаткування
 */
export function getTaxLabel(taxationType: TaxationType): string {
  switch (taxationType) {
    case "CASH":
      return "Готівка (без податків)";
    case "VAT":
      return "ТОВ з ПДВ 20%";
    case "FOP":
      return "ФОП 3 група 6%";
    default:
      return "Невідомо";
  }
}

/**
 * Конвертує Prisma Decimal в number
 */
export function decimalToNumber(decimal: Decimal | null | undefined): number {
  if (!decimal) return 0;
  return Number(decimal.toString());
}

/**
 * Конвертує number в Prisma Decimal
 */
export function numberToDecimal(num: number): Decimal {
  return new Decimal(num);
}
