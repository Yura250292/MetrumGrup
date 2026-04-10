/**
 * LLM fallback provider — wraps the existing `searchMaterialPrice` /
 * `searchLaborCost` functions, which call Gemini with a "find me a price"
 * prompt. This is the LOWEST priority source (sourceWeight 0.40) because
 * Gemini has no real web access and can hallucinate prices.
 *
 * Plan 4.3 was explicit:
 *   • this is NOT a real Google Search;
 *   • confidence MUST stay low regardless of what the model says;
 *   • the module name should be honest about what it does.
 *
 * We rename the role here ("LLM fallback") even though we still call into
 * `price-search.ts` under the hood — that file's prompt is what we have for
 * now. Future cleanup can rename it to `llm-price-estimate.ts`.
 */

import { searchMaterialPriceCached, searchLaborCost } from '../../price-search';
import type { PriceProvider, PriceQuery, PriceResult } from '../types';

const HARD_CONFIDENCE_CAP = 0.5;

export const llmFallbackProvider: PriceProvider = {
  name: 'llm-fallback',
  sourceType: 'llm',
  async lookup(query: PriceQuery): Promise<PriceResult | null> {
    try {
      if (query.kind === 'labor') {
        const result = await searchLaborCost(query.description, query.unit);
        if (!result || result.laborRate <= 0) return null;
        const rawConfidence = Math.min(HARD_CONFIDENCE_CAP, result.confidence);
        return {
          unitPrice: 0,
          laborCost: result.laborRate,
          source: 'LLM fallback (Gemini, без перевірки)',
          sourceType: 'llm',
          rawConfidence,
          confidence: rawConfidence * 0.4,
          sourceDate: new Date(),
          notes: 'Confidence жорстко обмежена 0.5 — потребує ручної перевірки',
        };
      }

      // Use the 24h in-memory cache to avoid hitting Gemini for the same
      // description twice within a generation run (huge speedup for projects
      // with many similar items).
      const result = await searchMaterialPriceCached(query.description, query.unit);
      if (!result || result.averagePrice <= 0) return null;
      const rawConfidence = Math.min(HARD_CONFIDENCE_CAP, result.confidence);
      return {
        unitPrice: result.averagePrice,
        source:
          result.sources.length > 0
            ? `LLM fallback (${result.sources[0].shop})`
            : 'LLM fallback (Gemini)',
        sourceType: 'llm',
        rawConfidence,
        confidence: rawConfidence * 0.4,
        sourceDate: new Date(),
        references: result.sources,
        notes: 'Confidence жорстко обмежена 0.5 — потребує ручної перевірки',
      };
    } catch (e) {
      console.warn('[price-engine/llm-fallback] lookup failed:', e);
      return null;
    }
  },
};
