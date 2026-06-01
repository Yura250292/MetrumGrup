/**
 * Прогрес виконання робіт (P9) + автозавершення робіт/розділів (P11).
 *
 * Джерело істини факту — APPROVED ForemanReportProgress. Percent НЕ
 * зберігається окремим полем: рахуємо on-the-fly, щоб draft/submitted звіти
 * ніколи не впливали на фактичний відсоток.
 *
 * Звʼязок робота→stage: ProjectStageRecord.sourceEstimateItemId = EstimateItem.id
 * (child stage), розділ — sourceEstimateSectionId (parent stage).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient | PrismaClient;

export type EstimateItemProgress = {
  estimateItemId: string;
  plannedQuantity: number;
  approvedQuantity: number;
  remainingQuantity: number;
  /** approvedQuantity / plannedQuantity × 100 (0 якщо plan = 0). */
  percent: number;
};

/**
 * Прогрес однієї роботи з APPROVED-звітів.
 * `submittedQuantity` (PENDING_APPROVAL) рахуй окремо у місцях, де потрібно
 * — тут лише approved-факт як джерело істини.
 */
export async function computeEstimateItemProgress(
  estimateItemId: string,
  client: TxClient = prisma,
): Promise<EstimateItemProgress> {
  const item = await client.estimateItem.findUnique({
    where: { id: estimateItemId },
    select: { quantity: true },
  });
  const planned = Number(item?.quantity ?? 0);

  const agg = await client.foremanReportProgress.aggregate({
    where: { estimateItemId, report: { status: "APPROVED" } },
    _sum: { quantityActual: true },
  });
  const approved = Number(agg._sum.quantityActual ?? 0);

  return {
    estimateItemId,
    plannedQuantity: planned,
    approvedQuantity: approved,
    remainingQuantity: Math.max(0, planned - approved),
    percent: planned > 0 ? (approved / planned) * 100 : 0,
  };
}

/**
 * Сумарний approved-обʼєм для набору робіт одним group-by (для списків).
 * Повертає Map<estimateItemId, approvedQuantity>.
 */
export async function approvedQuantitiesFor(
  estimateItemIds: string[],
  client: TxClient = prisma,
): Promise<Map<string, number>> {
  if (estimateItemIds.length === 0) return new Map();
  const grouped = await client.foremanReportProgress.groupBy({
    by: ["estimateItemId"],
    where: {
      estimateItemId: { in: estimateItemIds },
      report: { status: "APPROVED" },
    },
    _sum: { quantityActual: true },
  });
  return new Map(
    grouped.map((g) => [g.estimateItemId, Number(g._sum.quantityActual ?? 0)]),
  );
}

/**
 * Перерахунок завершення роботи на основі approved-обʼємів. Якщо
 * approvedQuantity ≥ plannedQuantity (plan > 0):
 *   • child ProjectStageRecord.status = COMPLETED;
 *   • actualEndDate = now(), якщо ще не заповнено.
 * Потім каскадно перевіряє parent-розділ.
 *
 * Викликати після approve звіту (всередині тієї ж транзакції — звіт уже
 * має статус APPROVED, тож aggregate його врахує).
 */
export async function recomputeWorkCompletion(
  estimateItemId: string,
  client: TxClient = prisma,
): Promise<void> {
  const progress = await computeEstimateItemProgress(estimateItemId, client);
  if (progress.plannedQuantity <= 0) return;
  if (progress.approvedQuantity < progress.plannedQuantity) return;

  const childStage = await client.projectStageRecord.findFirst({
    where: { sourceEstimateItemId: estimateItemId },
    select: { id: true, status: true, actualEndDate: true, parentStageId: true },
  });
  if (!childStage || childStage.status === "COMPLETED") {
    // Якщо немає stage-запису — нічого автозавершувати. Якщо вже COMPLETED —
    // все одно перевіримо parent (раптом останній child щойно закрився раніше).
    if (childStage?.parentStageId) {
      await recomputeSectionCompletion(childStage.parentStageId, client);
    }
    return;
  }

  await client.projectStageRecord.update({
    where: { id: childStage.id },
    data: {
      status: "COMPLETED",
      ...(childStage.actualEndDate ? {} : { actualEndDate: new Date() }),
    },
  });

  if (childStage.parentStageId) {
    await recomputeSectionCompletion(childStage.parentStageId, client);
  }
}

/**
 * Розділ COMPLETED, коли всі його child-роботи COMPLETED.
 * actualEndDate = max(child.actualEndDate).
 */
export async function recomputeSectionCompletion(
  parentStageId: string,
  client: TxClient = prisma,
): Promise<void> {
  const children = await client.projectStageRecord.findMany({
    where: { parentStageId },
    select: { status: true, actualEndDate: true },
  });
  if (children.length === 0) return;

  const allCompleted = children.every((c) => c.status === "COMPLETED");
  if (!allCompleted) return;

  const maxEnd = children.reduce<Date | null>((acc, c) => {
    if (!c.actualEndDate) return acc;
    return acc == null || c.actualEndDate > acc ? c.actualEndDate : acc;
  }, null);

  await client.projectStageRecord.update({
    where: { id: parentStageId },
    data: {
      status: "COMPLETED",
      actualEndDate: maxEnd ?? new Date(),
    },
  });
}
