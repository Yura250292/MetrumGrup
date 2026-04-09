/**
 * Section detector for delta-based refine (Plan Stage 6).
 *
 * Given the user's free-form "what changed" text + uploaded documents, work
 * out which sections of the estimate are likely to be affected. Used by the
 * refine route to avoid re-running every agent when only one area changed.
 *
 * Detection is keyword-based and intentionally permissive: we'd rather
 * over-include a section than miss one. False positives just trigger an extra
 * re-generation; false negatives silently leave outdated numbers in place.
 */

export type SectionCategory =
  | 'demolition'
  | 'earthworks'
  | 'foundation'
  | 'walls'
  | 'roofing'
  | 'electrical'
  | 'hvac'
  | 'plumbing'
  | 'fire_safety'
  | 'finishing';

const SECTION_KEYWORDS: Record<SectionCategory, string[]> = {
  demolition: ['демонтаж', 'розбиранн', 'зняти', 'видалит'],
  earthworks: ['земляні', 'екскаваці', 'котлован', 'планування', 'засипка'],
  foundation: ['фундамент', 'бетон', 'арматур', 'опалубк', 'паль', 'плит', 'стрічк', 'гідроізол', 'дренаж'],
  walls: ['стін', 'газоблок', 'цегл', 'мурув', 'каркас', 'утеплен', 'фасад'],
  roofing: ['покрівл', 'дах', 'крокв', 'металочерепиц', 'мʼяк', 'м\'як'],
  electrical: ['електр', 'розетк', 'вимикач', 'кабел', 'щит', 'автомат', 'освітлен'],
  hvac: ['вентиляц', 'опален', 'кондиціонер', 'hvac', 'котел', 'радіатор', 'тепла підлог'],
  plumbing: ['сантехнік', 'водопостач', 'каналізаці', 'труба', 'унітаз', 'умивальник', 'душ'],
  fire_safety: ['пожежн', 'спринклер', 'сигналізаці пожежн', 'fire'],
  finishing: ['оздоблен', 'плитк', 'ламінат', 'паркет', 'фарб', 'шпаклівк', 'штукатурк', 'стел'],
};

const SECTION_TITLE_KEYWORDS: Record<SectionCategory, string[]> = {
  demolition: ['демонтаж'],
  earthworks: ['земл'],
  foundation: ['фундамент'],
  walls: ['стін', 'конструкц'],
  roofing: ['покрівл', 'дах'],
  electrical: ['електр'],
  hvac: ['вентиляц', 'опален', 'hvac'],
  plumbing: ['сантехнік', 'каналізац'],
  fire_safety: ['пожежн'],
  finishing: ['оздоблен', 'фінішн'],
};

/**
 * Return the categories that the input text seems to talk about.
 * Returns the full list (all categories) when text is empty — that
 * preserves "regenerate everything" semantics for callers that don't want
 * delta-mode.
 */
export function detectImpactedCategories(input: string): SectionCategory[] {
  const text = (input ?? '').toLowerCase();
  if (text.trim().length === 0) {
    return Object.keys(SECTION_KEYWORDS) as SectionCategory[];
  }
  const hits = new Set<SectionCategory>();
  for (const [cat, kws] of Object.entries(SECTION_KEYWORDS)) {
    if (kws.some((kw) => text.includes(kw))) {
      hits.add(cat as SectionCategory);
    }
  }
  return Array.from(hits);
}

/**
 * Map an existing estimate section title onto a category, so we know whether
 * to keep its items or replace them.
 */
export function classifySectionTitle(title: string): SectionCategory | null {
  const t = (title ?? '').toLowerCase();
  for (const [cat, kws] of Object.entries(SECTION_TITLE_KEYWORDS)) {
    if (kws.some((kw) => t.includes(kw))) {
      return cat as SectionCategory;
    }
  }
  return null;
}

/**
 * Decide whether a given section title should be re-generated based on
 * detected impacted categories.
 */
export function isSectionImpacted(
  sectionTitle: string,
  impacted: SectionCategory[]
): boolean {
  if (impacted.length === 0) return false;
  const cat = classifySectionTitle(sectionTitle);
  if (cat === null) {
    // Unknown section — be safe and re-generate.
    return true;
  }
  return impacted.includes(cat);
}
