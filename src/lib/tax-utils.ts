/**
 * Утиліти для роботи з податками та формування звітів
 */

import { TaxationType } from "@prisma/client";
import { TAX_RATES } from "./financial-calculations";

/**
 * Форматує податковий звіт для бухгалтера (ТОВ з ПДВ)
 */
export interface TaxReportVAT {
  estimateNumber: string;
  estimateTitle: string;
  projectTitle: string;
  clientName: string;

  // Суми
  subtotal: number;
  totalLabor: number;
  totalMargin: number;

  // Детальний розподіл податків
  pdv: {
    base: number;           // База оподаткування
    rate: number;           // Ставка (%)
    amount: number;         // Сума ПДВ
    note: string;
  };

  esv: {
    base: number;           // ФОП (зарплата)
    rate: number;           // Ставка (%)
    amount: number;         // Сума ЄСВ
    note: string;
  };

  pdfo: {
    base: number;           // База (зарплата)
    rate: number;           // Ставка (%)
    amount: number;         // Сума ПДФО
    note: string;
  };

  militaryTax: {
    base: number;           // База (зарплата)
    rate: number;           // Ставка (%)
    amount: number;         // Сума військового збору
    note: string;
  };

  profitTax: {
    base: number;           // База (прибуток після інших податків)
    rate: number;           // Ставка (%)
    amount: number;         // Сума податку на прибуток
    note: string;
  };

  summary: {
    totalTaxBurden: number;       // Загальне податкове навантаження
    netProfit: number;            // Чистий прибуток
    effectiveTaxRate: number;     // Ефективна ставка (%)
  };
}

export function generateTaxReportVAT(params: {
  estimateNumber: string;
  estimateTitle: string;
  projectTitle: string;
  clientName: string;
  subtotal: number;
  totalLabor: number;
  totalMargin: number;
  pdvAmount: number;
  esvAmount: number;
  pdfoAmount: number;
  militaryTaxAmount: number;
  profitTaxAmount: number;
  totalTaxAmount: number;
  netProfit: number;
  effectiveTaxRate: number;
}): TaxReportVAT {
  const taxableProfit = params.totalMargin - params.esvAmount - params.pdfoAmount - params.militaryTaxAmount;

  return {
    estimateNumber: params.estimateNumber,
    estimateTitle: params.estimateTitle,
    projectTitle: params.projectTitle,
    clientName: params.clientName,

    subtotal: params.subtotal,
    totalLabor: params.totalLabor,
    totalMargin: params.totalMargin,

    pdv: {
      base: params.subtotal,
      rate: TAX_RATES.PDV,
      amount: params.pdvAmount,
      note: "ПДВ є транзитним податком. Нараховується на загальну суму без ПДВ.",
    },

    esv: {
      base: params.totalLabor,
      rate: TAX_RATES.ESV_EMPLOYER,
      amount: params.esvAmount,
      note: "ЄСВ роботодавця на фонд оплати праці (роботи).",
    },

    pdfo: {
      base: params.totalLabor,
      rate: TAX_RATES.PDFO,
      amount: params.pdfoAmount,
      note: "ПДФО з заробітної плати працівників.",
    },

    militaryTax: {
      base: params.totalLabor,
      rate: TAX_RATES.MILITARY_TAX,
      amount: params.militaryTaxAmount,
      note: "Військовий збір з заробітної плати.",
    },

    profitTax: {
      base: taxableProfit,
      rate: TAX_RATES.PROFIT_TAX,
      amount: params.profitTaxAmount,
      note: "Податок на прибуток. База: Рентабельність - ЄСВ - ПДФО - Військовий збір.",
    },

    summary: {
      totalTaxBurden: params.totalTaxAmount,
      netProfit: params.netProfit,
      effectiveTaxRate: params.effectiveTaxRate,
    },
  };
}

/**
 * Форматує податковий звіт для бухгалтера (ФОП 3 група)
 */
export interface TaxReportFOP {
  estimateNumber: string;
  estimateTitle: string;
  projectTitle: string;
  clientName: string;

  // Суми
  subtotal: number;
  totalMargin: number;

  // Детальний розподіл податків
  unifiedTax: {
    base: number;           // База оподаткування (дохід)
    rate: number;           // Ставка (%)
    amount: number;         // Сума єдиного податку
    note: string;
  };

  esv: {
    base: number;           // База (мін. ЗП або більше)
    rate: number;           // Ставка (%)
    amount: number;         // Сума ЄСВ
    note: string;
  };

  militaryTax: {
    base: number;           // База (дохід)
    rate: number;           // Ставка (%)
    amount: number;         // Сума військового збору
    note: string;
  };

  summary: {
    totalTaxBurden: number;       // Загальне податкове навантаження
    netProfit: number;            // Чистий прибуток
    effectiveTaxRate: number;     // Ефективна ставка (%)
  };
}

export function generateTaxReportFOP(params: {
  estimateNumber: string;
  estimateTitle: string;
  projectTitle: string;
  clientName: string;
  subtotal: number;
  totalMargin: number;
  unifiedTaxAmount: number;
  esvAmount: number;
  militaryTaxAmount: number;
  totalTaxAmount: number;
  netProfit: number;
  effectiveTaxRate: number;
  esvBase?: number;
}): TaxReportFOP {
  const esvBase = params.esvBase || TAX_RATES.FOP_ESV_MIN_WAGE;

  return {
    estimateNumber: params.estimateNumber,
    estimateTitle: params.estimateTitle,
    projectTitle: params.projectTitle,
    clientName: params.clientName,

    subtotal: params.subtotal,
    totalMargin: params.totalMargin,

    unifiedTax: {
      base: params.subtotal,
      rate: TAX_RATES.FOP_UNIFIED_TAX,
      amount: params.unifiedTaxAmount,
      note: "Єдиний податок 3 група (5% від доходу).",
    },

    esv: {
      base: esvBase,
      rate: TAX_RATES.FOP_ESV_RATE,
      amount: params.esvAmount,
      note: `ЄСВ для ФОП. Розраховано від бази ${esvBase.toFixed(2)} грн (мінімум від мін. ЗП ${TAX_RATES.FOP_ESV_MIN_WAGE} грн).`,
    },

    militaryTax: {
      base: params.subtotal,
      rate: TAX_RATES.MILITARY_TAX,
      amount: params.militaryTaxAmount,
      note: "Військовий збір з доходу.",
    },

    summary: {
      totalTaxBurden: params.totalTaxAmount,
      netProfit: params.netProfit,
      effectiveTaxRate: params.effectiveTaxRate,
    },
  };
}

/**
 * Генерує текстовий звіт для бухгалтера
 */
export function formatTaxReportText(
  taxationType: TaxationType,
  report: TaxReportVAT | TaxReportFOP
): string {
  let text = `ПОДАТКОВИЙ ЗВІТ\n`;
  text += `${"=".repeat(80)}\n\n`;

  text += `Кошторис: ${report.estimateNumber} - ${report.estimateTitle}\n`;
  text += `Проєкт: ${report.projectTitle}\n`;
  text += `Клієнт: ${report.clientName}\n`;
  text += `Тип оподаткування: ${taxationType === "VAT" ? "ТОВ з ПДВ" : "ФОП 3 група"}\n\n`;

  text += `ФІНАНСОВІ ПОКАЗНИКИ\n`;
  text += `${"-".repeat(80)}\n`;
  text += `Загальна сума (без ПДВ): ${report.subtotal.toFixed(2)} грн\n`;
  if ("totalLabor" in report) {
    text += `Вартість робіт (ФОП): ${report.totalLabor.toFixed(2)} грн\n`;
  }
  text += `Рентабельність: ${report.totalMargin.toFixed(2)} грн\n\n`;

  text += `ДЕТАЛЬНИЙ РОЗПОДІЛ ПОДАТКІВ\n`;
  text += `${"-".repeat(80)}\n\n`;

  if (taxationType === "VAT" && "pdv" in report) {
    text += `1. ПДВ (${report.pdv.rate}%)\n`;
    text += `   База: ${report.pdv.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.pdv.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.pdv.note}\n\n`;

    text += `2. ЄСВ (${report.esv.rate}%)\n`;
    text += `   База: ${report.esv.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.esv.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.esv.note}\n\n`;

    text += `3. ПДФО (${report.pdfo.rate}%)\n`;
    text += `   База: ${report.pdfo.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.pdfo.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.pdfo.note}\n\n`;

    text += `4. Військовий збір (${report.militaryTax.rate}%)\n`;
    text += `   База: ${report.militaryTax.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.militaryTax.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.militaryTax.note}\n\n`;

    text += `5. Податок на прибуток (${report.profitTax.rate}%)\n`;
    text += `   База: ${report.profitTax.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.profitTax.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.profitTax.note}\n\n`;
  } else if (taxationType === "FOP" && "unifiedTax" in report) {
    text += `1. Єдиний податок (${report.unifiedTax.rate}%)\n`;
    text += `   База: ${report.unifiedTax.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.unifiedTax.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.unifiedTax.note}\n\n`;

    text += `2. ЄСВ (${report.esv.rate}%)\n`;
    text += `   База: ${report.esv.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.esv.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.esv.note}\n\n`;

    text += `3. Військовий збір (${report.militaryTax.rate}%)\n`;
    text += `   База: ${report.militaryTax.base.toFixed(2)} грн\n`;
    text += `   Сума: ${report.militaryTax.amount.toFixed(2)} грн\n`;
    text += `   Примітка: ${report.militaryTax.note}\n\n`;
  }

  text += `ПІДСУМОК\n`;
  text += `${"-".repeat(80)}\n`;
  text += `Загальне податкове навантаження: ${report.summary.totalTaxBurden.toFixed(2)} грн\n`;
  text += `Чистий прибуток: ${report.summary.netProfit.toFixed(2)} грн\n`;
  text += `Ефективна податкова ставка: ${report.summary.effectiveTaxRate.toFixed(2)}%\n`;

  return text;
}

/**
 * Генерує короткий опис податкового навантаження
 */
export function getTaxSummary(taxationType: TaxationType, totalTaxAmount: number, effectiveTaxRate: number): string {
  if (taxationType === "VAT") {
    return `ТОВ з ПДВ: податкове навантаження ${totalTaxAmount.toFixed(2)} грн (ефективна ставка ${effectiveTaxRate.toFixed(1)}%)`;
  } else if (taxationType === "FOP") {
    return `ФОП 3 група: податкове навантаження ${totalTaxAmount.toFixed(2)} грн (ефективна ставка ${effectiveTaxRate.toFixed(1)}%)`;
  } else {
    return "Готівка: без податків";
  }
}
