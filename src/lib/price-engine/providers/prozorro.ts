/**
 * Prozorro provider — wraps the existing `prozorro-price-reference` module,
 * which already implements:
 *   • Jaccard similarity matching by description tokens;
 *   • inflation correction for tenders > 6 months old (+2%/month compound);
 *   • multi-tier confidence based on similarity + sample size.
 *
 * Plan 4.4 calls for canonical SKU + region + project type matching, but
 * those columns don't exist in the current `ProzorroEstimateItem` model.
 * Until we add them (separate migration), this provider just delegates to
 * `getRecommendedPrice` and re-tags the result with the engine's source
 * weighting (0.90).
 */

import { getRecommendedPrice } from '../../prozorro-price-reference';
import type { PriceProvider, PriceQuery, PriceResult } from '../types';

export const prozorroProvider: PriceProvider = {
  name: 'prozorro',
  sourceType: 'prozorro',
  async lookup(query: PriceQuery): Promise<PriceResult | null> {
    try {
      const result = await getRecommendedPrice(query.description, query.unit, {
        maxAge: 12,
      });
      if (!result) return null;

      // Map the existing 'high' / 'medium' / 'low' tier to a numeric value.
      const rawConfidence =
        result.confidence === 'high'
          ? 0.9
          : result.confidence === 'medium'
          ? 0.75
          : 0.6;

      const refs = result.references ?? [];
      const oldestRef = refs.length > 0 ? refs[refs.length - 1] : null;
      const avgSimilarity =
        refs.length > 0
          ? refs.reduce((sum, r) => sum + r.similarity, 0) / refs.length
          : 0;

      return {
        unitPrice: result.price,
        source: `Prozorro (${refs.length} тендерів, ${result.confidence})`,
        sourceType: 'prozorro',
        rawConfidence,
        confidence: rawConfidence * 0.9,
        sourceDate: oldestRef?.tenderDate ? new Date(oldestRef.tenderDate) : undefined,
        adjustedDate: new Date(),
        inflationFactor: oldestRef?.inflationFactor,
        references: refs,
        notes: `${refs.length} тендер(ів), avg similarity=${avgSimilarity.toFixed(0)}%`,
      };
    } catch (e) {
      console.warn('[price-engine/prozorro] lookup failed:', e);
      return null;
    }
  },
};
