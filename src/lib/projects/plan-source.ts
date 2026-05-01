import type { Prisma, ProjectPlanSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Перераховує і зберігає `Project.planSource` на основі поточного стану БД.
 *
 * Phase 3: правила базуються на ОПУБЛІКОВАНОМУ шарі, а не draft.
 * Draft-зміни не мають перекидати проєкт у "STAGE" — інакше до publish-у
 * у summary почнуть фігурувати незатверджені цифри.
 *
 * Правила (за пріоритетом):
 *   STAGE    — у проєкту є хоч один ProjectStageRecord з
 *              `publishedPlanVolume > 0` (canonical опублікований шар).
 *   ESTIMATE — інакше, якщо є legacy ESTIMATE_AUTO PLAN/EXPENSE записи.
 *   NONE     — інакше (drafts є але ще не опубліковані / нема нічого).
 *
 * Викликається після:
 *   - syncEstimateToStages (фінальний перерахунок; conditional auto-publish
 *     для першого імпорту);
 *   - syncStageAutoFinanceEntries (після publish);
 *   - bulk publish-stages-finance.
 *
 * Ідемпотентна, не кидає помилок якщо проєкт зник між викликами.
 */
export async function recomputeProjectPlanSource(
  projectId: string,
  tx: Tx = prisma,
): Promise<ProjectPlanSource> {
  const stagesWithPlan = await tx.projectStageRecord.count({
    where: {
      projectId,
      publishedPlanVolume: { gt: 0 },
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
 * Phase 3: фіксує що для проєкту щойно відбувся publish (атомарне копіювання
 * draft → published з подальшим перерахунком STAGE_AUTO FinanceEntry).
 * Викликати з: publish-stages-finance, syncStageAutoFinanceEntries,
 * conditional auto-publish у syncEstimateToStages, legacy estimate-sync.
 *
 * Bump-ить publicationVersion і фіксує час та автора.
 * Тестові проєкти і неіснуючі projectId — no-op.
 */
export async function markProjectPublished(
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
      lastPublishedAt: new Date(),
      lastPublishedById: userId,
      publicationVersion: { increment: 1 },
    },
  });
}
