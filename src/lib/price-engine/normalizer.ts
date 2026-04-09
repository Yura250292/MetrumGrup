/**
 * Description / unit normalisation for cross-provider matching.
 *
 * Different providers have different conventions: catalogs say "м²",
 * Prozorro descriptions say "м.кв.", LLM produces "квадратний метр".
 * Without normalisation our Jaccard matchers fail.
 *
 * This module is intentionally tiny — it just lower-cases, strips
 * punctuation, and maps a handful of well-known unit aliases.
 */

const UNIT_ALIASES: Record<string, string> = {
  'м.кв.': 'м²',
  'м.кв': 'м²',
  'м2': 'м²',
  'кв.м': 'м²',
  'кв.м.': 'м²',
  'м.куб.': 'м³',
  'м.куб': 'м³',
  'м3': 'м³',
  'куб.м': 'м³',
  'м.п.': 'м',
  'м.п': 'м',
  'мп': 'м',
  'погонний метр': 'м',
  'шт.': 'шт',
  'штук': 'шт',
  'компл.': 'компл',
  'комплект': 'компл',
};

export function normalizeUnit(unit: string | undefined | null): string {
  if (!unit) return '';
  const lower = String(unit).toLowerCase().trim();
  return UNIT_ALIASES[lower] ?? lower;
}

export function normalizeDescription(description: string | undefined | null): string {
  if (!description) return '';
  return description
    .toLowerCase()
    .replace(/[^a-zа-яёії0-9² ³]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenise a description for Jaccard matching. */
export function descriptionTokens(description: string): Set<string> {
  return new Set(
    normalizeDescription(description)
      .split(' ')
      .filter((t) => t.length > 2)
  );
}

/** Jaccard similarity of two descriptions on word tokens. */
export function descriptionSimilarity(a: string, b: string): number {
  const A = descriptionTokens(a);
  const B = descriptionTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}
