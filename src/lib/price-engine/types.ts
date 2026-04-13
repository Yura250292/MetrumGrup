/**
 * Price engine — types (Plan Stage 4).
 *
 * The price engine is the single entry point for "what should this item cost?".
 * It walks a chain of providers in priority order and returns the best
 * available price along with confidence + provenance metadata.
 *
 * Provider priority (4.1):
 *   1. internal verified catalog          (sourceWeight 1.00)
 *   2. Prozorro parsed tender references  (sourceWeight 0.90)
 *   3. supplier / web-scrape sources      (sourceWeight 0.70)
 *   4. LLM fallback                       (sourceWeight 0.40)
 *
 * Confidence floor (early-exit): 0.75. If a provider returns a result with
 * `weightedConfidence >= 0.75`, the engine stops and returns it. Otherwise
 * it tries the next provider and at the end returns the best of what it has
 * (may be `null` if everything failed).
 */

export type PriceSourceType =
  | 'catalog'
  | 'prozorro'
  | 'scrape'
  | 'llm'
  | 'manual'
  | 'unknown';

export const SOURCE_WEIGHT: Record<PriceSourceType, number> = {
  catalog: 1.00,
  prozorro: 0.90,
  scrape: 0.70,
  llm: 0.40,
  manual: 1.00,
  unknown: 0.20,
};

/** Confidence floor below which we keep trying providers. */
export const CONFIDENCE_FLOOR = 0.75;

export interface PriceQuery {
  description: string;
  unit: string;
  category?: string;
  /** Stable canonical id from the quantity engine, e.g. 'electrical.power_cable'. */
  canonicalKey?: string;
  /** Region hint for regional catalogs (when we eventually support them). */
  region?: string;
  /** Date for which we want the price (default: today). Used for inflation. */
  date?: Date;
  /** "material" or "labor" — some providers split price types. */
  kind?: 'material' | 'labor';
  /** Quality tier from wizard — used to select appropriate brand/grade. */
  qualityTier?: 'economy' | 'standard' | 'premium' | 'luxury';
}

export interface PriceResult {
  unitPrice: number;
  /** Optional separate labor cost if the provider returned a bundled rate. */
  laborCost?: number;
  source: string;
  sourceType: PriceSourceType;
  /** Provider's own confidence (0..1). */
  rawConfidence: number;
  /** Final confidence = rawConfidence × SOURCE_WEIGHT[sourceType]. */
  confidence: number;
  sourceDate?: Date;
  adjustedDate?: Date;
  inflationFactor?: number;
  region?: string;
  /** Free-form references (Prozorro tenders, catalog rows, etc.). */
  references?: unknown[];
  /** Notes for the review queue. */
  notes?: string;
}

export interface PriceProvider {
  /** Display name for logging. */
  name: string;
  /** Source type — used to weight confidence. */
  sourceType: PriceSourceType;
  /** Look up a price. Return `null` when nothing matches. */
  lookup(query: PriceQuery): Promise<PriceResult | null>;
}

export type PriceEngineOptions = {
  /** Override the provider chain (for tests / experiments). */
  providers?: PriceProvider[];
  /** Override the early-exit floor. */
  confidenceFloor?: number;
};
