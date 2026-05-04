/**
 * Helpers for derived stage metrics shown in the cross-project accordion view.
 * Pure functions over already-loaded numbers (no DB reads here).
 */

export function computeMargin(planIncome: number, planExpense: number): number | null {
  if (!planIncome || planIncome <= 0) return null;
  return Math.round(((planIncome - planExpense) / planIncome) * 100);
}

export function computeDeviation(factExpense: number, planExpense: number): number {
  return factExpense - planExpense;
}

export type MarginTier = "good" | "warn" | "bad" | "neutral";

export function marginTier(marginPct: number | null): MarginTier {
  if (marginPct === null) return "neutral";
  if (marginPct >= 25) return "good";
  if (marginPct >= 15) return "warn";
  return "bad";
}

export type StageBuckets = {
  planExpense: number;
  factExpense: number;
  planIncome: number;
  factIncome: number;
};

export function emptyBuckets(): StageBuckets {
  return { planExpense: 0, factExpense: 0, planIncome: 0, factIncome: 0 };
}

export function addBuckets(a: StageBuckets, b: StageBuckets): StageBuckets {
  return {
    planExpense: a.planExpense + b.planExpense,
    factExpense: a.factExpense + b.factExpense,
    planIncome: a.planIncome + b.planIncome,
    factIncome: a.factIncome + b.factIncome,
  };
}

/**
 * Sums buckets across an array of root-level nodes — used to compute
 * project-level totals from its top-level stages/groups.
 */
export function sumBuckets(buckets: StageBuckets[]): StageBuckets {
  return buckets.reduce(addBuckets, emptyBuckets());
}

/**
 * Average progress across non-completed children (or 100 if all completed).
 * Empty arrays return 0.
 */
export function rollupProgress(progresses: number[]): number {
  if (progresses.length === 0) return 0;
  const sum = progresses.reduce((a, b) => a + b, 0);
  return Math.round(sum / progresses.length);
}
