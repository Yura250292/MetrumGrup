/**
 * Public API of the price engine (Plan Stage 4).
 *
 * Usage from an agent:
 *   const result = await lookupPrice({
 *     description: 'Кабель ВВГнг 3×2.5',
 *     unit: 'м',
 *     canonicalKey: 'electrical.power_cable',
 *     kind: 'material',
 *   });
 *   if (result) {
 *     item.unitPrice = result.unitPrice;
 *     item.priceSource = result.source;
 *     item.confidence = result.confidence;
 *   }
 *
 * The engine walks providers in priority order:
 *   1. catalog       (sourceWeight 1.00)
 *   2. prozorro      (sourceWeight 0.90)
 *   3. web-scrape    (sourceWeight 0.70, currently a no-op)
 *   4. llm-fallback  (sourceWeight 0.40, hard cap 0.5 raw)
 *
 * Each provider returns a `PriceResult` with `confidence` already weighted
 * by the source. The engine returns the FIRST result that meets the
 * `CONFIDENCE_FLOOR` (0.75). If no provider hits the floor, it returns the
 * highest-confidence result it saw, or `null` if every provider returned
 * `null`.
 */

import {
  CONFIDENCE_FLOOR,
  type PriceEngineOptions,
  type PriceProvider,
  type PriceQuery,
  type PriceResult,
} from './types';
import { catalogProvider } from './providers/catalog';
import { prozorroProvider } from './providers/prozorro';
import { webScrapeProvider } from './providers/web-scrape';
import { llmFallbackProvider } from './providers/llm-fallback';

const DEFAULT_PROVIDERS: PriceProvider[] = [
  catalogProvider,
  prozorroProvider,
  webScrapeProvider,
  llmFallbackProvider,
];

/** Timeout per provider lookup. Catalog/scrape are instant, prozorro hits the
 *  DB (~100ms), llm hits Gemini (~1-3s). 10s ceiling protects the function
 *  from a hung Gemini call blocking the whole pricing pass. */
const PROVIDER_TIMEOUT_MS = 10_000;

function withTimeout<T>(
  promise: Promise<T | null>,
  ms: number,
  label: string
): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(`[price-engine] timeout (${ms}ms): ${label}`);
      resolve(null);
    }, ms);
    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.warn(`[price-engine] threw: ${label}`, e);
        resolve(null);
      });
  });
}

export async function lookupPrice(
  query: PriceQuery,
  options: PriceEngineOptions = {}
): Promise<PriceResult | null> {
  const providers = options.providers ?? DEFAULT_PROVIDERS;
  const floor = options.confidenceFloor ?? CONFIDENCE_FLOOR;

  let best: PriceResult | null = null;

  for (const provider of providers) {
    const result = await withTimeout(
      provider.lookup(query),
      PROVIDER_TIMEOUT_MS,
      `${provider.name} for "${query.description}"`
    );
    if (!result) continue;

    if (!best || result.confidence > best.confidence) {
      best = result;
    }

    // Early exit on a confident enough result.
    if (result.confidence >= floor) {
      return result;
    }
  }

  return best;
}

/**
 * Convenience wrapper for the per-item enrichment loop in `BaseAgent`.
 * Returns the result merged into a partial EstimateItem shape.
 */
export async function enrichItemPrice(item: {
  description: string;
  unit: string;
  unitPrice?: number;
  laborCost?: number;
  confidence?: number;
  priceSource?: string;
  engineKey?: string;
  itemType?: string;
}): Promise<{
  unitPrice: number;
  laborCost: number;
  priceSource: string;
  confidence: number;
  sourceType: string;
  notes?: string;
} | null> {
  const kind = item.itemType === 'labor' ? 'labor' : 'material';
  const result = await lookupPrice({
    description: item.description,
    unit: item.unit,
    canonicalKey: item.engineKey,
    kind,
  });
  if (!result) return null;

  return {
    unitPrice: result.unitPrice,
    laborCost: result.laborCost ?? 0,
    priceSource: result.source,
    confidence: result.confidence,
    sourceType: result.sourceType,
    notes: result.notes,
  };
}

export * from './types';
export { catalogProvider } from './providers/catalog';
export { prozorroProvider } from './providers/prozorro';
export { webScrapeProvider } from './providers/web-scrape';
export { llmFallbackProvider } from './providers/llm-fallback';
