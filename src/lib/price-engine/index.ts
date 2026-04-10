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

/** Per-provider timeout. Catalog/scrape are instant, prozorro is ~100ms,
 *  llm is 1-3s in the happy case but can hang on Gemini overload. 8s ceiling
 *  per provider × 4 providers = 32s worst case per item, vs the unbounded
 *  multi-minute hangs we used to see. */
const PROVIDER_TIMEOUT_MS = 8_000;

/** Wrap a provider call so a hung Gemini doesn't block the whole pricing pass. */
async function callWithTimeout(
  provider: PriceProvider,
  query: PriceQuery
): Promise<PriceResult | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      provider.lookup(query),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(
            `[price-engine] timeout (${PROVIDER_TIMEOUT_MS}ms): ${provider.name} ` +
            `for "${query.description}"`
          );
          resolve(null);
        }, PROVIDER_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    console.warn(`[price-engine] provider ${provider.name} threw:`, e);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function lookupPrice(
  query: PriceQuery,
  options: PriceEngineOptions = {}
): Promise<PriceResult | null> {
  const providers = options.providers ?? DEFAULT_PROVIDERS;
  const floor = options.confidenceFloor ?? CONFIDENCE_FLOOR;

  let best: PriceResult | null = null;

  for (const provider of providers) {
    const result = await callWithTimeout(provider, query);
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
