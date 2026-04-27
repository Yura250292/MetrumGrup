/**
 * Cashflow forecast aggregator.
 *
 * Returns time-bucketed plan + fact totals plus a running balance starting from
 * an opening balance computed from history. The frontend uses this to draw a
 * payment calendar / gap detector.
 *
 * Semantics:
 *   - bucket gets contributions from non-archived entries with occurredAt in
 *     [bucket.from, bucket.to)
 *   - PLAN entries → bucket.plan.{incoming,outgoing} (expected money flow)
 *   - FACT entries → bucket.fact.{incoming,outgoing} (realised / in-books)
 *   - net = (plan.incoming + fact.incoming) − (plan.outgoing + fact.outgoing)
 *   - runningBalance = openingBalance + cumulative net up to and incl. bucket
 *   - hasGap = runningBalance < 0
 *
 * Opening balance is the sum of all non-archived FACT entries with
 * occurredAt < from (positive for INCOME, negative for EXPENSE). It's the
 * simplest model; once we wire actual bank balances we can override it.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CashflowGranularity = "DAY" | "WEEK" | "MONTH";

export type CashflowBucket = {
  key: string;
  from: string; // ISO date
  to: string; // ISO date (exclusive)
  plan: { incoming: number; outgoing: number };
  fact: { incoming: number; outgoing: number };
  net: number;
  runningBalance: number;
  hasGap: boolean;
};

export type CashflowResponse = {
  granularity: CashflowGranularity;
  range: { from: string; to: string };
  openingBalance: number;
  buckets: CashflowBucket[];
  totals: {
    incoming: number;
    outgoing: number;
    net: number;
  };
  gaps: { from: string; to: string; depth: number }[];
};

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay();
  // Monday-based week
  const diff = (day + 6) % 7;
  r.setDate(r.getDate() - diff);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addUnit(d: Date, granularity: CashflowGranularity): Date {
  const r = new Date(d);
  if (granularity === "DAY") r.setDate(r.getDate() + 1);
  else if (granularity === "WEEK") r.setDate(r.getDate() + 7);
  else r.setMonth(r.getMonth() + 1);
  return r;
}

function bucketStart(d: Date, g: CashflowGranularity): Date {
  if (g === "DAY") return startOfDay(d);
  if (g === "WEEK") return startOfWeek(d);
  return startOfMonth(d);
}

function bucketKey(d: Date, g: CashflowGranularity): string {
  if (g === "DAY") return d.toISOString().slice(0, 10);
  if (g === "MONTH") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // ISO-week. Quick approximation that matches `EEEE WW` from date-fns: week-of-year.
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  // Thursday of the current week determines the year.
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

export type CashflowParams = {
  from: Date;
  to: Date;
  granularity: CashflowGranularity;
  projectId?: string | null;
  folderId?: string | null;
};

export async function computeCashflow(p: CashflowParams): Promise<CashflowResponse> {
  const { from, to, granularity } = p;

  const baseWhere: Prisma.FinanceEntryWhereInput = {
    isArchived: false,
    ...(p.projectId ? { projectId: p.projectId } : {}),
    ...(p.folderId ? { folderId: p.folderId } : {}),
  };

  // 1. Opening balance — fact entries before `from`.
  const openingAgg = await prisma.financeEntry.groupBy({
    by: ["type"],
    where: {
      ...baseWhere,
      kind: "FACT",
      occurredAt: { lt: from },
    },
    _sum: { amount: true },
  });
  let openingBalance = 0;
  for (const r of openingAgg) {
    const v = Number(r._sum.amount ?? 0);
    openingBalance += r.type === "INCOME" ? v : -v;
  }

  // 2. Entries inside the window — group by (kind, type, day) for fast bucketing.
  // We fetch raw entries (id, kind, type, amount, occurredAt) — this is OK because
  // even on a busy account a 90-day window is on the order of a few thousand rows.
  const entries = await prisma.financeEntry.findMany({
    where: {
      ...baseWhere,
      occurredAt: { gte: from, lt: to },
    },
    select: { kind: true, type: true, amount: true, occurredAt: true },
  });

  // 3. Build empty bucket scaffold.
  const buckets: CashflowBucket[] = [];
  let cur = bucketStart(from, granularity);
  while (cur < to) {
    const next = addUnit(cur, granularity);
    buckets.push({
      key: bucketKey(cur, granularity),
      from: cur.toISOString(),
      to: next.toISOString(),
      plan: { incoming: 0, outgoing: 0 },
      fact: { incoming: 0, outgoing: 0 },
      net: 0,
      runningBalance: 0,
      hasGap: false,
    });
    cur = next;
  }

  // 4. Allocate entries to their bucket.
  for (const e of entries) {
    const idx = findBucketIdx(buckets, new Date(e.occurredAt));
    if (idx === -1) continue;
    const b = buckets[idx];
    const amt = Number(e.amount);
    const target = e.kind === "PLAN" ? b.plan : b.fact;
    if (e.type === "INCOME") target.incoming += amt;
    else target.outgoing += amt;
  }

  // 5. Compute net + running balance + gaps.
  let running = openingBalance;
  const totals = { incoming: 0, outgoing: 0, net: 0 };
  for (const b of buckets) {
    const inc = b.plan.incoming + b.fact.incoming;
    const out = b.plan.outgoing + b.fact.outgoing;
    b.net = inc - out;
    running += b.net;
    b.runningBalance = running;
    b.hasGap = running < 0;
    totals.incoming += inc;
    totals.outgoing += out;
    totals.net += b.net;
  }

  // 6. Coalesce contiguous gap buckets into windows.
  const gaps: CashflowResponse["gaps"] = [];
  let gapStart: number | null = null;
  let gapDepth = 0;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].hasGap) {
      if (gapStart === null) gapStart = i;
      gapDepth = Math.min(gapDepth, buckets[i].runningBalance);
    } else if (gapStart !== null) {
      gaps.push({
        from: buckets[gapStart].from,
        to: buckets[i - 1].to,
        depth: gapDepth,
      });
      gapStart = null;
      gapDepth = 0;
    }
  }
  if (gapStart !== null) {
    gaps.push({
      from: buckets[gapStart].from,
      to: buckets[buckets.length - 1].to,
      depth: gapDepth,
    });
  }

  return {
    granularity,
    range: { from: from.toISOString(), to: to.toISOString() },
    openingBalance,
    buckets,
    totals,
    gaps,
  };
}

function findBucketIdx(buckets: CashflowBucket[], date: Date): number {
  // Linear search is fine — we have at most ~90 buckets even at DAY granularity.
  const t = date.getTime();
  for (let i = 0; i < buckets.length; i++) {
    const from = new Date(buckets[i].from).getTime();
    const to = new Date(buckets[i].to).getTime();
    if (t >= from && t < to) return i;
  }
  return -1;
}
