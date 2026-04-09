/**
 * Web-scrape provider — placeholder for future real supplier integrations.
 *
 * Plan 4.1 lists this as the third-priority source after catalog and Prozorro,
 * with sourceWeight 0.70. Today we don't have real Epicentr / Leroy Merlin
 * fetchers — building those is its own integration project (rate limits,
 * captchas, ToS). The plan was explicit (4.3) about NOT pretending we have a
 * real scraper when we don't.
 *
 * This module deliberately returns `null` for every query. It exists so that:
 *   • the provider chain has a slot ready for real implementations to drop in;
 *   • developers can grep for "scrape" and find the right place to add code;
 *   • the engine's logging shows "scrape: skipped" rather than silently
 *     missing the level entirely.
 *
 * To wire a real implementation: replace the body of `lookup()` with HTTP
 * calls (server-side fetch — no Gemini), normalise the response into
 * `PriceResult`, and bump `rawConfidence` based on number of corroborating
 * stores. Make sure to include `sourceDate` and let `inflation.ts` handle
 * adjustment.
 */

import type { PriceProvider, PriceQuery, PriceResult } from '../types';

export const webScrapeProvider: PriceProvider = {
  name: 'web-scrape',
  sourceType: 'scrape',
  async lookup(_query: PriceQuery): Promise<PriceResult | null> {
    // Intentionally a no-op until real fetchers are added.
    // See module docstring above for the integration checklist.
    return null;
  },
};
