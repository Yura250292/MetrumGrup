import { prisma } from "@/lib/prisma";
import type { CostType } from "@prisma/client";
import { computeSupplierOutstanding } from "@/lib/finance/supplier-allocation";

/**
 * Owner-side агрегатори. Усі запити firm-aware: якщо firmId=null —
 * cross-firm view (Group + Studio разом). Передавай конкретний firmId
 * для ізольованого зрізу.
 */

interface FirmFilter {
  firmId?: string;
}

function firmWhere(firmId: string | null): FirmFilter {
  return firmId ? { firmId } : {};
}

export interface DashboardKpis {
  /** Плановий дохід — сума PLAN income (legacy v1). */
  planIncome: number;
  /** Планові витрати — сума PLAN expense (legacy v1). */
  planExpense: number;
  /** Фактичні доходи — FACT income (legacy v1, мікс ACTUAL+null). */
  factIncome: number;
  /** Фактичні витрати — FACT expense (legacy v1, мікс ACTUAL+COMMITTED+null). */
  factExpense: number;
  /**
   * Заборгованість постачальникам — сума outstanding (amount − allocations)
   * по FE зі статусом APPROVED|PENDING. Узгоджено з канонічним розрахунком
   * /api/admin/projects/[id]/supplier-debts.
   */
  totalDebt: number;
  /** Кількість постачальників з ненульовим боргом (після allocations). */
  debtorCount: number;
  /** Кількість активних проектів. */
  activeProjects: number;
  /** Кількість foreman звітів PENDING_APPROVAL. */
  pendingForemanReports: number;

  /** Safe Finance Migration v2 shelves. */
  budgetIncome: number;
  budgetExpense: number;
  committedIncome: number;
  committedExpense: number;
  /** Реальні надходження від клієнтів (FE.ACTUAL_INCOME). */
  actualCashIncome: number;
  /** Реальні виплати постачальникам (SupplierPayment status=POSTED). */
  actualCashExpense: number;
}

export async function getDashboardKpis(firmId: string | null): Promise<DashboardKpis> {
  const where = firmWhere(firmId);
  const paymentWhere = firmId ? { firmId, status: "POSTED" as const } : { status: "POSTED" as const };

  const [
    planIncome,
    planExpense,
    factIncome,
    factExpense,
    natureRows,
    paymentsAgg,
    outstandingByCp,
    activeProjects,
    pendingForemanReports,
  ] = await Promise.all([
    prisma.financeEntry.aggregate({
      where: { ...where, kind: "PLAN", type: "INCOME", isArchived: false },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: { ...where, kind: "PLAN", type: "EXPENSE", isArchived: false },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: { ...where, kind: "FACT", type: "INCOME", isArchived: false },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: { ...where, kind: "FACT", type: "EXPENSE", isArchived: false },
      _sum: { amount: true },
    }),
    // v2 shelves — групуємо за financeNature.
    prisma.financeEntry.groupBy({
      by: ["financeNature"],
      where: { ...where, isArchived: false },
      _sum: { amount: true },
    }),
    prisma.supplierPayment.aggregate({
      where: paymentWhere,
      _sum: { amount: true },
    }),
    computeSupplierOutstanding({ firmId }),
    prisma.project.count({
      where: { ...where, status: "ACTIVE" },
    }),
    prisma.foremanReport.count({
      where: { ...where, status: "PENDING_APPROVAL" },
    }),
  ]);

  let totalDebt = 0;
  for (const row of outstandingByCp.values()) {
    totalDebt += row.outstanding;
  }

  const byNature: Record<string, number> = {};
  for (const r of natureRows) {
    if (r.financeNature) {
      byNature[r.financeNature] = Number(r._sum.amount ?? 0);
    }
  }

  return {
    planIncome: Number(planIncome._sum.amount ?? 0),
    planExpense: Number(planExpense._sum.amount ?? 0),
    factIncome: Number(factIncome._sum.amount ?? 0),
    factExpense: Number(factExpense._sum.amount ?? 0),
    totalDebt,
    debtorCount: outstandingByCp.size,
    activeProjects,
    pendingForemanReports,
    budgetIncome: byNature["BUDGET_INCOME"] ?? 0,
    budgetExpense: byNature["BUDGET_EXPENSE"] ?? 0,
    committedIncome: byNature["COMMITTED_INCOME"] ?? 0,
    committedExpense: byNature["COMMITTED_EXPENSE"] ?? 0,
    actualCashIncome: byNature["ACTUAL_INCOME"] ?? 0,
    actualCashExpense: Number(paymentsAgg._sum.amount ?? 0),
  };
}

export interface SupplierDebtRow {
  counterpartyId: string;
  name: string;
  totalDebt: number;
  unpaidEntriesCount: number;
  oldestUnpaidAt: string | null;
  lastPaidAt: string | null;
  /** Останній проект де є борг — для контексту. */
  lastProjectTitle: string | null;
}

/**
 * Повертає список постачальників з заборгованістю, відсортовано за сумою боргу.
 * Для кожного: загальна сума outstanding (amount − allocations), кількість
 * не повністю покритих записів, найдавніший такий запис, остання оплата
 * (PAID), останній проект з боргом.
 *
 * Канонічна формула боргу: amount − SUM(SupplierPaymentAllocation). FE з
 * outstanding ≤ 0 (повністю покриті частковими виплатами, але ще не позначені
 * PAID) у борг не входять. DRAFT не вважається боргом (статус APPROVED|PENDING).
 */
export async function getSupplierDebt(
  firmId: string | null,
  limit = 50,
): Promise<SupplierDebtRow[]> {
  const where = firmWhere(firmId);

  const outstandingByCp = await computeSupplierOutstanding({ firmId });
  if (outstandingByCp.size === 0) return [];

  const counterpartyIds = Array.from(outstandingByCp.keys());

  const [counterparties, lastPayments, lastProjects] = await Promise.all([
    prisma.counterparty.findMany({
      where: { id: { in: counterpartyIds } },
      select: { id: true, name: true, displayName: true },
    }),
    // Остання PAID операція по кожному counterparty
    prisma.financeEntry.findMany({
      where: {
        ...where,
        kind: "FACT",
        type: "EXPENSE",
        status: "PAID",
        counterpartyId: { in: counterpartyIds },
      },
      orderBy: { paidAt: "desc" },
      distinct: ["counterpartyId"],
      select: { counterpartyId: true, paidAt: true },
    }),
    // Останній проект з неоплаченим записом по кожному counterparty
    prisma.financeEntry.findMany({
      where: {
        ...where,
        kind: "FACT",
        type: "EXPENSE",
        status: { in: ["APPROVED", "PENDING"] },
        counterpartyId: { in: counterpartyIds },
      },
      orderBy: { occurredAt: "desc" },
      distinct: ["counterpartyId"],
      select: {
        counterpartyId: true,
        project: { select: { title: true } },
      },
    }),
  ]);

  const cpMap = new Map(
    counterparties.map((c) => [c.id, c.displayName ?? c.name]),
  );
  const lastPaidMap = new Map(
    lastPayments.map((p) => [p.counterpartyId, p.paidAt?.toISOString() ?? null]),
  );
  const lastProjectMap = new Map(
    lastProjects.map((lp) => [lp.counterpartyId, lp.project?.title ?? null]),
  );

  const rows: SupplierDebtRow[] = Array.from(outstandingByCp.values()).map(
    (row) => ({
      counterpartyId: row.counterpartyId,
      name: cpMap.get(row.counterpartyId) ?? "—",
      totalDebt: row.outstanding,
      unpaidEntriesCount: row.unpaidEntriesCount,
      oldestUnpaidAt: row.oldestUnpaidAt?.toISOString() ?? null,
      lastPaidAt: lastPaidMap.get(row.counterpartyId) ?? null,
      lastProjectTitle: lastProjectMap.get(row.counterpartyId) ?? null,
    }),
  );

  rows.sort((a, b) => b.totalDebt - a.totalDebt);
  return rows.slice(0, limit);
}

export interface ProjectFinanceRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  firmId: string | null;
  planIncome: number;
  planExpense: number;
  factIncome: number;
  factExpense: number;
  /** PLAN маржа = planIncome − planExpense. */
  planMargin: number;
  /** FACT маржа = factIncome − factExpense. */
  factMargin: number;
  /** Burn-rate % = factExpense / planExpense (якщо planExpense > 0). */
  burnRate: number | null;
}

export async function getProjectsFinanceOverview(
  firmId: string | null,
  options: { limit?: number; orderBy?: "factExpense" | "planExpense" | "title" } = {},
): Promise<ProjectFinanceRow[]> {
  const where = firmWhere(firmId);

  const projects = await prisma.project.findMany({
    where: {
      ...where,
      status: { not: "CANCELLED" },
      isTestProject: false,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      firmId: true,
    },
    take: options.limit ?? 100,
  });

  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);
  const aggregates = await prisma.financeEntry.groupBy({
    by: ["projectId", "kind", "type"],
    where: {
      projectId: { in: ids },
      isArchived: false,
    },
    _sum: { amount: true },
  });

  const byProject = new Map<
    string,
    { planIncome: number; planExpense: number; factIncome: number; factExpense: number }
  >();
  for (const id of ids) {
    byProject.set(id, { planIncome: 0, planExpense: 0, factIncome: 0, factExpense: 0 });
  }
  for (const a of aggregates) {
    if (!a.projectId) continue;
    const bucket = byProject.get(a.projectId);
    if (!bucket) continue;
    const v = Number(a._sum.amount ?? 0);
    if (a.kind === "PLAN" && a.type === "INCOME") bucket.planIncome += v;
    else if (a.kind === "PLAN" && a.type === "EXPENSE") bucket.planExpense += v;
    else if (a.kind === "FACT" && a.type === "INCOME") bucket.factIncome += v;
    else if (a.kind === "FACT" && a.type === "EXPENSE") bucket.factExpense += v;
  }

  const rows: ProjectFinanceRow[] = projects.map((p) => {
    const b = byProject.get(p.id)!;
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      firmId: p.firmId,
      planIncome: b.planIncome,
      planExpense: b.planExpense,
      factIncome: b.factIncome,
      factExpense: b.factExpense,
      planMargin: b.planIncome - b.planExpense,
      factMargin: b.factIncome - b.factExpense,
      burnRate: b.planExpense > 0 ? b.factExpense / b.planExpense : null,
    };
  });

  const orderBy = options.orderBy ?? "factExpense";
  rows.sort((a, b) => {
    if (orderBy === "title") return a.title.localeCompare(b.title, "uk");
    return (b[orderBy] as number) - (a[orderBy] as number);
  });

  return rows;
}

export interface ProjectByCostType {
  costType: CostType | null;
  planExpense: number;
  factExpense: number;
}

export async function getProjectCostBreakdown(
  projectId: string,
  firmId: string | null,
): Promise<ProjectByCostType[]> {
  // Sanity check: проект у тій же фірмі
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...(firmId ? { firmId } : {}) },
    select: { id: true },
  });
  if (!project) return [];

  const aggregates = await prisma.financeEntry.groupBy({
    by: ["costType", "kind"],
    where: {
      projectId,
      type: "EXPENSE",
      isArchived: false,
    },
    _sum: { amount: true },
  });

  const byType = new Map<CostType | "null", { plan: number; fact: number }>();
  for (const a of aggregates) {
    const key = (a.costType ?? "null") as CostType | "null";
    if (!byType.has(key)) byType.set(key, { plan: 0, fact: 0 });
    const bucket = byType.get(key)!;
    const v = Number(a._sum.amount ?? 0);
    if (a.kind === "PLAN") bucket.plan += v;
    else if (a.kind === "FACT") bucket.fact += v;
  }

  const result: ProjectByCostType[] = [];
  for (const [key, b] of byType) {
    result.push({
      costType: key === "null" ? null : (key as CostType),
      planExpense: b.plan,
      factExpense: b.fact,
    });
  }
  result.sort((a, b) => b.factExpense - a.factExpense);
  return result;
}
