/**
 * Budget vs Actual roll-up for a single project.
 *
 * Phase 1 scope (no Commitments / ChangeOrders yet):
 *   plan      = Σ EstimateItem.amount  for APPROVED estimates of this project
 *   revised   = plan                                 (will diverge once ChangeOrder ships)
 *   committed = 0                                    (will be Σ active CommitmentItem)
 *   actual    = Σ FinanceEntry.amount   kind=FACT, !archived, any status
 *               (Metrum workflow: most FACT entries stay in DRAFT; we count them
 *                so the matrix matches what operators actually see in operations)
 *   forecast  = max(revised, committed + actual)
 *   variance  = revised - forecast                   (negative = overrun)
 *
 * Rows are returned for:
 *   - every CostCode that has any plan or actual on this project
 *   - parents are rolled up from their descendants (each row already includes the roll-up)
 *   - one synthetic "(без статті)" row aggregating items with NULL costCodeId
 */
import type { CostType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BudgetRow = {
  costCodeId: string | null;
  code: string | null;
  name: string;
  parentId: string | null;
  depth: number;
  isLeaf: boolean;
  defaultCostType: CostType | null;
  plan: number;
  revised: number;
  committed: number;
  actual: number;
  forecast: number;
  variance: number;
};

export type BudgetMatrix = {
  rows: BudgetRow[];
  totals: {
    plan: number;
    revised: number;
    committed: number;
    actual: number;
    forecast: number;
    variance: number;
  };
  meta: {
    estimatesIncluded: number;
    unclassifiedPlan: number;
    unclassifiedActual: number;
  };
};

const UNCLASSIFIED_KEY = "__unclassified__";

export async function computeBudgetMatrix(projectId: string): Promise<BudgetMatrix> {
  const [allCodes, planRows, actualRows, approvedEstimateCount] = await Promise.all([
    prisma.costCode.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        defaultCostType: true,
      },
    }),
    // Plan: sum EstimateItem.amount per costCode for APPROVED estimates of this project.
    prisma.estimateItem.groupBy({
      by: ["costCodeId"],
      where: {
        estimate: { projectId, status: "APPROVED" },
      },
      _sum: { amount: true },
    }),
    // Actual: sum FinanceEntry.amount per costCode where kind=FACT and not archived.
    // Status is NOT filtered — operators in Metrum keep most actuals in DRAFT and
    // we want to reflect what they see in the operations log.
    prisma.financeEntry.groupBy({
      by: ["costCodeId"],
      where: {
        projectId,
        kind: "FACT",
        isArchived: false,
      },
      _sum: { amount: true },
    }),
    prisma.estimate.count({ where: { projectId, status: "APPROVED" } }),
  ]);

  // Build leaf-level totals by costCodeId.
  const leaf: Record<string, { plan: number; actual: number }> = {};
  function bump(map: typeof leaf, key: string, field: "plan" | "actual", v: number) {
    if (!map[key]) map[key] = { plan: 0, actual: 0 };
    map[key][field] += v;
  }

  let unclassifiedPlan = 0;
  let unclassifiedActual = 0;

  for (const r of planRows) {
    const v = Number(r._sum.amount ?? 0);
    if (!r.costCodeId) unclassifiedPlan += v;
    else bump(leaf, r.costCodeId, "plan", v);
  }
  for (const r of actualRows) {
    const v = Number(r._sum.amount ?? 0);
    if (!r.costCodeId) unclassifiedActual += v;
    else bump(leaf, r.costCodeId, "actual", v);
  }

  // Roll up to ancestors. depth(codeId) computed on the fly.
  const byId = new Map(allCodes.map((c) => [c.id, c]));
  function ancestorChain(id: string): string[] {
    const chain: string[] = [];
    let cur = byId.get(id);
    while (cur) {
      chain.push(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  }
  function depth(id: string): number {
    return ancestorChain(id).length - 1;
  }

  // Total per code = its own + sum of all descendants. Easiest: for each leaf
  // entry, add to every ancestor.
  const total: Record<string, { plan: number; actual: number }> = {};
  for (const [codeId, vals] of Object.entries(leaf)) {
    for (const ancestorId of ancestorChain(codeId)) {
      if (!total[ancestorId]) total[ancestorId] = { plan: 0, actual: 0 };
      total[ancestorId].plan += vals.plan;
      total[ancestorId].actual += vals.actual;
    }
  }

  const childrenCountById = new Map<string, number>();
  for (const c of allCodes) {
    if (c.parentId) {
      childrenCountById.set(c.parentId, (childrenCountById.get(c.parentId) ?? 0) + 1);
    }
  }

  const rows: BudgetRow[] = [];
  for (const c of allCodes) {
    const t = total[c.id];
    if (!t) continue; // skip cost-codes that have no plan and no actual
    const plan = t.plan;
    const revised = plan; // until ChangeOrder ships
    const committed = 0; // until Commitment ships
    const actual = t.actual;
    const forecast = Math.max(revised, committed + actual);
    const variance = revised - forecast;
    rows.push({
      costCodeId: c.id,
      code: c.code,
      name: c.name,
      parentId: c.parentId,
      depth: depth(c.id),
      isLeaf: !childrenCountById.has(c.id),
      defaultCostType: c.defaultCostType,
      plan,
      revised,
      committed,
      actual,
      forecast,
      variance,
    });
  }

  // Sort by code (which already encodes hierarchy), Ukrainian collation.
  rows.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "uk"));

  // Append synthetic unclassified bucket if there's anything in it.
  if (unclassifiedPlan > 0 || unclassifiedActual > 0) {
    const plan = unclassifiedPlan;
    const actual = unclassifiedActual;
    const forecast = Math.max(plan, actual);
    rows.push({
      costCodeId: null,
      code: UNCLASSIFIED_KEY,
      name: "(без статті)",
      parentId: null,
      depth: 0,
      isLeaf: true,
      defaultCostType: null,
      plan,
      revised: plan,
      committed: 0,
      actual,
      forecast,
      variance: plan - forecast,
    });
  }

  // Totals: only top-level rows + unclassified to avoid double-counting children.
  const totals = rows.reduce(
    (acc, r) => {
      if (r.depth === 0) {
        acc.plan += r.plan;
        acc.revised += r.revised;
        acc.committed += r.committed;
        acc.actual += r.actual;
        acc.forecast += r.forecast;
        acc.variance += r.variance;
      }
      return acc;
    },
    { plan: 0, revised: 0, committed: 0, actual: 0, forecast: 0, variance: 0 },
  );

  return {
    rows,
    totals,
    meta: {
      estimatesIncluded: approvedEstimateCount,
      unclassifiedPlan,
      unclassifiedActual,
    },
  };
}
