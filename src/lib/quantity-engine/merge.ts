/**
 * Merge engine output with LLM output for an agent section.
 *
 * Hybrid policy:
 *   1. Every engine item MUST appear in the final list. The LLM is instructed
 *      not to drop or alter quantities, but if it disobeys we restore the
 *      engine version.
 *   2. The LLM is allowed to *price* engine items. If the LLM produced an item
 *      that matches an engine item by canonicalKey or by description heuristic,
 *      we keep the LLM's `unitPrice`/`laborCost` but force the engine's
 *      `quantity`/`unit`/`description`.
 *   3. Net-new items from the LLM (no canonical match) are appended as-is.
 */

import type { EstimateItem } from '../agents/base-agent';
import type { EngineItem } from './types';

/**
 * Lightweight EstimateItem-shaped object the LLM is expected to produce.
 * We accept any subset and fill in the gaps so the merger never throws.
 */
type LlmItem = Partial<EstimateItem> & { description?: string };

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-zа-яёії0-9]+/gi, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeKey(s).split(' ').filter((t) => t.length > 2));
}

/** Jaccard similarity between two strings on word tokens. */
function descriptionSimilarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Find the LLM item that best matches a given engine item.
 * Match either by exact canonicalKey (if the LLM echoed it back) or by a
 * description-token Jaccard ≥ 0.45 (loose enough to catch synonyms, strict
 * enough to avoid false positives).
 */
function findLlmMatch(
  engineItem: EngineItem,
  llmItems: LlmItem[],
  usedIndexes: Set<number>
): { index: number; item: LlmItem } | null {
  // Exact canonical key (priority).
  for (let i = 0; i < llmItems.length; i++) {
    if (usedIndexes.has(i)) continue;
    const item = llmItems[i] as any;
    if (item?.canonicalKey === engineItem.canonicalKey) {
      return { index: i, item };
    }
  }
  // Description similarity.
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < llmItems.length; i++) {
    if (usedIndexes.has(i)) continue;
    const item = llmItems[i];
    if (!item.description) continue;
    const score = descriptionSimilarity(engineItem.description, item.description);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0 && bestScore >= 0.45) {
    return { index: bestIdx, item: llmItems[bestIdx] };
  }
  return null;
}

export function mergeEngineAndLlm(
  engineItems: EngineItem[],
  llmItems: LlmItem[]
): EstimateItem[] {
  const result: EstimateItem[] = [];
  const usedLlmIndexes = new Set<number>();

  // 1. Engine items, priced by LLM where matched.
  for (const eng of engineItems) {
    const match = findLlmMatch(eng, llmItems, usedLlmIndexes);
    if (match) usedLlmIndexes.add(match.index);

    const unitPrice = Number(match?.item?.unitPrice ?? 0);
    const laborCost = Number(match?.item?.laborCost ?? 0);
    const totalCost = eng.quantity * unitPrice + laborCost;

    result.push({
      description: eng.description,
      quantity: eng.quantity,
      unit: eng.unit,
      unitPrice,
      laborCost,
      totalCost,
      priceSource: match?.item?.priceSource ?? 'Quantity Engine (потребує ціну)',
      confidence: Number(match?.item?.confidence ?? 0.5),
      notes: match?.item?.notes ?? `engine: ${eng.canonicalKey}`,
      // Engine wins on metadata regardless of what LLM said.
      itemType: eng.itemType === 'composite' ? 'composite' : eng.itemType,
      engineKey: eng.canonicalKey,
      quantityFormula: eng.formula,
    });
  }

  // 2. Net-new LLM items: everything the LLM produced that we didn't claim.
  for (let i = 0; i < llmItems.length; i++) {
    if (usedLlmIndexes.has(i)) continue;
    const item = llmItems[i];
    if (!item?.description) continue;

    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const laborCost = Number(item.laborCost ?? 0);
    if (quantity <= 0) continue;

    const computedTotal = quantity * unitPrice + laborCost;
    result.push({
      description: item.description,
      quantity,
      unit: item.unit ?? 'шт',
      unitPrice,
      laborCost,
      totalCost: Number(item.totalCost ?? computedTotal),
      priceSource: item.priceSource ?? 'LLM',
      confidence: Number(item.confidence ?? 0.5),
      notes: item.notes,
      prozorroReferences: item.prozorroReferences,
    });
  }

  return result;
}
