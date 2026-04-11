/**
 * Normalizes AI-generated estimate items into the database shape.
 *
 * The AI agents emit items with a single `laborCost` field, while the
 * EstimateItem schema stores `laborRate` and `laborHours` separately.
 * Until we add a dedicated `laborCostTotal` column, we pack the labor cost
 * as `laborRate = laborCost`, `laborHours = 1`. This keeps
 * `laborRate * laborHours = laborCost` and matches `recomputeEstimateTotals`
 * (after its formula fix).
 *
 * The server is the single source of truth for `amount`: we recompute it
 * from `quantity * unitPrice + laborCost` and only emit a warning if the
 * AI-supplied `totalCost` disagrees by more than 1₴.
 */

export type AiItem = {
  description?: string;
  quantity?: number | string;
  unit?: string;
  unitPrice?: number | string;
  laborCost?: number | string;
  totalCost?: number | string;
  // Quantity engine metadata (optional). When present, persisted to DB.
  itemType?: 'material' | 'labor' | 'equipment' | 'composite' | string;
  engineKey?: string;
  quantityFormula?: string;
  // Price engine metadata (Stage 8 backend prep). When present, persisted to DB.
  priceSource?: string;
  priceSourceType?: 'catalog' | 'prozorro' | 'scrape' | 'llm' | 'manual' | string;
  confidence?: number | string;
};

export type NormalizedItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  laborRate: number;
  laborHours: number;
  amount: number;
  itemType?: string | null;
  engineKey?: string | null;
  quantityFormula?: string | null;
  priceSource?: string | null;
  priceSourceType?: string | null;
  confidence?: number | null;
};

export class InvalidAiItemError extends Error {
  constructor(public readonly index: number, message: string) {
    super(`AI item #${index}: ${message}`);
    this.name = 'InvalidAiItemError';
  }
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  // Accept AI-localized numbers like "1 250,50" or "12,5".
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/₴|грн|uah/gi, '')
    .replace(',', '.');

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize a single AI item. Throws InvalidAiItemError on hard validation
 * failures (missing description / non-positive quantity / missing unit /
 * negative unitPrice).
 */
export function normalizeAiItem(item: AiItem, index: number): NormalizedItem {
  const description = (item.description ?? '').toString().trim();
  if (!description) {
    throw new InvalidAiItemError(index, 'description is required');
  }

  const quantity = toNumber(item.quantity);
  if (!(quantity > 0)) {
    throw new InvalidAiItemError(index, `quantity must be > 0 (got ${item.quantity})`);
  }

  const unit = (item.unit ?? '').toString().trim();
  if (!unit) {
    throw new InvalidAiItemError(index, 'unit is required');
  }

  const unitPrice = toNumber(item.unitPrice);
  if (unitPrice < 0) {
    throw new InvalidAiItemError(index, `unitPrice must be >= 0 (got ${item.unitPrice})`);
  }

  const laborCost = toNumber(item.laborCost);
  // Pack labor as a synthetic "1 hour at laborCost rate". Works with the fixed
  // recomputeEstimateTotals (laborRate * laborHours == laborCost).
  const laborRate = laborCost > 0 ? laborCost : 0;
  const laborHours = laborCost > 0 ? 1 : 0;

  const computed = quantity * unitPrice + laborCost;
  const aiTotalCost = toNumber(item.totalCost);
  if (aiTotalCost > 0 && Math.abs(aiTotalCost - computed) > 1) {
    console.warn(
      `[ai-item-normalizer] item #${index} "${description}" totalCost mismatch: ` +
      `AI=${aiTotalCost}, computed=${computed.toFixed(2)} — using computed.`
    );
  }

  const confidence = item.confidence !== undefined && item.confidence !== null
    ? Math.max(0, Math.min(1, Number(item.confidence)))
    : null;

  return {
    description,
    quantity,
    unit,
    unitPrice,
    laborRate,
    laborHours,
    amount: computed,
    itemType: item.itemType ? String(item.itemType) : null,
    engineKey: item.engineKey ? String(item.engineKey) : null,
    quantityFormula: item.quantityFormula ? String(item.quantityFormula) : null,
    priceSource: item.priceSource ? String(item.priceSource) : null,
    priceSourceType: item.priceSourceType ? String(item.priceSourceType) : null,
    confidence: confidence !== null && Number.isFinite(confidence) ? confidence : null,
  };
}

/**
 * Normalize a batch of AI items. Invalid items are dropped with a warning,
 * letting the rest of the section persist. Use this for write paths where we
 * cannot afford to lose the entire estimate over one bad item.
 */
export function normalizeAiItems(items: AiItem[]): NormalizedItem[] {
  const result: NormalizedItem[] = [];
  items.forEach((item, idx) => {
    try {
      result.push(normalizeAiItem(item, idx));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[ai-item-normalizer] dropping item: ${message}`, item);
    }
  });
  return result;
}
