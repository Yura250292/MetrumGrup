/**
 * Pivot aggregator — (kind, type, project, category, subcategory) × bucket.
 *
 * Робить покрокове групування записів фінансування у двовимірну зведену
 * таблицю: рядки = (kind, type, project, category, subcategory),
 * колонки = bucket-ключі за обраною granularity (DAY/WEEK/MONTH/YEAR/TOTAL).
 *
 * Чиста pure-функція (`aggregatePivot`) винесена окремо для тестованості.
 * Запитування БД та auth — в API-роуті, тут лише агрегація.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { FinanceListFilters } from "./queries";
import { expandFolderFilter } from "./queries";
import { startOfDay, startOfMonth, startOfWeek, startOfYear } from "./cashflow";

export type PivotGranularity = "DAY" | "WEEK" | "MONTH" | "YEAR" | "TOTAL";

const TOTAL_BUCKET_KEY = "total";

export type PivotEntryInput = {
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
  occurredAt: Date;
  amount: Prisma.Decimal | number | string;
  projectId: string | null;
  projectTitle: string | null;
};

export type PivotRow = {
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
  projectId: string | null;
  projectTitle: string | null;
  perBucket: Record<string, number>;
  total: number;
};

export type PivotTotalsBlock = {
  perBucket: Record<string, number>;
  total: number;
};

export type PivotResponse = {
  range: { from: string; to: string };
  granularity: PivotGranularity;
  buckets: string[];
  rows: PivotRow[];
  totals: {
    income: PivotTotalsBlock;
    expense: PivotTotalsBlock;
    net: PivotTotalsBlock;
  };
};

function bucketKey(d: Date, g: PivotGranularity): string {
  if (g === "TOTAL") return TOTAL_BUCKET_KEY;
  if (g === "DAY") return d.toISOString().slice(0, 10);
  if (g === "MONTH") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (g === "YEAR") return String(d.getFullYear());
  // WEEK — ISO-like week (matches cashflow.ts implementation)
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    );
  return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function bucketStart(d: Date, g: PivotGranularity): Date {
  if (g === "DAY") return startOfDay(d);
  if (g === "WEEK") return startOfWeek(d);
  if (g === "MONTH") return startOfMonth(d);
  if (g === "YEAR") return startOfYear(d);
  return d; // TOTAL — single bucket
}

function advance(d: Date, g: PivotGranularity): Date {
  const r = new Date(d);
  if (g === "DAY") r.setDate(r.getDate() + 1);
  else if (g === "WEEK") r.setDate(r.getDate() + 7);
  else if (g === "MONTH") r.setMonth(r.getMonth() + 1);
  else if (g === "YEAR") r.setFullYear(r.getFullYear() + 1);
  return r;
}

export function enumerateBuckets(
  from: Date,
  to: Date,
  granularity: PivotGranularity,
): string[] {
  if (granularity === "TOTAL") return [TOTAL_BUCKET_KEY];
  const out: string[] = [];
  let cursor = bucketStart(from, granularity);
  const endRef = bucketStart(to, granularity);
  // Safety cap to prevent runaway
  let safety = 5000;
  while (cursor <= endRef && safety-- > 0) {
    out.push(bucketKey(cursor, granularity));
    cursor = advance(cursor, granularity);
  }
  return out;
}

function toNumber(amount: Prisma.Decimal | number | string): number {
  if (typeof amount === "number") return amount;
  if (typeof amount === "string") return Number(amount);
  return Number(amount.toString());
}

export function aggregatePivot(
  entries: PivotEntryInput[],
  range: { from: Date; to: Date; granularity: PivotGranularity },
): PivotResponse {
  const { granularity } = range;
  const buckets = enumerateBuckets(range.from, range.to, granularity);
  const bucketSet = new Set(buckets);

  const rowMap = new Map<string, PivotRow>();
  const incomePerBucket: Record<string, number> = Object.fromEntries(buckets.map((b) => [b, 0]));
  const expensePerBucket: Record<string, number> = Object.fromEntries(buckets.map((b) => [b, 0]));
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const e of entries) {
    const bk = bucketKey(e.occurredAt, granularity);
    if (!bucketSet.has(bk)) continue;

    const rowKey = `${e.kind}::${e.type}::${e.projectId ?? ""}::${e.category}::${e.subcategory ?? ""}`;
    let row = rowMap.get(rowKey);
    if (!row) {
      row = {
        kind: e.kind,
        type: e.type,
        category: e.category,
        subcategory: e.subcategory,
        projectId: e.projectId,
        projectTitle: e.projectTitle,
        perBucket: Object.fromEntries(buckets.map((b) => [b, 0])),
        total: 0,
      };
      rowMap.set(rowKey, row);
    }

    const value = toNumber(e.amount);
    row.perBucket[bk] = (row.perBucket[bk] ?? 0) + value;
    row.total += value;

    if (e.type === "INCOME") {
      incomePerBucket[bk] = (incomePerBucket[bk] ?? 0) + value;
      incomeTotal += value;
    } else {
      expensePerBucket[bk] = (expensePerBucket[bk] ?? 0) + value;
      expenseTotal += value;
    }
  }

  const rows = Array.from(rowMap.values()).sort((a, b) => {
    // Project first, then kind (FACT before PLAN), then type, category, subcategory
    const aProj = a.projectTitle ?? "￿";
    const bProj = b.projectTitle ?? "￿";
    if (aProj !== bProj) return aProj.localeCompare(bProj);
    if (a.kind !== b.kind) return a.kind === "FACT" ? -1 : 1;
    if (a.type !== b.type) return a.type === "INCOME" ? -1 : 1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return (a.subcategory ?? "").localeCompare(b.subcategory ?? "");
  });

  const netPerBucket: Record<string, number> = {};
  for (const b of buckets) {
    netPerBucket[b] = (incomePerBucket[b] ?? 0) - (expensePerBucket[b] ?? 0);
  }

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    granularity,
    buckets,
    rows,
    totals: {
      income: { perBucket: incomePerBucket, total: incomeTotal },
      expense: { perBucket: expensePerBucket, total: expenseTotal },
      net: { perBucket: netPerBucket, total: incomeTotal - expenseTotal },
    },
  };
}

export type PivotQueryParams = {
  from: Date;
  to: Date;
  granularity: PivotGranularity;
  projectId?: string | null;
  folderId?: string | null;
  kind?: "PLAN" | "FACT";
  category?: string;
  archived: boolean;
  firmId?: string | null;
};

export async function computePivot(p: PivotQueryParams): Promise<PivotResponse> {
  const filters: FinanceListFilters = {
    projectId: p.projectId === "" ? undefined : p.projectId,
    folderId: p.folderId ?? undefined,
    kind: p.kind,
    category: p.category,
    from: p.from,
    to: p.to,
    archived: p.archived,
    firmId: p.firmId ?? null,
  };

  const where = await expandFolderFilter(filters);

  const dbRows = await prisma.financeEntry.findMany({
    where,
    select: {
      kind: true,
      type: true,
      category: true,
      subcategory: true,
      occurredAt: true,
      amount: true,
      projectId: true,
      project: { select: { title: true } },
    },
    take: 50000,
  });

  const inputs: PivotEntryInput[] = dbRows.map((r) => ({
    kind: r.kind,
    type: r.type,
    category: r.category,
    subcategory: r.subcategory,
    occurredAt: r.occurredAt,
    amount: r.amount,
    projectId: r.projectId,
    projectTitle: r.project?.title ?? null,
  }));

  return aggregatePivot(inputs, { from: p.from, to: p.to, granularity: p.granularity });
}
