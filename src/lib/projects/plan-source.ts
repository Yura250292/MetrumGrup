import type { Prisma, ProjectPlanSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Перераховує і зберігає `Project.planSource` на основі поточного стану БД.
 *
 * Правила (за пріоритетом):
 *   STAGE    — у проєкту є хоч один ProjectStageRecord з `planVolume > 0`
 *              (canonical layer — дерево етапів несе план навіть до того,
 *              як зʼявляться derived STAGE_AUTO FinanceEntry).
 *   ESTIMATE — інакше, якщо є legacy ESTIMATE_AUTO PLAN/EXPENSE записи.
 *   NONE     — інакше.
 *
 * Викликається після:
 *   - syncEstimateToStages (фінальний перерахунок);
 *   - syncStageAutoFinanceEntries (стейдж змінився → канонічний план міг
 *     перейти з NONE на STAGE або навпаки);
 *   - bulk sync-stages-finance.
 *
 * Ідемпотентна, не кидає помилок навіть якщо проєкт зник між викликами.
 */
export async function recomputeProjectPlanSource(
  projectId: string,
  tx: Tx = prisma,
): Promise<ProjectPlanSource> {
  const stagesWithPlan = await tx.projectStageRecord.count({
    where: {
      projectId,
      planVolume: { gt: 0 },
    },
  });
  if (stagesWithPlan > 0) {
    return persist(tx, projectId, "STAGE");
  }

  const estimateAuto = await tx.financeEntry.count({
    where: {
      projectId,
      source: "ESTIMATE_AUTO",
      kind: "PLAN",
      type: "EXPENSE",
    },
  });
  return persist(tx, projectId, estimateAuto > 0 ? "ESTIMATE" : "NONE");
}

async function persist(
  tx: Tx,
  projectId: string,
  next: ProjectPlanSource,
): Promise<ProjectPlanSource> {
  // Avoid no-op write storm: only update if value differs.
  const current = await tx.project.findUnique({
    where: { id: projectId },
    select: { planSource: true },
  });
  if (!current) return next;
  if (current.planSource !== next) {
    await tx.project.update({
      where: { id: projectId },
      data: { planSource: next },
    });
  }
  return next;
}

/**
 * Phase 3 prep / Phase 6.3 audit:
 * фіксує що для проєкту щойно відбулася materialize-подія (sync derived layer).
 * Викликати у всіх «publish»-точках: estimate→stages, stage-auto-finance,
 * sync-stages-finance bulk, syncProjectBudgetEntry, legacy estimate-sync.
 *
 * Bump-ить projectionVersion і фіксує час та автора.
 * Тестові проєкти і неіснуючі projectId — no-op.
 */
export async function markProjectProjected(
  projectId: string,
  userId: string | null,
  tx: Tx = prisma,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { isTestProject: true },
  });
  if (!project || project.isTestProject) return;
  await tx.project.update({
    where: { id: projectId },
    data: {
      lastProjectedAt: new Date(),
      lastProjectedById: userId,
      projectionVersion: { increment: 1 },
    },
  });
}
