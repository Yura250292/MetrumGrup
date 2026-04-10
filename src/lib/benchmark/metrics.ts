/**
 * Metrics for the benchmark runner (Plan Stage 9.2).
 *
 * Inputs are normalised "estimate snapshots" — both the AI-generated and
 * the reference (ground-truth) one. The metrics are deliberately simple
 * and bounded so a regression suite can compare runs over time.
 *
 *   • absoluteTotalErrorPct  — |aiTotal − refTotal| / refTotal
 *   • sectionErrorPct        — average |aiSec − refSec| / refSec across matching sections
 *   • itemCountCompleteness  — aiItems / refItems (capped at 1.0)
 *   • sourceCoveragePct      — fraction of AI items with priceSource set
 *   • lowConfidenceShare     — fraction of AI items with confidence < 0.75
 *   • validationIssuesCount  — passed in by caller
 *   • materialLaborSplitErr  — only for Format B references that distinguish
 *                              materials/labor; otherwise undefined
 */

import type { ReferenceEstimate } from './reference-parser';

export interface NormalisedSnapshot {
  totalAmount: number;
  /** Cost broken down by section title. Title comparisons are case-insensitive. */
  sectionTotals: Record<string, number>;
  itemCount: number;
  /** Number of items that have a priceSource set (any non-empty value). */
  pricedItemCount: number;
  /** Number of items with confidence < 0.75. */
  lowConfidenceCount: number;
  /** Optional split, useful only when both sides report it. */
  materialsCost?: number;
  laborCost?: number;
}

export interface BenchmarkMetrics {
  absoluteTotalErrorPct: number;
  sectionErrorPct: number | null;
  matchedSectionCount: number;
  itemCountCompleteness: number;
  sourceCoveragePct: number;
  lowConfidenceShare: number;
  validationIssuesCount: number;
  materialsErrorPct?: number;
  laborErrorPct?: number;
}

function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яёії0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build a NormalisedSnapshot from a `ReferenceEstimate` (so the metrics
 * functions can treat both sides identically).
 */
export function snapshotFromReference(ref: ReferenceEstimate): NormalisedSnapshot {
  const sectionTotals: Record<string, number> = {};
  for (const sec of ref.sections) {
    sectionTotals[normaliseTitle(sec.title)] = sec.sectionTotal;
  }
  return {
    totalAmount: ref.totals.grandTotal,
    sectionTotals,
    itemCount: ref.itemCount,
    pricedItemCount: ref.itemCount, // every reference item has a real price
    lowConfidenceCount: 0,
    materialsCost: ref.totals.materialsTotal,
    laborCost: ref.totals.worksTotal,
  };
}

export function computeMetrics(
  ai: NormalisedSnapshot,
  ref: NormalisedSnapshot,
  validationIssuesCount = 0
): BenchmarkMetrics {
  const refTotal = ref.totalAmount || 1;
  const absoluteTotalErrorPct = Math.abs(ai.totalAmount - ref.totalAmount) / refTotal;

  // Section-level error: average over sections that exist in both snapshots.
  const refKeys = Object.keys(ref.sectionTotals);
  let matched = 0;
  let sectionSum = 0;
  for (const key of refKeys) {
    const refValue = ref.sectionTotals[key];
    const aiValue = ai.sectionTotals[key];
    if (refValue > 0 && aiValue !== undefined) {
      matched++;
      sectionSum += Math.abs(aiValue - refValue) / refValue;
    }
  }
  const sectionErrorPct = matched > 0 ? sectionSum / matched : null;

  const itemCountCompleteness = ref.itemCount > 0
    ? Math.min(1, ai.itemCount / ref.itemCount)
    : 1;

  const sourceCoveragePct = ai.itemCount > 0 ? ai.pricedItemCount / ai.itemCount : 1;
  const lowConfidenceShare = ai.itemCount > 0 ? ai.lowConfidenceCount / ai.itemCount : 0;

  // Material / labor split error — only when both sides report something.
  let materialsErrorPct: number | undefined;
  let laborErrorPct: number | undefined;
  if (
    ref.materialsCost !== undefined && ref.materialsCost > 0 &&
    ai.materialsCost !== undefined
  ) {
    materialsErrorPct = Math.abs(ai.materialsCost - ref.materialsCost) / ref.materialsCost;
  }
  if (
    ref.laborCost !== undefined && ref.laborCost > 0 &&
    ai.laborCost !== undefined
  ) {
    laborErrorPct = Math.abs(ai.laborCost - ref.laborCost) / ref.laborCost;
  }

  return {
    absoluteTotalErrorPct,
    sectionErrorPct,
    matchedSectionCount: matched,
    itemCountCompleteness,
    sourceCoveragePct,
    lowConfidenceShare,
    validationIssuesCount,
    materialsErrorPct,
    laborErrorPct,
  };
}

export function formatPct(value: number | null | undefined, dp = 1): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(dp)}%`;
}
