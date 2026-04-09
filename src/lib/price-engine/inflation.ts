/**
 * Date-aware inflation adjustment for catalog / Prozorro prices.
 *
 * We use a simple compound monthly model: a price observed N months ago is
 * scaled by (1 + monthlyRate)^N. The default monthly rate (1.5%) is a
 * conservative estimate for Ukrainian construction materials in 2025-2026.
 *
 * For prices fresher than `freshThresholdMonths` we don't adjust at all —
 * minor month-to-month wobble would create false volatility in estimates.
 *
 * The Prozorro reference module already does its own inflation correction
 * with a 2%/month rate above 6 months. We keep this module separate so that
 * catalog and scrape providers can use the same logic without forking it.
 */

const DEFAULT_MONTHLY_RATE = 0.015; // 1.5% / month
const DEFAULT_FRESH_THRESHOLD_MONTHS = 3;

export interface InflationAdjustment {
  factor: number;
  ageMonths: number;
  applied: boolean;
}

export function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.44);
}

export function inflationFactor(
  sourceDate: Date,
  targetDate: Date = new Date(),
  monthlyRate: number = DEFAULT_MONTHLY_RATE,
  freshThresholdMonths: number = DEFAULT_FRESH_THRESHOLD_MONTHS
): InflationAdjustment {
  const ageMonths = Math.max(0, monthsBetween(sourceDate, targetDate));
  if (ageMonths < freshThresholdMonths) {
    return { factor: 1, ageMonths, applied: false };
  }
  const factor = Math.pow(1 + monthlyRate, ageMonths - freshThresholdMonths);
  return {
    factor: Math.round(factor * 1000) / 1000,
    ageMonths,
    applied: true,
  };
}

export function applyInflation(price: number, adj: InflationAdjustment): number {
  return Math.round(price * adj.factor * 100) / 100;
}
