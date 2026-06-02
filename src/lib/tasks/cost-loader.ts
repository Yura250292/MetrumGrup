import { prisma } from "@/lib/prisma";

/**
 * Батчеве завантаження SELF-витрат (план/факт) для набору задач — для cost-колонок.
 * Rollup по підзадачах рахується на клієнті (rollupTaskCosts), бо потребує повного
 * дерева через усі сторінки пагінації.
 *
 * RBAC: викликати ЛИШЕ коли canViewFinance(role). Тут самого гейту немає.
 *
 * План self = unitCost×quantity привʼязаного рядка кошторису (fallback amount),
 *   інакше Task.plannedCostManual, інакше null.
 * Факт self = Σ FinanceEntry(kind=FACT, estimateItemId = task.sourceEstimateItemId)
 *   + Σ TimeLog.costSnapshot по задачі.
 */
export type TaskCostLite = {
  id: string;
  sourceEstimateItemId: string | null;
  plannedCostManual: unknown; // Prisma.Decimal | null
};

export type TaskSelfCost = { planned: number | null; actual: number };

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadTaskSelfCosts(
  tasks: TaskCostLite[],
): Promise<Map<string, TaskSelfCost>> {
  const taskIds = tasks.map((t) => t.id);
  const estimateItemIds = Array.from(
    new Set(tasks.map((t) => t.sourceEstimateItemId).filter((x): x is string => !!x)),
  );

  const [estimateItems, financeFacts, timeLogs] = await Promise.all([
    estimateItemIds.length
      ? prisma.estimateItem.findMany({
          where: { id: { in: estimateItemIds } },
          select: { id: true, unitCost: true, quantity: true, amount: true },
        })
      : Promise.resolve([]),
    estimateItemIds.length
      ? prisma.financeEntry.groupBy({
          by: ["estimateItemId"],
          where: { kind: "FACT", estimateItemId: { in: estimateItemIds } },
          _sum: { amount: true },
        })
      : Promise.resolve([] as { estimateItemId: string | null; _sum: { amount: unknown } }[]),
    taskIds.length
      ? prisma.timeLog.groupBy({
          by: ["taskId"],
          where: { taskId: { in: taskIds } },
          _sum: { costSnapshot: true },
        })
      : Promise.resolve([] as { taskId: string; _sum: { costSnapshot: unknown } }[]),
  ]);

  // План по estimate-item.
  const plannedByItem = new Map<string, number>();
  for (const it of estimateItems) {
    const cost = it.unitCost != null ? num(it.unitCost) * num(it.quantity) : num(it.amount);
    plannedByItem.set(it.id, cost);
  }
  // Факт фінансів по estimate-item.
  const factByItem = new Map<string, number>();
  for (const f of financeFacts) {
    if (f.estimateItemId) factByItem.set(f.estimateItemId, num(f._sum.amount));
  }
  // Факт часу по задачі.
  const timeByTask = new Map<string, number>();
  for (const tl of timeLogs) {
    timeByTask.set(tl.taskId, num(tl._sum.costSnapshot));
  }

  const result = new Map<string, TaskSelfCost>();
  for (const t of tasks) {
    let planned: number | null = null;
    if (t.sourceEstimateItemId && plannedByItem.has(t.sourceEstimateItemId)) {
      planned = plannedByItem.get(t.sourceEstimateItemId)!;
    } else if (t.plannedCostManual != null) {
      planned = num(t.plannedCostManual);
    }
    const actual =
      (t.sourceEstimateItemId ? factByItem.get(t.sourceEstimateItemId) ?? 0 : 0) +
      (timeByTask.get(t.id) ?? 0);
    result.set(t.id, { planned, actual });
  }
  return result;
}
