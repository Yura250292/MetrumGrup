import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const STAGE_MATERIALS_ESTIMATE_TITLE = "Матеріали етапів";

/**
 * Гарантує існування «системного» Estimate для зберігання матеріалів,
 * привʼязаних безпосередньо до етапів проєкту (без повного кошторисного
 * процесу). Один такий Estimate на проєкт. Title унікальний — використовуємо
 * його як ідемпотентний marker.
 *
 * Створюється з status=DRAFT і не зʼявляється у звичайному списку
 * кошторисів якщо там є фільтр (інакше показується як спеціальний).
 */
export async function ensureStageMaterialsEstimate(
  projectId: string,
  createdById: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;

  const existing = await db.estimate.findFirst({
    where: { projectId, title: STAGE_MATERIALS_ESTIMATE_TITLE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.estimate.create({
    data: {
      number: `STAGE-MAT-${projectId.slice(-6)}-${Date.now()}`,
      title: STAGE_MATERIALS_ESTIMATE_TITLE,
      description: "Матеріали, додані вручну до конкретних етапів проєкту",
      projectId,
      createdById,
      status: "DRAFT",
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Гарантує існування EstimateSection привʼязаної до етапу через
 * stage.sourceEstimateSectionId. Якщо етап ще не має секції — створює
 * нову з назвою етапу і пише її id в `sourceEstimateSectionId`.
 */
export async function ensureStageMaterialsSection(
  projectId: string,
  stageId: string,
  stageName: string,
  createdById: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const stage = await tx.projectStageRecord.findUnique({
      where: { id: stageId },
      select: { id: true, projectId: true, sourceEstimateSectionId: true },
    });
    if (!stage || stage.projectId !== projectId) {
      throw new Error("Етап не знайдено");
    }

    if (stage.sourceEstimateSectionId) {
      return stage.sourceEstimateSectionId;
    }

    const estimateId = await ensureStageMaterialsEstimate(
      projectId,
      createdById,
      tx,
    );

    const section = await tx.estimateSection.create({
      data: {
        title: stageName,
        estimateId,
        sortOrder: 0,
      },
      select: { id: true },
    });

    await tx.projectStageRecord.update({
      where: { id: stageId },
      data: { sourceEstimateSectionId: section.id },
    });

    return section.id;
  });
}
