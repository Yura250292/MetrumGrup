import { prisma } from "@/lib/prisma";
import { stageDisplayName } from "@/lib/constants";

/**
 * Синхронізує авто-FinanceEntry для одного етапу:
 *   - PLAN EXPENSE = planVolume × planUnitPrice
 *   - FACT EXPENSE = factVolume × factUnitPrice
 *
 * Запис ідентифікується унікальним ключем (stageRecordId, kind, source=STAGE_AUTO).
 * Існує — оновлюємо `amount`. Не існує і добуток > 0 — створюємо.
 * Добуток падає в 0/null — видаляємо запис, щоб не залишати «привидів» у фінансуванні.
 *
 * Manual записи (наприклад «довезення» з quick-add) мають source=MANUAL і
 * НЕ зачіпаються — це окремий потік для discrete покупок поверх плану.
 */
export async function syncStageAutoFinanceEntries(
  stageId: string,
  actorUserId: string,
): Promise<void> {
  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      projectId: true,
      stage: true,
      customName: true,
      planVolume: true,
      planUnitPrice: true,
      factVolume: true,
      factUnitPrice: true,
      project: { select: { firmId: true } },
    },
  });
  if (!stage) return;

  const label = stageDisplayName({
    stage: stage.stage,
    customName: stage.customName,
  });

  await Promise.all([
    upsertOne({
      stageId,
      projectId: stage.projectId,
      firmId: stage.project.firmId,
      kind: "PLAN",
      label,
      volume: stage.planVolume === null ? null : Number(stage.planVolume),
      unitPrice: stage.planUnitPrice === null ? null : Number(stage.planUnitPrice),
      actorUserId,
    }),
    upsertOne({
      stageId,
      projectId: stage.projectId,
      firmId: stage.project.firmId,
      kind: "FACT",
      label,
      volume: stage.factVolume === null ? null : Number(stage.factVolume),
      unitPrice: stage.factUnitPrice === null ? null : Number(stage.factUnitPrice),
      actorUserId,
    }),
  ]);
}

async function upsertOne(args: {
  stageId: string;
  projectId: string;
  firmId: string | null;
  kind: "PLAN" | "FACT";
  label: string;
  volume: number | null;
  unitPrice: number | null;
  actorUserId: string;
}): Promise<void> {
  const amount =
    args.volume !== null && args.unitPrice !== null && args.volume > 0 && args.unitPrice > 0
      ? args.volume * args.unitPrice
      : 0;

  const existing = await prisma.financeEntry.findFirst({
    where: {
      stageRecordId: args.stageId,
      kind: args.kind,
      type: "EXPENSE",
      source: "STAGE_AUTO",
    },
    select: { id: true },
  });

  if (amount <= 0) {
    if (existing) {
      await prisma.financeEntry.delete({ where: { id: existing.id } });
    }
    return;
  }

  const title = `${args.label} · ${args.kind === "PLAN" ? "план" : "факт"}`;
  const description = `Автозапис з етапу: ${args.volume} × ${args.unitPrice} ₴`;

  if (existing) {
    await prisma.financeEntry.update({
      where: { id: existing.id },
      data: {
        amount,
        title,
        description,
        updatedById: args.actorUserId,
      },
    });
    return;
  }

  await prisma.financeEntry.create({
    data: {
      type: "EXPENSE",
      kind: args.kind,
      source: "STAGE_AUTO",
      amount,
      currency: "UAH",
      occurredAt: new Date(),
      projectId: args.projectId,
      firmId: args.firmId,
      stageRecordId: args.stageId,
      category: "materials",
      title,
      description,
      createdById: args.actorUserId,
      status: "DRAFT",
    },
  });
}
