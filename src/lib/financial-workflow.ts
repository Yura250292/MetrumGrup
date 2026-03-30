/**
 * Модуль для роботи з фінансовим workflow кошторисів
 */

import { prisma } from "./prisma";
import { calculateFinancials, decimalToNumber, numberToDecimal } from "./financial-calculations";
import { TaxationType } from "@prisma/client";

/**
 * Передати кошторис фінансисту на налаштування
 */
export async function sendToFinancial(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
  });

  if (!estimate) {
    throw new Error("Кошторис не знайдено");
  }

  if (estimate.status !== "DRAFT" && estimate.status !== "ENGINEER_REVIEW") {
    throw new Error("Можна передати тільки чернетку або кошторис після інженерного огляду");
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "FINANCE_REVIEW" },
  });
}

interface ConfigureFinancialsParams {
  taxationType: TaxationType;
  globalMarginPercent: number;
  logisticsCost: number;
  itemMargins?: Array<{
    itemId: string;
    useCustomMargin: boolean;
    customMarginPercent?: number;
  }>;
  notes?: string;
}

/**
 * Налаштувати фінансові параметри кошториса
 */
export async function configureFinancials(
  estimateId: string,
  userId: string,
  params: ConfigureFinancialsParams
) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { items: true },
  });

  if (!estimate) {
    throw new Error("Кошторис не знайдено");
  }

  if (estimate.status !== "FINANCE_REVIEW") {
    throw new Error("Кошторис не в стані фінансового огляду");
  }

  // Розрахувати фінансові параметри
  const calculated = calculateFinancials({
    taxationType: params.taxationType,
    globalMarginPercent: params.globalMarginPercent,
    logisticsCost: params.logisticsCost,
    items: estimate.items.map(item => {
      const itemMargin = params.itemMargins?.find(im => im.itemId === item.id);
      return {
        amount: decimalToNumber(item.amount),
        useCustomMargin: itemMargin?.useCustomMargin || false,
        customMarginPercent: itemMargin?.customMarginPercent,
      };
    }),
  });

  // Зберегти результати в транзакції
  await prisma.$transaction(async (tx) => {
    // Оновити позиції
    for (let i = 0; i < estimate.items.length; i++) {
      const item = estimate.items[i];
      const calcItem = calculated.items[i];
      const itemMargin = params.itemMargins?.find(im => im.itemId === item.id);

      await tx.estimateItem.update({
        where: { id: item.id },
        data: {
          useCustomMargin: itemMargin?.useCustomMargin || false,
          customMarginPercent: itemMargin?.customMarginPercent
            ? numberToDecimal(itemMargin.customMarginPercent)
            : null,
          priceWithMargin: numberToDecimal(calcItem.priceWithMargin),
          marginAmount: numberToDecimal(calcItem.marginAmount),
        },
      });
    }

    // Оновити кошторис
    await tx.estimate.update({
      where: { id: estimateId },
      data: {
        taxationType: params.taxationType,
        profitMarginOverall: numberToDecimal(params.globalMarginPercent),
        logisticsCost: numberToDecimal(params.logisticsCost),
        taxAmount: numberToDecimal(calculated.taxAmount),
        taxRate: numberToDecimal(calculated.taxRate),
        profitAmount: numberToDecimal(calculated.totalMargin),
        finalAmount: numberToDecimal(calculated.finalAmount),
        financeNotes: params.notes,
        financeReviewedById: userId,
        financeReviewedAt: new Date(),
        status: "APPROVED", // Після налаштування фінансів = затверджено
      },
    });
  });
}

/**
 * Повернути кошторис на доопрацювання
 */
export async function returnToDraft(estimateId: string, reason?: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
  });

  if (!estimate) {
    throw new Error("Кошторис не знайдено");
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      status: "DRAFT",
      financeNotes: reason ? `Повернуто: ${reason}` : undefined,
    },
  });
}

/**
 * Застосувати шаблон до кошториса
 */
export async function applyTemplate(
  estimateId: string,
  templateId: string,
  userId: string
) {
  const template = await prisma.financialTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error("Шаблон не знайдено");
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { items: { include: { material: true } } },
  });

  if (!estimate) {
    throw new Error("Кошторис не знайдено");
  }

  // Підготувати індивідуальні націнки на основі категорій
  const categoryMargins = (template.categoryMargins as Record<string, number>) || {};
  const itemMargins = estimate.items.map(item => {
    const category = item.material?.category;
    const customMargin = category && categoryMargins[category];

    return {
      itemId: item.id,
      useCustomMargin: !!customMargin,
      customMarginPercent: customMargin,
    };
  });

  // Застосувати налаштування з шаблону
  await configureFinancials(estimateId, userId, {
    taxationType: template.taxationType,
    globalMarginPercent: decimalToNumber(template.globalMarginPercent),
    logisticsCost: decimalToNumber(template.logisticsCost),
    itemMargins,
    notes: `Застосовано шаблон: ${template.name}`,
  });
}
