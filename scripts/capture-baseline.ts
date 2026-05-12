import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
const prisma = new PrismaClient();

async function main() {
  const liveFilter = { isArchived: false };

  const [
    bySource,
    byKindType,
    byStatus,
    factBySource,
    byFinanceNature,
    bySourceFinanceNature,
    nullFinanceNature,
    totalCount,
    unpaidFactExpense,
    allocationsAgg,
  ] = await Promise.all([
    prisma.financeEntry.groupBy({ by: ["source"], where: liveFilter, _count: { _all: true }, _sum: { amount: true } }),
    prisma.financeEntry.groupBy({ by: ["kind", "type"], where: liveFilter, _count: { _all: true }, _sum: { amount: true } }),
    prisma.financeEntry.groupBy({ by: ["status"], where: liveFilter, _count: { _all: true }, _sum: { amount: true } }),
    prisma.financeEntry.groupBy({ by: ["source"], where: { ...liveFilter, kind: "FACT" }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.financeEntry.groupBy({ by: ["financeNature"], where: liveFilter, _count: { _all: true }, _sum: { amount: true } }),
    prisma.financeEntry.groupBy({ by: ["source", "financeNature"], where: { ...liveFilter, financeNature: { not: null } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.financeEntry.count({ where: { financeNature: null } }),
    prisma.financeEntry.count({}),
    prisma.financeEntry.aggregate({ where: { ...liveFilter, kind: "FACT", type: "EXPENSE", status: { not: "PAID" }, counterpartyId: { not: null } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.supplierPaymentAllocation.aggregate({ _sum: { amount: true } }),
  ]);

  const debtRaw = Number(unpaidFactExpense._sum.amount ?? 0);
  const allocationsTotal = Number(allocationsAgg._sum.amount ?? 0);
  const out = {
    capturedAt: new Date().toISOString(),
    totals: { totalEntries: totalCount, nullFinanceNature },
    bySource: bySource.map(r => ({ source: r.source, count: r._count._all, sum: Number(r._sum.amount ?? 0) })),
    byKindType: byKindType.map(r => ({ kind: r.kind, type: r.type, count: r._count._all, sum: Number(r._sum.amount ?? 0) })),
    byStatus: byStatus.map(r => ({ status: r.status, count: r._count._all, sum: Number(r._sum.amount ?? 0) })),
    factBySource: factBySource.map(r => ({ source: r.source, count: r._count._all, sum: Number(r._sum.amount ?? 0) })),
    byFinanceNature: byFinanceNature.map(r => ({ financeNature: r.financeNature, count: r._count._all, sum: Number(r._sum.amount ?? 0) })),
    bySourceFinanceNature: bySourceFinanceNature.map(r => ({ source: r.source, financeNature: r.financeNature, count: r._count._all, sum: Number(r._sum.amount ?? 0) })),
    supplierDebt: { unpaidFactCount: unpaidFactExpense._count._all, debtRaw, allocationsTotal, debtAfterAllocations: Math.max(0, debtRaw - allocationsTotal) },
  };
  const path = `FINANCE_BASELINE_${new Date().toISOString().slice(0,10)}.json`;
  fs.writeFileSync(path, JSON.stringify(out, null, 2));
  console.log("✅ Captured baseline:", path);
  console.log("Total:", totalCount, "| null:", nullFinanceNature, "| classified:", totalCount - nullFinanceNature);
  console.log("byFinanceNature:", out.byFinanceNature.map(r => `${r.financeNature ?? "null"}:${r.count}`).join(" | "));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
