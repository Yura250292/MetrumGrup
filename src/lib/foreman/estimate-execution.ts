/**
 * Estimate execution roll-up — скільки відсотків плану по кожному
 * EstimateItem уже фактично виконано виконробами (зведено з усіх
 * APPROVED ForemanReportProgress по проєкту).
 *
 * Відрізняється від `budget-matrix.ts` тим, що:
 *   • budget-matrix агрегує гроші по CostCode-bucket-ах;
 *   • execution агрегує обʼєми по конкретних позиціях кошторису.
 *
 * v1 рахуємо on-the-fly (group-by). Не materializуємо у
 * ProjectStageRecord.factVolume, щоб не конфліктувати з ручним вводом PM.
 */
import { ForemanReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EstimateExecutionRow = {
  estimateItemId: string;
  description: string;
  unit: string;
  sectionId: string | null;
  sectionName: string | null;
  quantityPlanned: number;
  /** @deprecated використовуй unitCost. Лишається як alias для legacy UI. */
  unitPrice: number;
  /** Собівартість позиції (фірмі) — план. */
  unitCost: number;
  /** Ціна позиції для замовника — план. Маржа = customer − cost. */
  unitPriceCustomer: number;
  quantityActual: number;
  percentDone: number;
  /** Планова собівартість = quantityPlanned × unitCost. */
  amountPlanned: number;
  /** Фактична собівартість = quantityActual × unitCost. */
  amountActual: number;
  /** Плановий дохід від замовника = quantityPlanned × unitPriceCustomer. */
  revenuePlanned: number;
  /** Фактичний дохід = quantityActual × unitPriceCustomer. */
  revenueActual: number;
  /** max(0, amountActual - amountPlanned) — перевитрата собівартості. */
  overrunAmount: number;
  lastReportAt: Date | null;
};

export type EstimateExecutionOpts = {
  /** Які статуси звітів включати у факт. За замовч. — тільки APPROVED. */
  includeStatuses?: ForemanReportStatus[];
};

const DEFAULT_STATUSES: ForemanReportStatus[] = [ForemanReportStatus.APPROVED];

export async function computeEstimateExecution(
  projectId: string,
  opts: EstimateExecutionOpts = {},
): Promise<EstimateExecutionRow[]> {
  const statuses = opts.includeStatuses ?? DEFAULT_STATUSES;

  // Усі EstimateItem проєкту (через Estimate.projectId).
  const items = await prisma.estimateItem.findMany({
    where: { estimate: { projectId } },
    select: {
      id: true,
      description: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      unitCost: true,
      unitPriceCustomer: true,
      sectionId: true,
      section: { select: { id: true, title: true } },
    },
    orderBy: [{ sectionId: "asc" }, { sortOrder: "asc" }],
  });

  if (items.length === 0) return [];

  // Сумарний фактичний обʼєм + останній звіт по кожній позиції.
  const grouped = await prisma.foremanReportProgress.groupBy({
    by: ["estimateItemId"],
    where: {
      estimateItemId: { in: items.map((i) => i.id) },
      report: { projectId, status: { in: statuses } },
    },
    _sum: { quantityActual: true },
    _max: { updatedAt: true },
  });
  const factMap = new Map(
    grouped.map((r) => [
      r.estimateItemId,
      {
        actual: Number(r._sum.quantityActual ?? 0),
        last: r._max.updatedAt ?? null,
      },
    ]),
  );

  return items.map((it) => {
    const fact = factMap.get(it.id);
    const planned = Number(it.quantity ?? 0);
    // unitCost fallback на legacy unitPrice (semantic match: і там і там — собівартість).
    const unitCost = Number(it.unitCost ?? it.unitPrice ?? 0);
    // unitPriceCustomer fallback на unitCost (нульова маржа, якщо ще не заповнено).
    const unitPriceCustomer = Number(it.unitPriceCustomer ?? unitCost);
    const actual = fact?.actual ?? 0;
    const amountPlanned = planned * unitCost;
    const amountActual = actual * unitCost;
    const revenuePlanned = planned * unitPriceCustomer;
    const revenueActual = actual * unitPriceCustomer;

    return {
      estimateItemId: it.id,
      description: it.description,
      unit: it.unit,
      sectionId: it.sectionId,
      sectionName: it.section?.title ?? null,
      quantityPlanned: planned,
      unitPrice: unitCost,
      unitCost,
      unitPriceCustomer,
      quantityActual: actual,
      percentDone: planned > 0 ? (actual / planned) * 100 : 0,
      amountPlanned,
      amountActual,
      revenuePlanned,
      revenueActual,
      overrunAmount: Math.max(0, amountActual - amountPlanned),
      lastReportAt: fact?.last ?? null,
    };
  });
}

/** Зведення по всьому проєкту для KPI-смужки. */
export type EstimateExecutionTotals = {
  itemsTotal: number;
  itemsStarted: number;
  itemsCompleted: number;
  amountPlanned: number;
  amountActual: number;
  revenuePlanned: number;
  revenueActual: number;
  /** Маржа план = revenuePlanned − amountPlanned. */
  marginPlanned: number;
  /** Маржа факт = revenueActual − amountActual. */
  marginActual: number;
  totalOverrun: number;
};

export function summarizeExecution(rows: EstimateExecutionRow[]): EstimateExecutionTotals {
  let amountPlanned = 0;
  let amountActual = 0;
  let revenuePlanned = 0;
  let revenueActual = 0;
  let totalOverrun = 0;
  let started = 0;
  let completed = 0;
  for (const r of rows) {
    amountPlanned += r.amountPlanned;
    amountActual += r.amountActual;
    revenuePlanned += r.revenuePlanned;
    revenueActual += r.revenueActual;
    totalOverrun += r.overrunAmount;
    if (r.quantityActual > 0) started++;
    if (r.percentDone >= 100) completed++;
  }
  return {
    itemsTotal: rows.length,
    itemsStarted: started,
    itemsCompleted: completed,
    amountPlanned,
    amountActual,
    revenuePlanned,
    revenueActual,
    marginPlanned: revenuePlanned - amountPlanned,
    marginActual: revenueActual - amountActual,
    totalOverrun,
  };
}
