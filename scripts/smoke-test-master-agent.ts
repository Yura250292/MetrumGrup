#!/usr/bin/env tsx
/**
 * Smoke test для MasterEstimateAgent.
 *
 * Запускає агента напряму у Node.js без HTTP/SSE/upload pipeline.
 * Якщо він падає — ми бачимо stack trace замість обрізаної SSE error.
 *
 *   npx tsx scripts/smoke-test-master-agent.ts
 */

import { MasterEstimateAgent } from '../src/lib/agents/master-estimate-agent';
import type { AgentContext } from '../src/lib/agents/base-agent';

async function main() {
  console.log('🔬 MasterEstimateAgent smoke test\n');

  // Перевірка env vars
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  console.log(`OPENAI_API_KEY: ${openaiKey ? `set (${openaiKey.slice(0, 10)}...)` : '❌ MISSING'}`);
  console.log(`GEMINI_API_KEY: ${geminiKey ? `set (${geminiKey.slice(0, 10)}...)` : '❌ MISSING'}`);

  if (!openaiKey || !geminiKey) {
    console.error('\n❌ Missing API keys — abort');
    process.exit(1);
  }

  // Маленький context подібний до того що приходить з frontend
  const context: AgentContext = {
    projectId: undefined,
    wizardData: {
      objectType: 'commercial',
      workScope: 'full_cycle',
      totalArea: '92.25',
      area: 92.25, // V2 controller додає це поле
      floors: 1,
      ceilingHeight: '3.5',
      utilities: {
        electrical: { power: 'three_phase', outlets: 0, switches: 0, lightPoints: 0, outdoorLighting: false },
        heating: { type: 'electric' },
        water: { coldWater: true, hotWater: true, source: 'central' },
        sewerage: { type: 'central', pumpNeeded: false },
        ventilation: { natural: true, forced: true, recuperation: false },
      },
      finishing: {
        walls: { material: 'paint', qualityLevel: 'standard' },
        flooring: { tile: 92 },
        ceiling: { type: 'paint', levels: 1, lighting: 'mixed' },
      },
      commercialData: {
        purpose: 'office',
        currentState: 'existing_renovation',
      },
      specialRequirements:
        'Sky Bank — банківське відділення, 92.25 м², ремонт у існуючому приміщенні. ' +
        'Газоблок + червона цегла. Висота 3.545 м. Стеля Грильято.',
    },
    documents: {
      plans: [],
      specifications: [],
      sitePhotos: [],
    },
    previousSections: [],
    masterContext:
      'Ремонт банківського відділення Sky Bank у Львові. Площа 92.25 м² (89 м² зал + 3.25 м² санвузол). ' +
      'Висота 3.545 м. Існуюча будівля з газоблоку та цегли. Очікуваний бюджет ~679 000 ₴ з ПДВ.',
  };

  console.log('\n🚀 Запускаю генерацію (9 секцій batch-by-batch)...\n');

  const agent = new MasterEstimateAgent();
  const startedAt = Date.now();

  try {
    const result = await agent.generate(context, (update) => {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const tag =
        update.status === 'complete'
          ? '✅'
          : update.status === 'error'
          ? '❌'
          : '⏳';
      console.log(
        `${tag} [+${elapsed}s] [${update.sectionIndex + 1}/${update.totalSections}] ${update.sectionTitle}: ` +
        `${update.status}` +
        (update.itemsGenerated ? ` (${update.itemsGenerated} items)` : '') +
        ((update as any).error ? ` — ${(update as any).error}` : '')
      );
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Done in ${elapsed}s`);
    console.log(`   sections:    ${result.sections.length}`);
    console.log(`   items:       ${result.metadata.totalItems}`);
    console.log(`   total:       ${result.totalCost.toLocaleString('uk-UA')} ₴`);
    console.log(`   warnings:    ${result.warnings.length}`);
    console.log(`   prozorroPricesUsed:  ${result.metadata.prozorroPricesUsed}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of result.warnings) console.log(`  - ${w}`);
    }
  } catch (error) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.error(`\n❌ THROWN at +${elapsed}s:`);
    console.error(error);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\n❌ main() crashed:', e);
  process.exit(1);
});
