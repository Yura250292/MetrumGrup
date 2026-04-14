/**
 * Пошук по нормах КНУ РЕКНб.
 *
 * Стратегії пошуку:
 *   1. Exact code match (якщо AI вказав код "15-60-1") → confidence 1.0
 *   2. Volume-filtered Jaccard similarity по опису → confidence 0.6-0.95
 *   3. Keyword-based fallback → confidence 0.4-0.7
 */

import { KNU_NORMS, type KnuNorm, type KnuSection, type KnuVolume, AGENT_VOLUMES, getNormsByVolumes } from './knu-norms';

export interface KnuSearchResult {
  norm: KnuNorm;
  similarity: number;
  matchType: 'code' | 'description' | 'keywords';
}

/**
 * Map of user terms → official КНУ terms (for better matching).
 * Left side: common/commercial name, right side: official KNU vocabulary.
 */
const SYNONYMS: Record<string, string[]> = {
  'газоблок': ['газобетонні', 'газобетон', 'блоки'],
  'газоблоки': ['газобетонні', 'газобетон', 'блоки'],
  'пеноблок': ['пінобетонні', 'пінобетон', 'блоки'],
  'керамоблок': ['керамічні', 'блоки'],
  'ламінат': ['ламінату', 'покрить', 'підлог'],
  'паркет': ['паркетні', 'дошки', 'покрить'],
  'вінілова': ['покрить', 'підлог'],
  'кабель': ['дроти', 'проводи', 'прокладання', 'розведенн'],
  'кабелі': ['дроти', 'проводи', 'прокладання'],
  'ввгнг': ['кабель', 'провід'],
  'pex': ['поліпропіленові', 'пластикові', 'труби'],
  'пекс': ['поліпропіленові', 'труби'],
  'поліпропілен': ['поліпропіленові', 'труби'],
  'пвх': ['полівінілхлорид', 'пластикові'],
  'розетка': ['установчі', 'електроприлад'],
  'вимикач': ['установчі', 'електроприлад'],
  'крокви': ['кроквяної', 'крокв', 'системи', 'даху'],
  'кроква': ['кроквяної', 'крокв'],
  'утеплення': ['теплоізоляц', 'ізоляц'],
  'утеплювач': ['теплоізоляц', 'ізоляц'],
  'мінвата': ['мінераловат', 'теплоізоляц'],
  'металочерепиця': ['покрівельн', 'сталевих', 'профільованих'],
  'штукатурка': ['штукатурен', 'штукатур'],
  'шпаклівка': ['шпаклюван', 'шпаклівк'],
  'фарба': ['фарбуван', 'фарбуванн', 'малярн'],
  'плитка': ['плиток', 'плитками', 'плиткою', 'керамічн', 'облицюван'],
  'клей': ['клейовий', 'клеєм'],
  'стяжка': ['стяжк', 'вирівнюван'],
  'гіпсокартон': ['гіпсокартонн', 'гіпсових', 'плит'],
  'перегородка': ['перегородк', 'перегородок'],
};

function expandSynonyms(tokens: string[]): string[] {
  const expanded = [...tokens];
  for (const t of tokens) {
    // Check if any synonym key is a prefix of this token
    for (const [key, values] of Object.entries(SYNONYMS)) {
      if (t.startsWith(key) || key.startsWith(t)) {
        expanded.push(...values);
      }
    }
  }
  return [...new Set(expanded)];
}

function tokenize(text: string): string[] {
  const base = text
    .toLowerCase()
    .replace(/[«»"'().,;:!?\-–—]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !/^\d+$/.test(t));
  return expandSynonyms(base);
}

/**
 * Asymmetric overlap: how much of the query is covered by the norm.
 * This works better than Jaccard for short queries against long norm descriptions.
 *
 * score = |query ∩ norm| / |query|   (coverage of query tokens)
 * Plus small bonus if many norm tokens also match (to prefer tighter matches).
 */
function similarity(query: string[], norm: string[]): number {
  if (query.length === 0 || norm.length === 0) return 0;
  const setQ = new Set(query);
  const setN = new Set(norm);
  let intersection = 0;
  for (const x of setQ) if (setN.has(x)) intersection++;
  if (intersection === 0) return 0;

  const queryCoverage = intersection / setQ.size;
  // Bonus for density of match in norm (helps pick more specific norms)
  const normCoverage = intersection / setN.size;
  return queryCoverage * 0.8 + normCoverage * 0.2;
}

function normalizeUnit(unit: string | undefined): string {
  if (!unit) return '';
  return unit
    .toLowerCase()
    .replace(/м2|кв\.?м|кв\.?метр/gi, 'м²')
    .replace(/м3|куб\.?м/gi, 'м³')
    .replace(/\s+|\./g, '')
    .trim();
}

/**
 * Detect which agent category a work description belongs to.
 * Order matters: more specific/exclusive checks come first.
 */
export function detectAgentCategory(description: string): string | null {
  const text = description.toLowerCase();

  // Demolition first (часто містить ключові слова інших категорій)
  if (/демонтаж|розбиранн|знесенн|реконструкц|вивезенн.*сміт|підсилен.*конструкц/.test(text))
    return 'demolition';

  // Earthworks
  if (/земляні|котлован|траншея|ґрунт|грунт|розробк.*(ґрунт|грунт)|вивезенн.*ґрунт|планування.*(майданч|території)/.test(text))
    return 'earthworks';

  // Foundation / concrete
  if (/фундамент|бетон.*заливк|арматур|опалубк|стяжк.*(фундамент|основ)|залізобетон|монолітн.*(бетон|перекрит|колон)/.test(text))
    return 'foundation';

  // Finishing (перевіряти раніше walls щоб "облицювання стін плиткою" не потрапило в walls)
  if (/облицюван|плитк|керамограніт|штукатур|шпаклів|фарбуван|малярн|лінолеум|ламінат|паркет|вінілов|утеплен|теплоізоляц|стяжк.*(підлог|основ)|шпалер|склярськ/.test(text))
    return 'finishing';

  // Walls / masonry / metal
  if (/кладка|мурування|цегла|цегляних|газоблок|газобетон|пеноблок|керамоблок|блок.*стін|метал.*конструкц|колон|ферм|балк|перегородк/.test(text))
    return 'walls';

  // Roofing (wood + roofing)
  if (/покрівл|дах|крокв|мауерлат|обрешітк|металочерепиц|профнастил|водостічн/.test(text))
    return 'roofing';

  // HVAC (перевіряти перед plumbing бо "труб опалення" може збігтися)
  if (/вентиляц|опалення|кондиціонер|радіатор|котел|тепла підлог|припливн|рекуператор|газопост|повітровод/.test(text))
    return 'hvac';

  // Plumbing
  if (/сантехнік|водопровід|каналізац|стояк|унітаз|раковин|змішувач|бойлер|труб.*(пвх|пп|pex|пекс|водопровід)/.test(text))
    return 'plumbing';

  // Electrical
  if (/електрик|кабель|кабел|провід(?!н)|проводк|розетк|вимикач|щит.*(електр|розподіль)|автомат.*в[а-яё]мик|освітленн|світильник|ввгнг|прокладанн.*(кабел|провід)/.test(text))
    return 'electrical';

  return null;
}

/**
 * Match description against KNU norms.
 *
 * @param description Work item description
 * @param unit Unit hint (optional)
 * @param agentCategory Narrow search to this agent's volumes (optional)
 * @param minSimilarity Minimum Jaccard similarity (default 0.3)
 */
export function findBestKnuNorm(
  description: string,
  unit?: string,
  agentCategory?: string,
  minSimilarity: number = 0.3
): KnuSearchResult | null {
  if (!description) return null;

  // 1. Exact code match (e.g., "15-60-1" anywhere in description)
  const codeMatch = description.match(/\b\d{1,2}-\d+-\d+\b/);
  if (codeMatch) {
    const norm = KNU_NORMS.find(n => n.code === codeMatch[0]);
    if (norm) {
      return { norm, similarity: 1.0, matchType: 'code' };
    }
  }

  const descTokens = tokenize(description);
  const normalizedDescUnit = normalizeUnit(unit);

  // Get candidates: filtered by agent's volumes if category provided
  const candidates: KnuNorm[] = agentCategory && AGENT_VOLUMES[agentCategory]
    ? getNormsByVolumes(AGENT_VOLUMES[agentCategory])
    : KNU_NORMS;

  let best: KnuSearchResult | null = null;

  for (const norm of candidates) {
    // Unit filter: if both have units, they must match
    if (normalizedDescUnit && norm.unit) {
      const normalizedNormUnit = normalizeUnit(norm.unit);
      if (normalizedNormUnit && normalizedDescUnit !== normalizedNormUnit) continue;
    }

    const normTokens = tokenize(norm.desc + ' ' + norm.groupTitle);
    const sim = similarity(descTokens, normTokens);

    if (sim >= minSimilarity && (!best || sim > best.similarity)) {
      best = { norm, similarity: sim, matchType: 'description' };
    }
  }

  return best;
}

/**
 * Find top N matching norms (for AI prompt enrichment).
 */
export function findTopKnuNorms(
  description: string,
  unit?: string,
  agentCategory?: string,
  limit: number = 3
): KnuSearchResult[] {
  const descTokens = tokenize(description);
  const normalizedDescUnit = normalizeUnit(unit);

  const autoCategory = agentCategory ?? detectAgentCategory(description);
  const candidates: KnuNorm[] = autoCategory && AGENT_VOLUMES[autoCategory]
    ? getNormsByVolumes(AGENT_VOLUMES[autoCategory])
    : KNU_NORMS;

  const scored: KnuSearchResult[] = [];

  for (const norm of candidates) {
    if (normalizedDescUnit && norm.unit) {
      const normalizedNormUnit = normalizeUnit(norm.unit);
      if (normalizedNormUnit && normalizedDescUnit !== normalizedNormUnit) continue;
    }

    const normTokens = tokenize(norm.desc + ' ' + norm.groupTitle);
    const sim = similarity(descTokens, normTokens);

    if (sim >= 0.2) {
      scored.push({ norm, similarity: sim, matchType: 'description' });
    }
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}
