import { ProjectStage, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STAGE_ORDER } from "@/lib/constants";
import { syncProjectBudgetEntry } from "@/lib/folders/mirror-service";

type TxClient = Prisma.TransactionClient | typeof prisma;

export type StageAggregateBuckets = {
  planExpense: number;
  factExpense: number;
  planIncome: number;
  factIncome: number;
};

/**
 * Рахує 4 кошики (PLAN/FACT × EXPENSE/INCOME) для кожного етапу проєкту,
 * підсумовуючи по піддереву (батько отримує суму всіх дітей включно з власними).
 * Повертає Map keyed by stageRecord.id.
 */
export async function computeStageFinanceAggregates(
  projectId: string,
  stageRows: Array<{ id: string; parentStageId: string | null }>,
): Promise<Map<string, StageAggregateBuckets>> {
  const out = new Map<string, StageAggregateBuckets>();
  if (stageRows.length === 0) return out;

  const grouped = await prisma.financeEntry.groupBy({
    by: ["stageRecordId", "kind", "type"],
    where: {
      projectId,
      isArchived: false,
      stageRecordId: { not: null },
    },
    _sum: { amount: true },
  });

  const selfPlanExpense = new Map<string, number>();
  const selfFactExpense = new Map<string, number>();
  const selfPlanIncome = new Map<string, number>();
  const selfFactIncome = new Map<string, number>();
  for (const row of grouped) {
    if (!row.stageRecordId) continue;
    const sum = Number(row._sum.amount ?? 0);
    const map =
      row.kind === "PLAN" && row.type === "EXPENSE"
        ? selfPlanExpense
        : row.kind === "FACT" && row.type === "EXPENSE"
          ? selfFactExpense
          : row.kind === "PLAN" && row.type === "INCOME"
            ? selfPlanIncome
            : row.kind === "FACT" && row.type === "INCOME"
              ? selfFactIncome
              : null;
    if (map) map.set(row.stageRecordId, sum);
  }

  const childrenOf = new Map<string, string[]>();
  for (const s of stageRows) {
    if (s.parentStageId) {
      const arr = childrenOf.get(s.parentStageId) ?? [];
      arr.push(s.id);
      childrenOf.set(s.parentStageId, arr);
    }
  }
  const descendants = (rootId: string): string[] => {
    const result: string[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const sid = stack.pop()!;
      result.push(sid);
      const kids = childrenOf.get(sid);
      if (kids) stack.push(...kids);
    }
    return result;
  };

  for (const s of stageRows) {
    let planExpense = 0;
    let factExpense = 0;
    let planIncome = 0;
    let factIncome = 0;
    for (const sid of descendants(s.id)) {
      planExpense += selfPlanExpense.get(sid) ?? 0;
      factExpense += selfFactExpense.get(sid) ?? 0;
      planIncome += selfPlanIncome.get(sid) ?? 0;
      factIncome += selfFactIncome.get(sid) ?? 0;
    }
    out.set(s.id, { planExpense, factExpense, planIncome, factIncome });
  }
  return out;
}

/**
 * Перераховує `currentStage`, `currentStageRecordId` і `stageProgress` проєкту
 * на основі поточних top-level (visible) ProjectStageRecord рядків. Викликати
 * після будь-якої зміни статусу/прогресу етапу — bulk PUT, single PATCH,
 * "Закрити задачу", тощо.
 *
 * Якщо `syncBudget=true`, додатково синхронізує `Project.totalBudget` з суми
 * `allocatedBudget` top-level етапів і триггерить mirror PROJECT_BUDGET
 * FinanceEntry. `userId` потрібен для audit-у.
 */
export async function recalcCurrentStage(
  projectId: string,
  options: { syncBudget?: boolean; userId?: string; tx?: TxClient } = {},
): Promise<void> {
  const client = options.tx ?? prisma;

  const topLevel = await client.projectStageRecord.findMany({
    where: { projectId, isHidden: false, parentStageId: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, stage: true, status: true, progress: true },
  });

  let currentRecord = topLevel.find((r) => r.status === "IN_PROGRESS");
  if (!currentRecord) {
    const completed = topLevel.filter((r) => r.status === "COMPLETED");
    currentRecord = completed[completed.length - 1] ?? topLevel[0];
  }

  let currentStage: ProjectStage = "DESIGN";
  if (currentRecord?.stage) {
    currentStage = currentRecord.stage;
  } else {
    for (const enumStage of STAGE_ORDER) {
      if (topLevel.some((r) => r.stage === enumStage)) {
        currentStage = enumStage;
        break;
      }
    }
  }

  const totalVisible = topLevel.length || 1;
  const completedCount = topLevel.filter((r) => r.status === "COMPLETED").length;
  const inProgress = topLevel.find((r) => r.status === "IN_PROGRESS");
  const overallProgress = Math.round(
    ((completedCount + (inProgress ? inProgress.progress / 100 : 0)) / totalVisible) * 100,
  );

  await client.project.update({
    where: { id: projectId },
    data: {
      currentStage,
      currentStageRecordId: currentRecord?.id ?? null,
      stageProgress: Math.max(0, Math.min(100, overallProgress)),
    },
  });

  if (options.syncBudget) {
    const stagesWithBudget = await client.projectStageRecord.findMany({
      where: { projectId, parentStageId: null, isHidden: false },
      select: { allocatedBudget: true },
    });
    const totalAllocated = stagesWithBudget.reduce(
      (sum, s) => sum + Number(s.allocatedBudget ?? 0),
      0,
    );
    if (totalAllocated > 0) {
      await client.project.update({
        where: { id: projectId },
        data: { totalBudget: totalAllocated },
      });
      if (options.userId) {
        try {
          await syncProjectBudgetEntry(projectId, options.userId);
        } catch (err) {
          console.error("[recalcCurrentStage] syncProjectBudgetEntry failed:", err);
        }
      }
    }
  }
}
