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
import { findBestZbirnykNorm, detectZbirnykSection } from '../../zbirnyk-15-search';
import {
  descriptionSimilarity,
  normalizeDescription,
  normalizeUnit,
} from '../normalizer';
import { applyInflation, inflationFactor } from '../inflation';
import type { PriceProvider, PriceQuery, PriceResult } from '../types';

const MATCH_THRESHOLD = 0.5;

/**
 * Map quality tier to brand quality preference.
 * 'luxury' maps to 'premium' brands (highest available).
 */
const TIER_TO_BRAND_QUALITY: Record<string, MaterialWithPrice['brands'][number]['quality']> = {
  economy: 'economy',
  standard: 'standard',
  premium: 'premium',
  luxury: 'premium',
};

/**
 * Select the best brand for a given quality tier.
 * Falls back to: exact match → closest tier → first brand → null.
 */
function selectBrandByQuality(
  material: MaterialWithPrice,
  qualityTier?: string
): MaterialWithPrice['brands'][number] | null {
  if (material.brands.length === 0) return null;
  if (!qualityTier) return material.brands[0];

  const targetQuality = TIER_TO_BRAND_QUALITY[qualityTier] ?? 'standard';

  // Exact quality match
  const exact = material.brands.find((b) => b.quality === targetQuality);
  if (exact) return exact;

  // Fallback priority for each tier
  const fallbackOrder: Record<string, string[]> = {
    economy: ['economy', 'standard', 'premium'],
    standard: ['standard', 'economy', 'premium'],
    premium: ['premium', 'standard', 'economy'],
  };
  const order = fallbackOrder[targetQuality] ?? ['standard', 'economy', 'premium'];
  for (const q of order) {
    const match = material.brands.find((b) => b.quality === q);
    if (match) return match;
  }

  return material.brands[0];
}

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
      // ⭐ PRIORITY 1: Збірник 15 (офіційні норми України) для оздоблювальних робіт
      const zbSection = detectZbirnykSection(query.description);
      if (zbSection) {
        const zbMatch = findBestZbirnykNorm(query.description, query.unit, zbSection, 0.3);
        if (zbMatch && zbMatch.similarity >= 0.4) {
          const rawConfidence = Math.min(0.98, 0.75 + zbMatch.similarity * 0.23);
          return {
            unitPrice: 0,
            laborCost: zbMatch.norm.laborPrice,
            source: `Збірник 15 (норма ${zbMatch.norm.code})`,
            sourceType: 'catalog',
            rawConfidence,
            confidence: rawConfidence * 1.0,
            sourceDate: new Date('2025-01-01'),
            notes: `Збірник 15 ${zbMatch.norm.code}: ${zbMatch.norm.group} (match=${(zbMatch.similarity * 100).toFixed(0)}%)`,
          };
        }
      }

      // PRIORITY 2: Внутрішній каталог робіт
      const work = findBestWorkItem(query);
      if (!work) return null;
      const sourceDate = parseDate(work.item.lastUpdated);
      const adj = inflationFactor(sourceDate, targetDate);
      const adjusted = applyInflation(work.item.laborRate, adj);
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

    // Select brand matching the requested quality tier
    const brand = selectBrandByQuality(material.material, query.qualityTier);
    const basePrice = brand ? brand.price : material.material.averagePrice;
    const adjusted = applyInflation(basePrice, adj);

    const rawConfidence = Math.min(0.95, material.similarity);
    return {
      unitPrice: adjusted,
      source: brand
        ? `Внутрішній каталог (${brand.name}, ${brand.source}, ${brand.quality})`
        : 'Внутрішній каталог',
      sourceType: 'catalog',
      rawConfidence,
      confidence: rawConfidence * 1.0,
      sourceDate,
      adjustedDate: adj.applied ? targetDate : undefined,
      inflationFactor: adj.factor,
      notes: `match=${material.similarity.toFixed(2)} ${material.material.name}${query.qualityTier ? ` tier=${query.qualityTier}` : ''}`,
    };
  },
};
