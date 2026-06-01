import { addDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CascadeResult = {
  createdFinanceEntries: number;
  endDateShifted: boolean;
  /// P10: матеріалізовані у кошторис scope-зміни (ADD/MODIFY/REMOVE).
  materializedItems: number;
};

type TxClient = Prisma.TransactionClient | typeof prisma;

/// Вибирає кошторис проєкту, у який матеріалізувати approved ДКО:
/// пріоритет — той, що має заморожену активну версію (frozen plan); інакше
/// перший за створенням. Повертає null, якщо у проєкта немає кошторисів.
async function pickProjectPlanEstimate(
  tx: TxClient,
  projectId: string,
): Promise<string | null> {
  const locked = await tx.estimate.findFirst({
    where: { projectId, versions: { some: { isActive: true, isLocked: true } } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (locked) return locked.id;
  const any = await tx.estimate.findFirst({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return any?.id ?? null;
}

/// P10: матеріалізує scope-рядки approved ДКО у EstimateItem проєкту.
/// Не мутує frozen original (MODIFY → delta-робота). Пише напряму через tx,
/// свідомо обходячи assertEstimateEditable — ДКО і є контрольованим механізмом
/// зміни замороженого кошторису.
async function materializeScopeItems(
  tx: TxClient,
  co: Prisma.ChangeOrderGetPayload<{ include: { items: true } }>,
): Promise<number> {
  const scopeItems = co.items.filter((i) => i.action != null);
  if (scopeItems.length === 0) return 0;

  const estimateId = await pickProjectPlanEstimate(tx, co.projectId);
  if (!estimateId) return 0;

  let count = 0;
  for (const item of scopeItems) {
    if (item.action === "REMOVE") {
      if (item.estimateItemId) {
        await tx.estimateItem.update({
          where: { id: item.estimateItemId },
          data: { isReportable: false },
        });
        count += 1;
      }
      continue;
    }

    // ADD або MODIFY → нова reportable-робота (для MODIFY — delta).
    const isModify = item.action === "MODIFY";
    const qty = isModify
      ? Number(item.quantityDelta ?? 0)
      : Number(item.newQuantity ?? item.qty);
    const unitCost = Number(item.unitCost ?? item.unitPrice);
    const amount = Math.abs(qty) * unitCost;

    await tx.estimateItem.create({
      data: {
        estimateId,
        sectionId: item.sectionId ?? null,
        description: isModify
          ? `${item.description} (ДКО ${co.number})`
          : item.description,
        unit: item.unit,
        quantity: qty,
        unitPrice: unitCost,
        amount,
        unitCost,
        unitPriceCustomer: item.unitPriceCustomer ?? null,
        foremanId: item.foremanId ?? null,
        executorText: item.executorText ?? null,
        itemType: "labor",
        sourceType: "CHANGE_ORDER",
        sourceChangeOrderItemId: item.id,
        baseEstimateItemId: isModify ? item.estimateItemId ?? null : null,
        isReportable: true,
      },
    });
    count += 1;
  }
  return count;
}

/// Виконує каскад для APPROVED ChangeOrder:
///   1. Створює FinanceEntry(kind=PLAN, source=CHANGE_ORDER) на кожен item.
///      Sign +1 → EXPENSE (плануємо витрати), sign -1 → INCOME (повертаємо
///      бюджет назад).
///   2. Зсуває Project.endDate на scheduleImpactDays (може бути 0).
///   3. Ідемпотентний — повторний виклик не дублює entries.
///
/// Викликати ВСЕРЕДИНІ транзакції разом зі зміною статусу на APPROVED.
/// PDF генеруємо окремо (поза транзакцією), щоб не блокувати DB.
export async function applyApprovedCascade(
  tx: TxClient,
  changeOrderId: string,
): Promise<CascadeResult> {
  const co = await tx.changeOrder.findUnique({
    where: { id: changeOrderId },
    include: { items: true, project: true },
  });
  if (!co) {
    throw new Error(`ChangeOrder ${changeOrderId} not found`);
  }

  const existing = await tx.financeEntry.findFirst({
    where: { changeOrderId },
    select: { id: true },
  });
  if (existing) {
    return { createdFinanceEntries: 0, endDateShifted: false, materializedItems: 0 };
  }

  const now = new Date();
  const occurredAt = co.clientApprovedAt ?? co.adminApprovedAt ?? now;

  let created = 0;
  for (const item of co.items) {
    const isExpense = item.sign >= 0;
    await tx.financeEntry.create({
      data: {
        occurredAt,
        kind: "PLAN",
        type: isExpense ? "EXPENSE" : "INCOME",
        source: "CHANGE_ORDER",
        amount: item.totalPrice.abs(),
        currency: "UAH",
        projectId: co.projectId,
        firmId: co.firmId,
        category: "Дод. угода",
        subcategory: co.number,
        title: `${co.number} — ${item.description}`,
        description: co.title,
        costCodeId: item.costCodeId,
        changeOrderId: co.id,
        createdById: co.requestedById,
        isDerived: true,
        status: "APPROVED",
      },
    });
    created += 1;
  }

  let endDateShifted = false;
  if (co.scheduleImpactDays !== 0 && co.project?.expectedEndDate) {
    await tx.project.update({
      where: { id: co.projectId },
      data: {
        expectedEndDate: addDays(co.project.expectedEndDate, co.scheduleImpactDays),
      },
    });
    endDateShifted = true;
  }

  // P10: матеріалізація scope-змін у кошторис (нові роботи стають reportable).
  const materializedItems = await materializeScopeItems(tx, co);

  return { createdFinanceEntries: created, endDateShifted, materializedItems };
}

/// Розгортає item.totalPrice → знак для FinanceEntry. Експортовано для тестів.
export function expectedFinanceType(sign: number): "INCOME" | "EXPENSE" {
  return sign >= 0 ? "EXPENSE" : "INCOME";
}
