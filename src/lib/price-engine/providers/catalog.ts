/**
 * Catalog provider — wraps the existing static `materials-database-extended`
 * and `work-items-database-extended`. This is the highest-priority source
 * (sourceWeight 1.0) because the catalog is hand-curated.
 *
 * Note: today the catalog is hard-coded TypeScript. Plan 4.2 calls for
 * canonical IDs, regional pricing, effectiveDate, etc. Until that lands, we
 * extract what we can from `MaterialWithPrice` / `WorkItemWithPrice`:
 *   • averagePrice  → unitPrice
 *   • lastUpdated   → sourceDate (for inflation correction)
 *   • brands[0]     → "Source name"
 *
 * Matching strategy:
 *   1. Exact name substring (current `findMaterialByName` behaviour).
 *   2. Description tokens Jaccard ≥ 0.5 across the whole DB (slower but
 *      catches LLM-paraphrased descriptions).
 */

import { MATERIALS_DATABASE, type MaterialWithPrice } from '../../materials-database-extended';
import { WORK_ITEMS_DATABASE, type WorkItemWithPrice } from '../../work-items-database-extended';
import {
  descriptionSimilarity,
  normalizeDescription,
  normalizeUnit,
} from '../normalizer';
import { applyInflation, inflationFactor } from '../inflation';
import type { PriceProvider, PriceQuery, PriceResult } from '../types';

const MATCH_THRESHOLD = 0.5;

function parseDate(s: string | undefined): Date {
  if (!s) return new Date();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function findBestMaterial(query: PriceQuery): {
  material: MaterialWithPrice;
  similarity: number;
} | null {
  const desc = normalizeDescription(query.description);
  const unit = normalizeUnit(query.unit);
  let best: { material: MaterialWithPrice; similarity: number } | null = null;

  for (const m of MATERIALS_DATABASE) {
    const mUnit = normalizeUnit(m.unit);
    if (unit && mUnit && mUnit !== unit) continue;
    const nameSim = descriptionSimilarity(desc, m.name);
    const kwSim = m.searchKeywords.length > 0
      ? Math.max(...m.searchKeywords.map((k) => descriptionSimilarity(desc, k)))
      : 0;
    const similarity = Math.max(nameSim, kwSim);
    if (similarity > (best?.similarity ?? 0)) {
      best = { material: m, similarity };
    }
  }

  if (!best || best.similarity < MATCH_THRESHOLD) return null;
  return best;
}

function findBestWorkItem(query: PriceQuery): {
  item: WorkItemWithPrice;
  similarity: number;
} | null {
  const desc = normalizeDescription(query.description);
  const unit = normalizeUnit(query.unit);
  let best: { item: WorkItemWithPrice; similarity: number } | null = null;

  for (const w of WORK_ITEMS_DATABASE) {
    const wUnit = normalizeUnit(w.unit);
    if (unit && wUnit && wUnit !== unit) continue;
    const nameSim = descriptionSimilarity(desc, w.name);
    const kwSim = w.searchKeywords.length > 0
      ? Math.max(...w.searchKeywords.map((k) => descriptionSimilarity(desc, k)))
      : 0;
    const similarity = Math.max(nameSim, kwSim);
    if (similarity > (best?.similarity ?? 0)) {
      best = { item: w, similarity };
    }
  }

  if (!best || best.similarity < MATCH_THRESHOLD) return null;
  return best;
}

export const catalogProvider: PriceProvider = {
  name: 'internal-catalog',
  sourceType: 'catalog',
  async lookup(query: PriceQuery): Promise<PriceResult | null> {
    const targetDate = query.date ?? new Date();

    if (query.kind === 'labor') {
      const work = findBestWorkItem(query);
      if (!work) return null;
      const sourceDate = parseDate(work.item.lastUpdated);
      const adj = inflationFactor(sourceDate, targetDate);
      const adjusted = applyInflation(work.item.laborRate, adj);
      // Confidence is the similarity score, capped at 0.95 to leave headroom
      // for manual / Prozorro overrides.
      const rawConfidence = Math.min(0.95, work.similarity);
      return {
        unitPrice: 0,
        laborCost: adjusted,
        source: `Внутрішній каталог робіт`,
        sourceType: 'catalog',
        rawConfidence,
        confidence: rawConfidence * 1.0,
        sourceDate,
        adjustedDate: adj.applied ? targetDate : undefined,
        inflationFactor: adj.factor,
        notes: `match=${work.similarity.toFixed(2)} ${work.item.name}`,
      };
    }

    const material = findBestMaterial(query);
    if (!material) return null;

    const sourceDate = parseDate(material.material.lastUpdated);
    const adj = inflationFactor(sourceDate, targetDate);
    const adjusted = applyInflation(material.material.averagePrice, adj);

    const rawConfidence = Math.min(0.95, material.similarity);
    const brand = material.material.brands[0];
    return {
      unitPrice: adjusted,
      source: brand
        ? `Внутрішній каталог (${brand.name}, ${brand.source})`
        : 'Внутрішній каталог',
      sourceType: 'catalog',
      rawConfidence,
      confidence: rawConfidence * 1.0,
      sourceDate,
      adjustedDate: adj.applied ? targetDate : undefined,
      inflationFactor: adj.factor,
      notes: `match=${material.similarity.toFixed(2)} ${material.material.name}`,
    };
  },
};
