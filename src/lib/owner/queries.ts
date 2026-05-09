import { prisma } from "@/lib/prisma";
import type { CostType } from "@prisma/client";

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
  /** Плановий дохід — сума PLAN income. */
  planIncome: number;
  /** Планові витрати — сума PLAN expense. */
  planExpense: number;
  /** Фактичні доходи — FACT income. */
  factIncome: number;
  /** Фактичні витрати — FACT expense. */
  factExpense: number;
  /** Заборгованість постачальникам — сума FACT EXPENSE WHERE status != PAID. */
  totalDebt: number;
  /** Кількість постачальників з боргом. */
  debtorCount: number;
  /** Кількість активних проектів. */
  activeProjects: number;
  /** Кількість foreman звітів PENDING_APPROVAL. */
  pendingForemanReports: number;
}

export async function getDashboardKpis(firmId: string | null): Promise<DashboardKpis> {
  const where = firmWhere(firmId);

  const [
    planIncome,
    planExpense,
    factIncome,
    factExpense,
    debtAgg,
    debtorIds,
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
    // Заборгованість: FACT EXPENSE з контрагентом, що НЕ позначено як PAID
    prisma.financeEntry.aggregate({
      where: {
        ...where,
        kind: "FACT",
        type: "EXPENSE",
        isArchived: false,
        status: { not: "PAID" },
        counterpartyId: { not: null },
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.findMany({
      where: {
        ...where,
        kind: "FACT",
        type: "EXPENSE",
        isArchived: false,
        status: { not: "PAID" },
        counterpartyId: { not: null },
      },
      select: { counterpartyId: true },
      distinct: ["counterpartyId"],
    }),
    prisma.project.count({
      where: { ...where, status: "ACTIVE" },
    }),
    prisma.foremanReport.count({
      where: { ...where, status: "PENDING_APPROVAL" },
    }),
  ]);

  return {
    planIncome: Number(planIncome._sum.amount ?? 0),
    planExpense: Number(planExpense._sum.amount ?? 0),
    factIncome: Number(factIncome._sum.amount ?? 0),
    factExpense: Number(factExpense._sum.amount ?? 0),
    totalDebt: Number(debtAgg._sum.amount ?? 0),
    debtorCount: debtorIds.length,
    activeProjects,
    pendingForemanReports,
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
 * Для кожного: загальна сума, кількість неоплачених записів, найдавніший
 * неоплачений запис, остання оплата (PAID), останній проект з боргом.
 */
export async function getSupplierDebt(
  firmId: string | null,
  limit = 50,
): Promise<SupplierDebtRow[]> {
  const where = firmWhere(firmId);

  // Aggregate unpaid debts grouped by counterparty
  const grouped = await prisma.financeEntry.groupBy({
    by: ["counterpartyId"],
    where: {
      ...where,
      kind: "FACT",
      type: "EXPENSE",
      isArchived: false,
      status: { not: "PAID" },
      counterpartyId: { not: null },
    },
    _sum: { amount: true },
    _count: { _all: true },
    _min: { occurredAt: true },
  });

  if (grouped.length === 0) return [];

  // Завантажуємо контрагентів + остання оплата + останній проект (паралельно)
  const counterpartyIds = grouped
    .map((g) => g.counterpartyId)
    .filter((id): id is string => !!id);

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
        status: { not: "PAID" },
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

  const rows: SupplierDebtRow[] = grouped
    .filter((g) => g.counterpartyId)
    .map((g) => ({
      counterpartyId: g.counterpartyId as string,
      name: cpMap.get(g.counterpartyId as string) ?? "—",
      totalDebt: Number(g._sum.amount ?? 0),
      unpaidEntriesCount: g._count._all,
      oldestUnpaidAt: g._min.occurredAt?.toISOString() ?? null,
      lastPaidAt: lastPaidMap.get(g.counterpartyId) ?? null,
      lastProjectTitle: lastProjectMap.get(g.counterpartyId) ?? null,
    }));

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
