import { addDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CascadeResult = {
  createdFinanceEntries: number;
  endDateShifted: boolean;
};

type TxClient = Prisma.TransactionClient | typeof prisma;

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
    return { createdFinanceEntries: 0, endDateShifted: false };
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

  return { createdFinanceEntries: created, endDateShifted };
}

/// Розгортає item.totalPrice → знак для FinanceEntry. Експортовано для тестів.
export function expectedFinanceType(sign: number): "INCOME" | "EXPENSE" {
  return sign >= 0 ? "EXPENSE" : "INCOME";
}
