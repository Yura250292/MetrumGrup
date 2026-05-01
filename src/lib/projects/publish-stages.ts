import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Phase 3 publish helper: атомарно копіює draft-поля у published* для
 * вказаних стейджів. Використовується publish-stages-finance endpoint-ом
 * і conditional auto-publish у syncEstimateToStages.
 *
 * Викликати ВНУТРІ транзакції коли потрібна атомарність із подальшим
 * STAGE_AUTO sync (`syncStageAutoFinanceEntries` працює поза tx).
 */
export async function copyDraftToPublishedForStages(
  stageIds: string[],
  tx: Tx = prisma,
): Promise<void> {
  if (stageIds.length === 0) return;
  await tx.$executeRaw`
    UPDATE "project_stage_records"
    SET
      "publishedPlanVolume"          = "planVolume",
      "publishedFactVolume"          = "factVolume",
      "publishedPlanUnitPrice"       = "planUnitPrice",
      "publishedFactUnitPrice"       = "factUnitPrice",
      "publishedPlanClientUnitPrice" = "planClientUnitPrice",
      "publishedFactClientUnitPrice" = "factClientUnitPrice"
    WHERE "id" = ANY(${stageIds}::text[])
  `;
}

export type DirtyStage = {
  stageId: string;
  fields: string[];
};

/**
 * Знаходить стейджі проєкту, у яких draft-поля відрізняються від published*.
 * Повертає лише назви полів з різницею — UI рендерить diff на основі цього.
 *
 * `null != null` у SQL = unknown, тому користуємось IS DISTINCT FROM
 * (PostgreSQL): null IS DISTINCT FROM 5 = true, null IS DISTINCT FROM null = false.
 */
export async function getDirtyStagesForProject(
  projectId: string,
  tx: Tx = prisma,
): Promise<DirtyStage[]> {
  const rows = await tx.projectStageRecord.findMany({
    where: { projectId },
    select: {
      id: true,
      planVolume: true,
      factVolume: true,
      planUnitPrice: true,
      factUnitPrice: true,
      planClientUnitPrice: true,
      factClientUnitPrice: true,
      publishedPlanVolume: true,
      publishedFactVolume: true,
      publishedPlanUnitPrice: true,
      publishedFactUnitPrice: true,
      publishedPlanClientUnitPrice: true,
      publishedFactClientUnitPrice: true,
    },
  });
  const dirty: DirtyStage[] = [];
  for (const r of rows) {
    const fields: string[] = [];
    if (!decimalsEqual(r.planVolume, r.publishedPlanVolume)) fields.push("planVolume");
    if (!decimalsEqual(r.factVolume, r.publishedFactVolume)) fields.push("factVolume");
    if (!decimalsEqual(r.planUnitPrice, r.publishedPlanUnitPrice)) fields.push("planUnitPrice");
    if (!decimalsEqual(r.factUnitPrice, r.publishedFactUnitPrice)) fields.push("factUnitPrice");
    if (!decimalsEqual(r.planClientUnitPrice, r.publishedPlanClientUnitPrice)) {
      fields.push("planClientUnitPrice");
    }
    if (!decimalsEqual(r.factClientUnitPrice, r.publishedFactClientUnitPrice)) {
      fields.push("factClientUnitPrice");
    }
    if (fields.length > 0) dirty.push({ stageId: r.id, fields });
  }
  return dirty;
}

function decimalsEqual(
  a: Prisma.Decimal | null,
  b: Prisma.Decimal | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.equals(b);
}
