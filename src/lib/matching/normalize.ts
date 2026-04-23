const UNIT_TOKENS = new Set([
  "шт", "штук", "штука", "штуки",
  "кг", "г", "т",
  "м", "м2", "м²", "кв.м", "квм",
  "м3", "м³", "куб.м", "кубм",
  "л", "мл",
  "уп", "упак", "упаковка",
  "мішок", "мішків", "мешок",
  "пач", "пачка",
  "рул", "рулон",
  "пог.м", "пм",
]);

/**
 * Normalize a Ukrainian material name for fuzzy comparison.
 * - lowercase
 * - drop punctuation
 * - drop unit tokens (so "Цемент М500 50кг" ≈ "Цемент М500")
 * - collapse whitespace
 * - sort tokens (so word order doesn't change the score)
 */
export function normalizeName(input: string): string {
  if (!input) return "";

  let s = input.toLowerCase().trim();
  s = s.replace(/['"`«»“”„]/g, " ");
  s = s.replace(/[.,;:()\[\]{}/\\]/g, " ");
  s = s.replace(/[+×x*]/gi, " ");
  s = s.replace(/\s+/g, " ").trim();

  const tokens = s
    .split(" ")
    .filter((tok) => tok.length > 0)
    .filter((tok) => !UNIT_TOKENS.has(tok))
    .filter((tok) => !/^\d+(?:[.,]\d+)?(?:кг|г|т|мл|л|мм|см|м)?$/i.test(tok));

  tokens.sort();
  return tokens.join(" ");
}
