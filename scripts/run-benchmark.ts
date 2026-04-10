#!/usr/bin/env tsx
/**
 * Benchmark runner CLI (Plan Stage 9).
 *
 *   npx tsx scripts/run-benchmark.ts                      # all cases, parser-only
 *   npx tsx scripts/run-benchmark.ts --case=armet-office-lubinska
 *   npx tsx scripts/run-benchmark.ts --ai=path/to/estimate.json --case=sky-bank-lviv
 *
 * Without `--ai`, the script just parses the reference XLSX, prints a summary,
 * and verifies it matches `expectations.grandTotalUah`. With `--ai`, it also
 * loads the AI-generated estimate JSON and computes the full metric set.
 */

import * as path from 'path';
import { BENCHMARK_CASES } from '../src/lib/benchmark/dataset';
import { runBenchmark } from '../src/lib/benchmark/runner';
import { formatPct } from '../src/lib/benchmark/metrics';

const args = process.argv.slice(2).reduce<Record<string, string | true>>((acc, arg) => {
  if (arg.startsWith('--')) {
    const [k, v] = arg.slice(2).split('=');
    acc[k] = v ?? true;
  }
  return acc;
}, {});

(async () => {
  const cases = args.case
    ? BENCHMARK_CASES.filter((c) => c.id === args.case)
    : BENCHMARK_CASES;

  if (cases.length === 0) {
    console.error(`No matching benchmark case for --case=${args.case}`);
    console.error(`Available: ${BENCHMARK_CASES.map((c) => c.id).join(', ')}`);
    process.exit(2);
  }

  const aiPath = typeof args.ai === 'string' ? path.resolve(args.ai as string) : undefined;
  const results = [];

  for (const c of cases) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 ${c.name}  [${c.id}]`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
      const result = await runBenchmark(c, { aiEstimateJsonPath: aiPath });
      results.push(result);

      console.log('Reference:');
      console.log(`  format       ${result.reference.format}`);
      console.log(`  grand total  ${result.reference.grandTotal.toLocaleString('uk-UA')} ₴`);
      console.log(`  sections     ${result.reference.sectionCount}`);
      console.log(`  items        ${result.reference.itemCount}`);

      if (result.ai) {
        console.log('AI:');
        console.log(`  grand total  ${result.ai.grandTotal.toLocaleString('uk-UA')} ₴`);
        console.log(`  sections     ${result.ai.sectionCount}`);
        console.log(`  items        ${result.ai.itemCount}`);
      } else {
        console.log('AI: (not provided — pass --ai=path/to/estimate.json to enable metrics)');
      }

      if (result.metrics) {
        const m = result.metrics;
        console.log('Metrics:');
        console.log(`  total error              ${formatPct(m.absoluteTotalErrorPct)}`);
        console.log(`  section error (matched)  ${formatPct(m.sectionErrorPct)}  (${m.matchedSectionCount} sections matched)`);
        console.log(`  item completeness        ${formatPct(m.itemCountCompleteness)}`);
        console.log(`  source coverage          ${formatPct(m.sourceCoveragePct)}`);
        console.log(`  low-confidence share     ${formatPct(m.lowConfidenceShare)}`);
        if (m.materialsErrorPct !== undefined) {
          console.log(`  materials error          ${formatPct(m.materialsErrorPct)}`);
        }
        if (m.laborErrorPct !== undefined) {
          console.log(`  labor error              ${formatPct(m.laborErrorPct)}`);
        }
      }

      if (result.warnings.length > 0) {
        console.log('Warnings:');
        for (const w of result.warnings) console.log(`  ⚠️  ${w}`);
      } else {
        console.log('✅ No warnings');
      }
    } catch (e) {
      console.error('❌ Failed:', e instanceof Error ? e.message : e);
      results.push({
        caseId: c.id,
        caseName: c.name,
        error: e instanceof Error ? e.message : String(e),
      } as any);
    }
  }

  const failed = results.filter((r: any) => r.error || (r.warnings?.length ?? 0) > 0);
  console.log(`\n━━━ Done: ${results.length} case(s), ${failed.length} with warnings/errors ━━━`);
  process.exit(failed.length > 0 ? 1 : 0);
})();
