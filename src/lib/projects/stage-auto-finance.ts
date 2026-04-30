import { prisma } from "@/lib/prisma";
import { stageDisplayName } from "@/lib/constants";

/**
 * Синхронізує авто-FinanceEntry для одного етапу:
 *   PLAN EXPENSE  = planVolume × planUnitPrice         (собівартість)
 *   FACT EXPENSE  = factVolume × factUnitPrice
 *   PLAN INCOME   = planVolume × planClientUnitPrice   (надходження від замовника)
 *   FACT INCOME   = factVolume × factClientUnitPrice
 *
 * Запис ідентифікується унікальним ключем (stageRecordId, kind, type, source=STAGE_AUTO).
 * Існує — оновлюємо `amount`. Не існує і добуток > 0 — створюємо. Добуток ≤ 0 → видаляємо.
 *
 * MANUAL записи (наприклад «довезення» з quick-add у drawer) мають source=MANUAL і
 * НЕ зачіпаються — це окремий потік discrete покупок поверх плану.
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
      planClientUnitPrice: true,
      factVolume: true,
      factUnitPrice: true,
      factClientUnitPrice: true,
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
      type: "EXPENSE",
      label,
      volume: numOrNull(stage.planVolume),
      unitPrice: numOrNull(stage.planUnitPrice),
      actorUserId,
    }),
    upsertOne({
      stageId,
      projectId: stage.projectId,
      firmId: stage.project.firmId,
      kind: "FACT",
      type: "EXPENSE",
      label,
      volume: numOrNull(stage.factVolume),
      unitPrice: numOrNull(stage.factUnitPrice),
      actorUserId,
    }),
    upsertOne({
      stageId,
      projectId: stage.projectId,
      firmId: stage.project.firmId,
      kind: "PLAN",
      type: "INCOME",
      label,
      volume: numOrNull(stage.planVolume),
      unitPrice: numOrNull(stage.planClientUnitPrice),
      actorUserId,
    }),
    upsertOne({
      stageId,
      projectId: stage.projectId,
      firmId: stage.project.firmId,
      kind: "FACT",
      type: "INCOME",
      label,
      volume: numOrNull(stage.factVolume),
      unitPrice: numOrNull(stage.factClientUnitPrice),
      actorUserId,
    }),
  ]);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function upsertOne(args: {
  stageId: string;
  projectId: string;
  firmId: string | null;
  kind: "PLAN" | "FACT";
  type: "EXPENSE" | "INCOME";
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
      type: args.type,
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

  const kindLabel = args.kind === "PLAN" ? "план" : "факт";
  const typeLabel = args.type === "EXPENSE" ? "витрати" : "надходження";
  const title = `${args.label} · ${kindLabel} ${typeLabel}`;
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
      type: args.type,
      kind: args.kind,
      source: "STAGE_AUTO",
      amount,
      currency: "UAH",
      occurredAt: new Date(),
      projectId: args.projectId,
      firmId: args.firmId,
      stageRecordId: args.stageId,
      category: args.type === "EXPENSE" ? "materials" : "services",
      title,
      description,
      createdById: args.actorUserId,
      status: "DRAFT",
    },
  });
}
