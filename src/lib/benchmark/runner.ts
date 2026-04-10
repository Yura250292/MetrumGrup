/**
 * Benchmark runner — given a `BenchmarkCase`, parse the reference XLSX,
 * obtain an "AI snapshot" (from a saved JSON or a fresh generation), and
 * compute metrics.
 *
 * Two ways to provide the AI side:
 *   1. `aiEstimateJsonPath` — path to a JSON file with the same shape as
 *      `EstimateData`. Lets you re-run metrics without re-generating.
 *   2. `generate(case)` — async function that produces a snapshot. The
 *      caller decides whether to call the real orchestrator or a mock.
 *
 * The runner is intentionally "pull-based": it never instantiates the
 * orchestrator itself, so it works in CI environments without API keys
 * or DB access.
 */

import * as fs from 'fs';
import { parseReferenceEstimate } from './reference-parser';
import {
  computeMetrics,
  snapshotFromReference,
  type BenchmarkMetrics,
  type NormalisedSnapshot,
} from './metrics';
import type { BenchmarkCase } from './dataset';

export interface BenchmarkResult {
  caseId: string;
  caseName: string;
  reference: {
    grandTotal: number;
    sectionCount: number;
    itemCount: number;
    format: 'single-column' | 'two-column';
  };
  ai: {
    grandTotal: number;
    sectionCount: number;
    itemCount: number;
  } | null;
  metrics: BenchmarkMetrics | null;
  warnings: string[];
}

export interface RunBenchmarkOptions {
  /** Pre-generated AI snapshot (saved JSON). */
  aiEstimateJsonPath?: string;
  /** Or a generator that returns a snapshot. */
  generate?: (c: BenchmarkCase) => Promise<NormalisedSnapshot>;
}

function normalizeAiJson(json: any): NormalisedSnapshot {
  const sections: any[] = json?.sections ?? [];
  const sectionTotals: Record<string, number> = {};
  let itemCount = 0;
  let pricedCount = 0;
  let lowConf = 0;
  let materials = 0;
  let labor = 0;

  for (const sec of sections) {
    const title = String(sec.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    let total = 0;
    for (const item of (sec.items ?? [])) {
      const qty = Number(item.quantity ?? 0);
      const price = Number(item.unitPrice ?? 0);
      const labourCost = Number(item.laborCost ?? 0);
      const itemTotal = Number(item.totalCost ?? item.amount ?? qty * price + labourCost);
      total += itemTotal;
      itemCount++;
      if (item.priceSource) pricedCount++;
      if (Number(item.confidence ?? 1) < 0.75) lowConf++;
      materials += qty * price;
      labor += labourCost;
    }
    sectionTotals[title] = total;
  }

  return {
    totalAmount: Number(json?.summary?.totalCost ?? Object.values(sectionTotals).reduce((a, b) => a + b, 0)),
    sectionTotals,
    itemCount,
    pricedItemCount: pricedCount,
    lowConfidenceCount: lowConf,
    materialsCost: materials,
    laborCost: labor,
  };
}

export async function runBenchmark(
  testCase: BenchmarkCase,
  options: RunBenchmarkOptions
): Promise<BenchmarkResult> {
  const warnings: string[] = [];

  // 1. Parse reference XLSX.
  const reference = parseReferenceEstimate(testCase.referenceXlsxPath);
  const refSnapshot = snapshotFromReference(reference);

  // 2. Sanity check expectations.
  if (testCase.expectations?.grandTotalUah) {
    const expected = testCase.expectations.grandTotalUah;
    const tol = testCase.expectations.grandTotalToleranceFraction ?? 0.05;
    const diff = Math.abs(reference.totals.grandTotal - expected) / expected;
    if (diff > tol) {
      warnings.push(
        `Reference parser disagrees with expected grand total: ` +
        `parsed ${reference.totals.grandTotal}, expected ${expected} (off by ${(diff * 100).toFixed(1)}%)`
      );
    }
  }

  // 2b. Sanity check: wizardData.totalArea must match verifiedFacts.totalAreaM2.
  // This catches cases where someone updates the wizard hint without re-reading
  // the PDF, which would silently feed wrong inputs to the AI generator.
  if (testCase.verifiedFacts?.totalAreaM2 && testCase.wizardData.totalArea) {
    const verified = testCase.verifiedFacts.totalAreaM2;
    const wizard = testCase.wizardData.totalArea;
    const diff = Math.abs(wizard - verified) / verified;
    if (diff > 0.05) {
      warnings.push(
        `wizardData.totalArea (${wizard} m²) disagrees with verifiedFacts ` +
        `(${verified} m²) by ${(diff * 100).toFixed(1)}% — re-check the PDF`
      );
    }
  }

  // 3. Obtain AI snapshot (if any).
  let aiSnapshot: NormalisedSnapshot | null = null;
  if (options.aiEstimateJsonPath) {
    if (!fs.existsSync(options.aiEstimateJsonPath)) {
      warnings.push(`AI JSON not found: ${options.aiEstimateJsonPath}`);
    } else {
      const raw = JSON.parse(fs.readFileSync(options.aiEstimateJsonPath, 'utf-8'));
      aiSnapshot = normalizeAiJson(raw);
    }
  } else if (options.generate) {
    try {
      aiSnapshot = await options.generate(testCase);
    } catch (e) {
      warnings.push(`generate() failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const metrics = aiSnapshot ? computeMetrics(aiSnapshot, refSnapshot) : null;

  return {
    caseId: testCase.id,
    caseName: testCase.name,
    reference: {
      grandTotal: reference.totals.grandTotal,
      sectionCount: reference.sections.length,
      itemCount: reference.itemCount,
      format: reference.format,
    },
    ai: aiSnapshot
      ? {
          grandTotal: aiSnapshot.totalAmount,
          sectionCount: Object.keys(aiSnapshot.sectionTotals).length,
          itemCount: aiSnapshot.itemCount,
        }
      : null,
    metrics,
    warnings,
  };
}
