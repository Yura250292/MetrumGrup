import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
  canViewFinance,
} from "@/lib/auth-utils";

export const runtime = "nodejs";

/**
 * Safe Finance Migration — Phase 0 audit endpoint.
 *
 * Read-only inventory of the current finance ledger. Призначений для
 * вимірювання baseline перед будь-яким backfill або міграцією writer/reader-логіки.
 * НЕ виправляє нічого, тільки звітує.
 *
 * Дані містять цифри по виплатах/боргах — обмежено SUPER_ADMIN.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canViewFinance(session.user.role)) return forbiddenResponse();

  const liveFilter = { isArchived: false };

  const [
    bySource,
    byKindType,
    byStatus,
    bySourceKindStatus,
    factBySource,
    byFinanceNature,
    bySourceFinanceNature,
    planFromKb2LikeCount,
    nullFinanceNature,
    totalCount,
    unpaidFactExpense,
    allocationsAgg,
    bothPlanSourcesRows,
  ] = await Promise.all([
    prisma.financeEntry.groupBy({
      by: ["source"],
      where: liveFilter,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["kind", "type"],
      where: liveFilter,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["status"],
      where: liveFilter,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["source", "kind", "status"],
      where: liveFilter,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["source"],
      where: { ...liveFilter, kind: "FACT" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["financeNature"],
      where: liveFilter,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["source", "financeNature"],
      where: { ...liveFilter, financeNature: { not: null } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.financeEntry.count({
      where: {
        ...liveFilter,
        kind: "PLAN",
        type: "INCOME",
        source: "MANUAL",
        category: "client_advance",
      },
    }),
    prisma.financeEntry.count({ where: { financeNature: null } }),
    prisma.financeEntry.count({}),
    prisma.financeEntry.aggregate({
      where: {
        ...liveFilter,
        kind: "FACT",
        type: "EXPENSE",
        status: { not: "PAID" },
        counterpartyId: { not: null },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.supplierPaymentAllocation.aggregate({
      _sum: { amount: true },
    }),
    prisma.$queryRaw<Array<{ projectId: string }>>`
      SELECT DISTINCT a."projectId"
      FROM "finance_entries" a
      INNER JOIN "finance_entries" b ON b."projectId" = a."projectId"
      WHERE a."isArchived" = false
        AND b."isArchived" = false
        AND a.source = 'ESTIMATE_AUTO'
        AND a.kind = 'PLAN'
        AND b.source = 'STAGE_AUTO'
        AND b.kind = 'PLAN'
        AND a."projectId" IS NOT NULL
    `,
  ]);

  const debtRaw = Number(unpaidFactExpense._sum.amount ?? 0);
  const allocationsTotal = Number(allocationsAgg._sum.amount ?? 0);

  // Не точна arithmetic: deducts global allocations from global unpaid sum.
  // Для точного per-entry виключно йдемо у /api/admin/projects/[id]/supplier-debts.
  // Тут — лише висвітлює масштаб розриву між raw і allocation-aware.
  const debtAfterAllocations = Math.max(0, debtRaw - allocationsTotal);

  return NextResponse.json({
    capturedAt: new Date().toISOString(),
    totals: {
      totalEntries: totalCount,
      nullFinanceNature,
    },
    bySource: bySource.map((r) => ({
      source: r.source,
      count: r._count._all,
      sum: Number(r._sum.amount ?? 0),
    })),
    byKindType: byKindType.map((r) => ({
      kind: r.kind,
      type: r.type,
      count: r._count._all,
      sum: Number(r._sum.amount ?? 0),
    })),
    byStatus: byStatus.map((r) => ({
      status: r.status,
      count: r._count._all,
      sum: Number(r._sum.amount ?? 0),
    })),
    bySourceKindStatus: bySourceKindStatus
      .map((r) => ({
        source: r.source,
        kind: r.kind,
        status: r.status,
        count: r._count._all,
        sum: Number(r._sum.amount ?? 0),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    factBySource: factBySource.map((r) => ({
      source: r.source,
      count: r._count._all,
      sum: Number(r._sum.amount ?? 0),
    })),
    byFinanceNature: byFinanceNature.map((r) => ({
      financeNature: r.financeNature,
      count: r._count._all,
      sum: Number(r._sum.amount ?? 0),
    })),
    bySourceFinanceNature: bySourceFinanceNature.map((r) => ({
      source: r.source,
      financeNature: r.financeNature,
      count: r._count._all,
      sum: Number(r._sum.amount ?? 0),
    })),
    planFromKb2LikeCount,
    supplierDebt: {
      unpaidFactCount: unpaidFactExpense._count._all,
      debtRaw,
      allocationsTotal,
      debtAfterAllocations,
      note:
        "debtRaw НЕ субтрагує allocations (як зараз робить owner KPI). debtAfterAllocations — груба oцінка глобально. Точна per-project формула — у /api/admin/projects/[id]/supplier-debts.",
    },
    projectsWithBothPlanSources: bothPlanSourcesRows.length,
  });
}
