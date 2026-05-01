import { prisma } from "@/lib/prisma";
import { stageDisplayName } from "@/lib/constants";
import { recomputeProjectPlanSource, markProjectProjected } from "@/lib/projects/plan-source";
import { categorizeStage } from "@/lib/projects/stage-finance-categorization";

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
      startDate: true,
      createdAt: true,
      planVolume: true,
      planUnitPrice: true,
      planClientUnitPrice: true,
      factVolume: true,
      factUnitPrice: true,
      factClientUnitPrice: true,
      project: {
        select: {
          firmId: true,
          isTestProject: true,
          startDate: true,
          createdAt: true,
        },
      },
    },
  });
  if (!stage) return;
  // Тестові проєкти не повинні засмічувати реальне фінансування.
  if (stage.project.isTestProject) return;

  const label = stageDisplayName({
    stage: stage.stage,
    customName: stage.customName,
  });

  // occurredAt для derived plan/fact entries — це дата, коли подія
  // запланована/відбулася на рівні бізнесу, а не момент натискання кнопки
  // sync. Для звітності беремо найбільш специфічну з доступних дат:
  // stage.startDate → project.startDate → stage.createdAt → now() (fallback).
  // Phase 4 з improvement plan — без цього часові графіки спотворюються.
  const occurredAt =
    stage.startDate ??
    stage.project.startDate ??
    stage.createdAt ??
    new Date();

  const baseArgs = {
    stageId,
    stageEnum: stage.stage,
    projectId: stage.projectId,
    firmId: stage.project.firmId,
    label,
    actorUserId,
    occurredAt,
  };

  await Promise.all([
    upsertOne({
      ...baseArgs,
      kind: "PLAN",
      type: "EXPENSE",
      volume: numOrNull(stage.planVolume),
      unitPrice: numOrNull(stage.planUnitPrice),
    }),
    upsertOne({
      ...baseArgs,
      kind: "FACT",
      type: "EXPENSE",
      volume: numOrNull(stage.factVolume),
      unitPrice: numOrNull(stage.factUnitPrice),
    }),
    upsertOne({
      ...baseArgs,
      kind: "PLAN",
      type: "INCOME",
      volume: numOrNull(stage.planVolume),
      unitPrice: numOrNull(stage.planClientUnitPrice),
    }),
    upsertOne({
      ...baseArgs,
      kind: "FACT",
      type: "INCOME",
      volume: numOrNull(stage.factVolume),
      unitPrice: numOrNull(stage.factClientUnitPrice),
    }),
  ]);

  // Phase 2: тримаємо canonical-source прапор у синхронному стані.
  await recomputeProjectPlanSource(stage.projectId);
  // Phase 6.3: bump projection metadata для audit-дашборда.
  await markProjectProjected(stage.projectId, actorUserId);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function upsertOne(args: {
  stageId: string;
  stageEnum: import("@prisma/client").ProjectStage | null;
  projectId: string;
  firmId: string | null;
  kind: "PLAN" | "FACT";
  type: "EXPENSE" | "INCOME";
  label: string;
  volume: number | null;
  unitPrice: number | null;
  actorUserId: string;
  occurredAt: Date;
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

  const { category, costType } = categorizeStage({
    stage: args.stageEnum,
    type: args.type,
  });

  await prisma.financeEntry.create({
    data: {
      type: args.type,
      kind: args.kind,
      source: "STAGE_AUTO",
      isDerived: true,
      amount,
      currency: "UAH",
      occurredAt: args.occurredAt,
      projectId: args.projectId,
      firmId: args.firmId,
      stageRecordId: args.stageId,
      category,
      costType,
      title,
      description,
      createdById: args.actorUserId,
      status: "DRAFT",
    },
  });
}
