/**
 * Item-level diff for delta refine (Plan Stage 6).
 *
 * Compares two snapshots of estimate items (typically "before" and "after"
 * a refine run) and returns a structured diff: added, removed, changed.
 *
 * Matching strategy:
 *   1. By `engineKey` if both sides have one (deterministic items from the
 *      quantity engine — Phase 3.2 added this column).
 *   2. By a Jaccard similarity ≥ 0.5 on description tokens (loose enough to
 *      catch synonyms / pluralisations, strict enough to avoid false matches).
 *   3. Anything left unmatched on the new side is `added`, on the old side is
 *      `removed`.
 *
 * "Changed" only fires when description matches but at least one of
 * `quantity`, `unitPrice`, `laborCost`, `unit` actually differs.
 */

export type DiffItem = {
  description: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  laborCost?: number;
  amount?: number;
  engineKey?: string | null;
  itemType?: string | null;
};

export type ChangedItem = {
  description: string;
  engineKey?: string | null;
  before: DiffItem;
  after: DiffItem;
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
};

export type EstimateDiff = {
  added: DiffItem[];
  removed: DiffItem[];
  changed: ChangedItem[];
  unchangedCount: number;
  totals: {
    beforeAmount: number;
    afterAmount: number;
    deltaAmount: number;
  };
};

function tokenSet(s: string): Set<string> {
  return new Set(
    (s ?? '')
      .toLowerCase()
      .replace(/[^a-zа-яёії0-9]+/gi, ' ')
      .trim()
      .split(' ')
      .filter((t) => t.length > 2)
  );
}

function jaccard(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

function approxEquals(a: number, b: number, tolerance = 0.5): boolean {
  return Math.abs(a - b) <= tolerance;
}

function compareItems(before: DiffItem, after: DiffItem): ChangedItem['changes'] {
  const changes: ChangedItem['changes'] = [];
  const fields: Array<keyof DiffItem> = ['quantity', 'unitPrice', 'laborCost', 'unit'];
  for (const field of fields) {
    const o = before[field];
    const n = after[field];
    if (typeof o === 'number' && typeof n === 'number') {
      if (!approxEquals(o, n)) changes.push({ field, oldValue: o, newValue: n });
    } else if (o !== n) {
      changes.push({ field, oldValue: o, newValue: n });
    }
  }
  return changes;
}

export function computeEstimateDiff(
  before: DiffItem[],
  after: DiffItem[]
): EstimateDiff {
  const usedAfter = new Set<number>();
  const changed: ChangedItem[] = [];
  const removed: DiffItem[] = [];
  let unchangedCount = 0;

  // Pass 1: engineKey matches.
  const afterByKey = new Map<string, number>();
  after.forEach((item, idx) => {
    if (item.engineKey) afterByKey.set(item.engineKey, idx);
  });

  const beforeMatched = new Set<number>();
  before.forEach((bItem, bIdx) => {
    if (!bItem.engineKey) return;
    const aIdx = afterByKey.get(bItem.engineKey);
    if (aIdx === undefined || usedAfter.has(aIdx)) return;
    usedAfter.add(aIdx);
    beforeMatched.add(bIdx);
    const aItem = after[aIdx];
    const diffs = compareItems(bItem, aItem);
    if (diffs.length > 0) {
      changed.push({
        description: aItem.description,
        engineKey: bItem.engineKey,
        before: bItem,
        after: aItem,
        changes: diffs,
      });
    } else {
      unchangedCount++;
    }
  });

  // Pass 2: description Jaccard for the rest.
  before.forEach((bItem, bIdx) => {
    if (beforeMatched.has(bIdx)) return;
    let bestIdx = -1;
    let bestScore = 0;
    after.forEach((aItem, aIdx) => {
      if (usedAfter.has(aIdx)) return;
      const score = jaccard(bItem.description, aItem.description);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = aIdx;
      }
    });
    if (bestIdx >= 0 && bestScore >= 0.5) {
      usedAfter.add(bestIdx);
      beforeMatched.add(bIdx);
      const aItem = after[bestIdx];
      const diffs = compareItems(bItem, aItem);
      if (diffs.length > 0) {
        changed.push({
          description: aItem.description,
          engineKey: bItem.engineKey ?? aItem.engineKey ?? null,
          before: bItem,
          after: aItem,
          changes: diffs,
        });
      } else {
        unchangedCount++;
      }
    } else {
      removed.push(bItem);
    }
  });

  // Pass 3: leftover after = added.
  const added: DiffItem[] = [];
  after.forEach((aItem, aIdx) => {
    if (!usedAfter.has(aIdx)) added.push(aItem);
  });

  const beforeAmount = before.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const afterAmount = after.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  return {
    added,
    removed,
    changed,
    unchangedCount,
    totals: {
      beforeAmount,
      afterAmount,
      deltaAmount: afterAmount - beforeAmount,
    },
  };
}
