#!/usr/bin/env tsx
/**
 * Dump a saved estimate from the database into the JSON shape that
 * `scripts/run-benchmark.ts` understands.
 *
 *   npx tsx scripts/dump-estimate.ts <estimateId> [--out=path/to/file.json]
 *
 *   # Examples:
 *   npx tsx scripts/dump-estimate.ts cmnrzbw690001la04z7q8dphm
 *   npx tsx scripts/dump-estimate.ts cmnrzbw690001la04z7q8dphm --out=./benchmarks/sky-bank.json
 *
 * The output is a single JSON object with `title`, `sections[]`, and a
 * `summary.totalCost` line that the benchmark runner reads. Items carry
 * the engine metadata (engineKey, itemType, priceSource, confidence) so
 * benchmark metrics can compute source coverage and low-confidence share.
 *
 * Run from the metrum-group directory; uses the same .env DATABASE_URL as
 * the rest of the app.
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/prisma';

const args = process.argv.slice(2);
const estimateId = args.find((a) => !a.startsWith('--'));
const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1];

if (!estimateId) {
  console.error('Usage: npx tsx scripts/dump-estimate.ts <estimateId> [--out=path]');
  process.exit(2);
}

(async () => {
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!estimate) {
      console.error(`Estimate ${estimateId} not found`);
      process.exit(1);
    }

    const dump = {
      id: estimate.id,
      number: estimate.number,
      title: estimate.title,
      summary: {
        totalCost: Number(estimate.totalAmount),
        totalMaterials: Number(estimate.totalMaterials),
        totalLabor: Number(estimate.totalLabor),
        totalOverhead: Number(estimate.totalOverhead),
        finalAmount: Number(estimate.finalAmount),
      },
      sections: estimate.sections.map((section) => ({
        title: section.title,
        sortOrder: section.sortOrder,
        sectionTotal: Number(section.totalAmount ?? 0),
        items: section.items.map((item) => ({
          description: item.description,
          unit: item.unit,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          laborRate: Number(item.laborRate),
          laborHours: Number(item.laborHours),
          // Carry the labor cost in the AI-format field too so the metrics
          // module sees it consistently.
          laborCost: Number(item.laborRate) * Number(item.laborHours),
          totalCost: Number(item.amount),
          amount: Number(item.amount),
          itemType: (item as any).itemType ?? null,
          engineKey: (item as any).engineKey ?? null,
          quantityFormula: (item as any).quantityFormula ?? null,
          priceSource: (item as any).priceSource ?? null,
          priceSourceType: (item as any).priceSourceType ?? null,
          confidence:
            (item as any).confidence !== null && (item as any).confidence !== undefined
              ? Number((item as any).confidence)
              : null,
        })),
      })),
    };

    const outPath = outArg
      ? path.resolve(outArg)
      : path.resolve(`./tmp/estimate-${estimate.number}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf-8');

    console.log(`✅ Dumped estimate ${estimate.number} (${estimate.id})`);
    console.log(`   Title:   ${estimate.title}`);
    console.log(`   Total:   ${Number(estimate.totalAmount).toLocaleString('uk-UA')} ₴`);
    console.log(`   Sections: ${estimate.sections.length}`);
    console.log(
      `   Items:   ${estimate.sections.reduce((s, sec) => s + sec.items.length, 0)}`
    );
    console.log(`   Wrote → ${outPath}`);
    console.log('');
    console.log('Next:');
    console.log(`  npx tsx scripts/run-benchmark.ts --case=<case-id> --ai=${outPath}`);
  } catch (e) {
    console.error('Failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
