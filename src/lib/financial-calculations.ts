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
  taxRate: number;            // Ставка податку (%) - deprecated
  taxAmount: number;          // Сума податку - deprecated
  logisticsCost: number;
  finalAmount: number;        // Фінальна сума

  // Детальний розподіл податків
  taxBreakdown?: {
    pdvAmount: number;
    esvAmount: number;
    militaryTaxAmount: number;
    profitTaxAmount: number;
    unifiedTaxAmount: number;
    pdfoAmount: number;
    totalTaxAmount: number;
    netProfit: number;
    effectiveTaxRate: number;
  };
}

/**
 * Розраховує фінансові параметри для кошториса з детальним розподілом податків
 */
export function calculateFinancials(
  params: FinancialParams & { totalLabor?: number }
): CalculatedFinancials {
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

  // Детальний розрахунок податків залежно від типу оподаткування
  let taxBreakdown: CalculatedFinancials['taxBreakdown'];
  let taxAmount: number;

  if (params.taxationType === "VAT") {
    const breakdown = calculateTaxesLLCWithVAT({
      subtotal,
      totalLabor: params.totalLabor || 0,
      totalMargin,
    });

    taxBreakdown = {
      pdvAmount: breakdown.pdvAmount,
      esvAmount: breakdown.esvAmount,
      militaryTaxAmount: breakdown.militaryTaxAmount,
      profitTaxAmount: breakdown.profitTaxAmount,
      unifiedTaxAmount: 0,
      pdfoAmount: breakdown.pdfoAmount,
      totalTaxAmount: breakdown.totalTaxAmount,
      netProfit: breakdown.netProfit,
      effectiveTaxRate: breakdown.effectiveTaxRate,
    };

    // Для клієнта taxAmount включає тільки ПДВ (транзитний податок)
    taxAmount = breakdown.pdvAmount;
  }
  else if (params.taxationType === "FOP") {
    const breakdown = calculateTaxesFOP3rdGroup({
      subtotal,
      totalMargin,
    });

    taxBreakdown = {
      pdvAmount: 0,
      esvAmount: breakdown.esvAmount,
      militaryTaxAmount: breakdown.militaryTaxAmount,
      profitTaxAmount: 0,
      unifiedTaxAmount: breakdown.unifiedTaxAmount,
      pdfoAmount: 0,
      totalTaxAmount: breakdown.totalTaxAmount,
      netProfit: breakdown.netProfit,
      effectiveTaxRate: breakdown.effectiveTaxRate,
    };

    // Для клієнта показуємо тільки єдиний податок
    taxAmount = breakdown.unifiedTaxAmount;
  }
  else {
    // CASH - без податків
    taxAmount = 0;
  }

  // Фінальна сума (для клієнта)
  const finalAmount = subtotal + taxAmount + params.logisticsCost;

  return {
    items: calculatedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    totalMargin: Math.round(totalMargin * 100) / 100,
    taxRate,
    taxAmount: Math.round(taxAmount * 100) / 100,
    logisticsCost: params.logisticsCost,
    finalAmount: Math.round(finalAmount * 100) / 100,
    taxBreakdown,
  };
}

/**
 * Повертає ставку податку для типу оподаткування
 * @deprecated Використовуйте calculateTaxesLLCWithVAT або calculateTaxesFOP3rdGroup для детального розрахунку
 */
export function getTaxRate(taxationType: TaxationType): number {
  switch (taxationType) {
    case "CASH":
      return 0;
    case "VAT":
      return 20; // Спрощена ставка, використовуйте calculateTaxesLLCWithVAT
    case "FOP":
      return 5; // ВИПРАВЛЕНО: було 6%, правильно 5%
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
      return "ФОП 3 група 5%";
    default:
      return "Невідомо";
  }
}

/**
 * Податкові ставки для розрахунків
 */
export const TAX_RATES = {
  // ТОВ з ПДВ
  PDV: 20,                    // ПДВ
  PROFIT_TAX: 18,             // Податок на прибуток
  ESV_EMPLOYER: 22,           // ЄСВ (роботодавець)
  PDFO: 18,                   // ПДФО
  MILITARY_TAX: 1.5,          // Військовий збір

  // ФОП 3 група
  FOP_UNIFIED_TAX: 5,         // Єдиний податок ФОП 3 група
  FOP_ESV_MIN_WAGE: 8000,     // Мінімальна ЗП для розрахунку ЄСВ (2025)
  FOP_ESV_RATE: 22,           // ЄСВ для ФОП
} as const;

/**
 * Детальний розрахунок податків для ТОВ з ПДВ
 */
interface TaxBreakdownVAT {
  pdvAmount: number;           // ПДВ (20%)
  esvAmount: number;           // ЄСВ на зарплату (22%)
  pdfoAmount: number;          // ПДФО (18%)
  militaryTaxAmount: number;   // Військовий збір (1.5%)
  profitTaxAmount: number;     // Податок на прибуток (18%)
  totalTaxAmount: number;      // Загальна сума податків
  netProfit: number;           // Чистий прибуток після всіх податків
  effectiveTaxRate: number;    // Ефективна податкова ставка (%)
}

export function calculateTaxesLLCWithVAT(params: {
  subtotal: number;            // Сума без податків
  totalLabor: number;          // Вартість робіт (для розрахунку ЄСВ)
  totalMargin: number;         // Рентабельність (прибуток)
}): TaxBreakdownVAT {
  const { subtotal, totalLabor, totalMargin } = params;

  // 1. ПДВ (20% від суми без ПДВ)
  const pdvAmount = (subtotal * TAX_RATES.PDV) / 100;

  // 2. ЄСВ (22% від фонду оплати праці)
  // Припускаємо, що totalLabor це нарахована зарплата
  const esvAmount = (totalLabor * TAX_RATES.ESV_EMPLOYER) / 100;

  // 3. ПДФО (18% від зарплати)
  const pdfoAmount = (totalLabor * TAX_RATES.PDFO) / 100;

  // 4. Військовий збір (1.5% від зарплати)
  const militaryTaxAmount = (totalLabor * TAX_RATES.MILITARY_TAX) / 100;

  // 5. Податок на прибуток (18% від прибутку після всіх інших податків)
  // Прибуток = Рентабельність - ЄСВ - ПДФО - Військовий збір
  const taxableProfit = totalMargin - esvAmount - pdfoAmount - militaryTaxAmount;
  const profitTaxAmount = taxableProfit > 0 ? (taxableProfit * TAX_RATES.PROFIT_TAX) / 100 : 0;

  // Загальна сума податків (без ПДВ, оскільки ПДВ транзитний)
  const totalTaxAmount = esvAmount + pdfoAmount + militaryTaxAmount + profitTaxAmount;

  // Чистий прибуток після всіх податків
  const netProfit = totalMargin - totalTaxAmount;

  // Ефективна податкова ставка
  const effectiveTaxRate = totalMargin > 0 ? (totalTaxAmount / totalMargin) * 100 : 0;

  return {
    pdvAmount: Math.round(pdvAmount * 100) / 100,
    esvAmount: Math.round(esvAmount * 100) / 100,
    pdfoAmount: Math.round(pdfoAmount * 100) / 100,
    militaryTaxAmount: Math.round(militaryTaxAmount * 100) / 100,
    profitTaxAmount: Math.round(profitTaxAmount * 100) / 100,
    totalTaxAmount: Math.round(totalTaxAmount * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    effectiveTaxRate: Math.round(effectiveTaxRate * 100) / 100,
  };
}

/**
 * Детальний розрахунок податків для ФОП 3 група
 */
interface TaxBreakdownFOP {
  unifiedTaxAmount: number;    // Єдиний податок (5%)
  esvAmount: number;           // ЄСВ (22% від мін. ЗП або більше)
  militaryTaxAmount: number;   // Військовий збір (1.5%)
  totalTaxAmount: number;      // Загальна сума податків
  netProfit: number;           // Чистий прибуток
  effectiveTaxRate: number;    // Ефективна податкова ставка (%)
}

export function calculateTaxesFOP3rdGroup(params: {
  subtotal: number;            // Загальна сума доходу
  totalMargin: number;         // Рентабельність (прибуток)
  esvBase?: number;            // База для розрахунку ЄСВ (за замовчуванням мін. ЗП)
}): TaxBreakdownFOP {
  const { subtotal, totalMargin } = params;
  const esvBase = params.esvBase || TAX_RATES.FOP_ESV_MIN_WAGE;

  // 1. Єдиний податок (5% від доходу)
  const unifiedTaxAmount = (subtotal * TAX_RATES.FOP_UNIFIED_TAX) / 100;

  // 2. ЄСВ (22% від бази оподаткування, мінімум від мін. ЗП)
  const esvAmount = (esvBase * TAX_RATES.FOP_ESV_RATE) / 100;

  // 3. Військовий збір (1.5% від доходу)
  const militaryTaxAmount = (subtotal * TAX_RATES.MILITARY_TAX) / 100;

  // Загальна сума податків
  const totalTaxAmount = unifiedTaxAmount + esvAmount + militaryTaxAmount;

  // Чистий прибуток
  const netProfit = totalMargin - totalTaxAmount;

  // Ефективна податкова ставка
  const effectiveTaxRate = totalMargin > 0 ? (totalTaxAmount / totalMargin) * 100 : 0;

  return {
    unifiedTaxAmount: Math.round(unifiedTaxAmount * 100) / 100,
    esvAmount: Math.round(esvAmount * 100) / 100,
    militaryTaxAmount: Math.round(militaryTaxAmount * 100) / 100,
    totalTaxAmount: Math.round(totalTaxAmount * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    effectiveTaxRate: Math.round(effectiveTaxRate * 100) / 100,
  };
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
