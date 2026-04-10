/**
 * Honest re-export wrapper for the legacy `price-search.ts` module.
 *
 * Plan 4.3 called for renaming `price-search.ts` to make it obvious that it
 * is *not* a real search — it's just a Gemini prompt asking the model to
 * "find" prices in named shops, with no real HTTP calls or web access.
 *
 * Renaming the original file would break two existing call sites mid-flight,
 * so instead we publish a new module under the honest name and ask new code
 * to import from here. The implementation is one-line re-exports; behaviour
 * is unchanged.
 *
 * Use `lookupPrice()` from `@/lib/price-engine` for real production lookups.
 * This module is the bottom of the engine's provider chain.
 */

export {
  searchMaterialPrice as estimateMaterialPriceWithLlm,
  searchLaborCost as estimateLaborCostWithLlm,
  searchMaterialPriceCached as estimateMaterialPriceWithLlmCached,
  type PriceSearchResult as LlmPriceEstimateResult,
} from './price-search';
