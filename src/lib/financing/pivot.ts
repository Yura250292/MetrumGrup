/**
 * Pivot aggregator — категорія/субкатегорія × місяць.
 *
 * Робить покрокове групування записів фінансування у двовимірну зведену
 * таблицю: рядки = (type, category, subcategory), колонки = місяці у форматі
 * `YYYY-MM`. Підсумкові рядки рахуються тут же.
 *
 * Чиста pure-функція (`aggregatePivot`) винесена окремо для тестованості.
 * Запитування БД та auth — в API-роуті, тут лише агрегація.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { FinanceListFilters } from "./queries";
import { expandFolderFilter } from "./queries";

export type PivotEntryInput = {
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
  occurredAt: Date;
  amount: Prisma.Decimal | number | string;
  projectId: string | null;
  projectTitle: string | null;
};

export type PivotRow = {
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
  projectId: string | null;
  projectTitle: string | null;
  perMonth: Record<string, number>;
  total: number;
};

export type PivotTotalsBlock = {
  perMonth: Record<string, number>;
  total: number;
};

export type PivotResponse = {
  range: { from: string; to: string };
  months: string[];
  rows: PivotRow[];
  totals: {
    income: PivotTotalsBlock;
    expense: PivotTotalsBlock;
    net: PivotTotalsBlock;
  };
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function enumerateMonths(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    out.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
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
  range: { from: Date; to: Date },
): PivotResponse {
  const months = enumerateMonths(range.from, range.to);

  const rowMap = new Map<string, PivotRow>();
  const incomePerMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  const expensePerMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const e of entries) {
    const mk = monthKey(e.occurredAt);
    if (!months.includes(mk)) continue;

    const rowKey = `${e.type}::${e.projectId ?? ""}::${e.category}::${e.subcategory ?? ""}`;
    let row = rowMap.get(rowKey);
    if (!row) {
      row = {
        type: e.type,
        category: e.category,
        subcategory: e.subcategory,
        projectId: e.projectId,
        projectTitle: e.projectTitle,
        perMonth: Object.fromEntries(months.map((m) => [m, 0])),
        total: 0,
      };
      rowMap.set(rowKey, row);
    }

    const value = toNumber(e.amount);
    row.perMonth[mk] = (row.perMonth[mk] ?? 0) + value;
    row.total += value;

    if (e.type === "INCOME") {
      incomePerMonth[mk] = (incomePerMonth[mk] ?? 0) + value;
      incomeTotal += value;
    } else {
      expensePerMonth[mk] = (expensePerMonth[mk] ?? 0) + value;
      expenseTotal += value;
    }
  }

  const rows = Array.from(rowMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "INCOME" ? -1 : 1;
    const aProj = a.projectTitle ?? "￿";
    const bProj = b.projectTitle ?? "￿";
    if (aProj !== bProj) return aProj.localeCompare(bProj);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return (a.subcategory ?? "").localeCompare(b.subcategory ?? "");
  });

  const netPerMonth: Record<string, number> = {};
  for (const m of months) {
    netPerMonth[m] = (incomePerMonth[m] ?? 0) - (expensePerMonth[m] ?? 0);
  }

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    months,
    rows,
    totals: {
      income: { perMonth: incomePerMonth, total: incomeTotal },
      expense: { perMonth: expensePerMonth, total: expenseTotal },
      net: { perMonth: netPerMonth, total: incomeTotal - expenseTotal },
    },
  };
}

export type PivotQueryParams = {
  from: Date;
  to: Date;
  projectId?: string | null;
  folderId?: string | null;
  kind?: "PLAN" | "FACT";
  archived: boolean;
  firmId?: string | null;
};

export async function computePivot(p: PivotQueryParams): Promise<PivotResponse> {
  const filters: FinanceListFilters = {
    projectId: p.projectId === "" ? undefined : p.projectId,
    folderId: p.folderId ?? undefined,
    kind: p.kind,
    from: p.from,
    to: p.to,
    archived: p.archived,
    firmId: p.firmId ?? null,
  };

  const where = await expandFolderFilter(filters);

  const dbRows = await prisma.financeEntry.findMany({
    where,
    select: {
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
    type: r.type,
    category: r.category,
    subcategory: r.subcategory,
    occurredAt: r.occurredAt,
    amount: r.amount,
    projectId: r.projectId,
    projectTitle: r.project?.title ?? null,
  }));

  return aggregatePivot(inputs, { from: p.from, to: p.to });
}
