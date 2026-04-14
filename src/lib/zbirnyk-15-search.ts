/**
 * Search helpers для пошуку норм у Збірнику 15.
 *
 * Стратегія пошуку:
 *   1. Exact code match (якщо AI вказав код на кшталт "15-1-1") — confidence 1.0
 *   2. Token-based similarity між описом роботи і нормою — confidence 0.6-0.95
 *   3. Keyword overlap fallback — confidence 0.4-0.7
 */

import { ZBIRNYK_15_NORMS, type Zbirnyk15Norm, type Zbirnyk15Section } from './zbirnyk-15-norms';

export interface ZbirnykSearchResult {
  norm: Zbirnyk15Norm;
  similarity: number;
  matchType: 'code' | 'description' | 'keywords';
}

/**
 * Normalize text for matching: lowercase, strip punctuation, split into tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[«»"'().,;:!?\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * Jaccard similarity between two token sets.
 */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Normalize unit string for comparison (м² vs м2 vs кв.м etc.).
 */
function normalizeUnit(unit: string | undefined): string {
  if (!unit) return '';
  return unit
    .toLowerCase()
    .replace(/м2|кв\.?м|кв\.?метр/gi, 'м²')
    .replace(/м3|куб\.?м/gi, 'м³')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Match AI-generated description against Zbirnyk 15 norms.
 * Returns the best matching norm with similarity score, or null.
 *
 * @param description The work item description from AI
 * @param unit Unit of measure (for filtering, optional)
 * @param sectionHint Hint about which section to search (optional, narrows search)
 * @param minSimilarity Minimum similarity threshold (default 0.3)
 */
export function findBestZbirnykNorm(
  description: string,
  unit?: string,
  sectionHint?: Zbirnyk15Section,
  minSimilarity: number = 0.3
): ZbirnykSearchResult | null {
  if (!description) return null;

  // 1. Exact code match (e.g., "15-1-1" in description)
  const codeMatch = description.match(/\b15-\d+-\d+\b/);
  if (codeMatch) {
    const norm = ZBIRNYK_15_NORMS.find(n => n.code === codeMatch[0]);
    if (norm) {
      return { norm, similarity: 1.0, matchType: 'code' };
    }
  }

  const descTokens = tokenize(description);
  const normalizedDescUnit = normalizeUnit(unit);

  let best: ZbirnykSearchResult | null = null;

  // Filter by section if hint provided
  const candidates = sectionHint
    ? ZBIRNYK_15_NORMS.filter(n => n.section === sectionHint)
    : ZBIRNYK_15_NORMS;

  for (const norm of candidates) {
    // Unit filter: if both have units, they must match
    if (normalizedDescUnit && norm.unit) {
      const normalizedNormUnit = normalizeUnit(norm.unit);
      if (normalizedDescUnit !== normalizedNormUnit) continue;
    }

    // Score 1: full description similarity
    const normTokens = tokenize(norm.desc + ' ' + norm.group);
    const descScore = jaccard(descTokens, normTokens);

    // Score 2: keyword overlap
    const keywordScore = norm.keywords.length > 0
      ? norm.keywords.filter(k => descTokens.includes(k)).length / norm.keywords.length
      : 0;

    // Weighted combination
    const similarity = descScore * 0.7 + keywordScore * 0.3;

    if (similarity >= minSimilarity && (!best || similarity > best.similarity)) {
      best = {
        norm,
        similarity,
        matchType: descScore > keywordScore ? 'description' : 'keywords',
      };
    }
  }

  return best;
}

/**
 * Detect which section(s) a work description belongs to based on keywords.
 * Used to narrow the search space.
 */
export function detectZbirnykSection(description: string): Zbirnyk15Section | null {
  const text = description.toLowerCase();

  // Облицювання
  if (/облицюван|плитк|керамограніт|мозаїк|гранітн.*плит|травертин|мармур|вапняк|черепашник/.test(text)) {
    return 'facing';
  }

  // Штукатурка
  if (/штукатур|стяжк|цементно.*піщан|гіпсов.*штукатур|декоративн.*штукатур|шпаклів|ґрунтов|грунтов/.test(text)) {
    return 'plaster';
  }

  // Ліпнина
  if (/ліпн|карниз|розетк.*стел|багет|молдинг/.test(text)) {
    return 'molding';
  }

  // Малярні
  if (/фарбуван|малярн|шпалер.*клей|побілк|лакуван|емал|водоемульс/.test(text)) {
    return 'painting';
  }

  // Склярські
  if (/склінн|скло|вітраж|склопакет|дзеркал/.test(text)) {
    return 'glazing';
  }

  // Шпалери
  if (/шпалер/.test(text)) {
    return 'wallpaper';
  }

  return null;
}

/**
 * Find top N matching norms (for AI prompt enrichment).
 */
export function findTopZbirnykNorms(
  description: string,
  unit?: string,
  limit: number = 3
): ZbirnykSearchResult[] {
  const section = detectZbirnykSection(description);
  const descTokens = tokenize(description);
  const normalizedDescUnit = normalizeUnit(unit);

  const candidates = section
    ? ZBIRNYK_15_NORMS.filter(n => n.section === section)
    : ZBIRNYK_15_NORMS;

  const scored: ZbirnykSearchResult[] = [];

  for (const norm of candidates) {
    if (normalizedDescUnit && norm.unit) {
      const normalizedNormUnit = normalizeUnit(norm.unit);
      if (normalizedDescUnit !== normalizedNormUnit) continue;
    }

    const normTokens = tokenize(norm.desc + ' ' + norm.group);
    const descScore = jaccard(descTokens, normTokens);
    const keywordScore = norm.keywords.length > 0
      ? norm.keywords.filter(k => descTokens.includes(k)).length / norm.keywords.length
      : 0;
    const similarity = descScore * 0.7 + keywordScore * 0.3;

    if (similarity >= 0.2) {
      scored.push({
        norm,
        similarity,
        matchType: descScore > keywordScore ? 'description' : 'keywords',
      });
    }
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}
