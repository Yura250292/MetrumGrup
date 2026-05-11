/**
 * Fuzzy matcher: "Куди везли" (free-text локація з рахунку) → existing Project.
 *
 * Кошторисниця пише локації коротко і з описом матеріалу:
 *   "форум маг ССС", "зелена 99 пінопласт", "Раковського з доставкою",
 *   "ТЦ Авалон", "винники мик". Тому матчимо по токенах, а не повним рядком.
 *
 * Алгоритм:
 *   1. Токенізувати destination (lowercase, видалити stop-words та чисельні
 *      позначки матеріалів) → set of tokens.
 *   2. Для кожного Project (firmId-scoped) токенізувати title + address + slug.
 *   3. Confidence = |dest ∩ project| / |project tokens|. Найвища confidence ≥ 0.7
 *      виграє. При нічиї беремо найкоротший projectTokens (більш специфічний match).
 *
 * Свідомо консервативний: краще не змаппити, ніж зчіпити рахунок до неправильного
 * проекту. Незмаппіні залишаються з projectId=null.
 */

const STOP_WORDS = new Set([
  "на",
  "в",
  "у",
  "до",
  "з",
  "за",
  "і",
  "та",
  "для",
  "по",
  "при",
  "матеріали",
  "матеріал",
  "доставка",
  "доставкою",
  "доставку",
  "доставки",
  "сам",
  "самі",
  "з",
  "збираємо",
  "забирали",
  "адресна",
  "адресною",
  "адресну",
  "адресній",
  "оплата",
  "оплатою",
  "пов",
  "поверх",
  "поверху",
]);

const NON_ALNUM_RE = /[^\p{L}\p{N}]+/gu;

export function tokenize(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .toLowerCase()
    .replace(NON_ALNUM_RE, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

export type ProjectCandidate = {
  id: string;
  title: string;
  slug: string;
  address: string | null;
};

export type ProjectMatch = {
  projectId: string | null;
  confidence: number;
};

const CONFIDENCE_THRESHOLD = 0.7;

/// Стем-префікс — перші 4 символи токена. Це грубий, але дієвий спосіб
/// толерувати українські відмінки ("зелена"/"зелену"/"зеленої" → "зеле").
function stem(token: string): string {
  return token.length <= 4 ? token : token.slice(0, 4);
}

export function matchProject(
  destination: string | null | undefined,
  candidates: ProjectCandidate[],
): ProjectMatch {
  if (!destination) return { projectId: null, confidence: 0 };
  const destStems = new Set(tokenize(destination).map(stem));
  if (destStems.size === 0) return { projectId: null, confidence: 0 };

  let best: { id: string; confidence: number; specificity: number } | null = null;

  for (const c of candidates) {
    const projStems = new Set(
      [...tokenize(c.title), ...tokenize(c.address ?? ""), ...tokenize(c.slug)].map(
        stem,
      ),
    );
    if (projStems.size === 0) continue;

    let overlap = 0;
    for (const t of projStems) if (destStems.has(t)) overlap++;
    if (overlap === 0) continue;

    // Confidence = яка частка опису "Куди везли" покривається проектом.
    // Не нормуємо по projStems.size, бо це penalize-ить проекти з повними
    // адресами ("Будівництво ЖК Зелена 115, вул. Зелена 115" → 4 токени).
    const confidence = overlap / destStems.size;
    if (confidence < CONFIDENCE_THRESHOLD) continue;

    // При нічиї віддаємо перевагу більшому overlap-у (більш специфічний match
    // — "зелена 115" виграє у "зелена 99" якщо destination згадує "115").
    if (
      !best ||
      overlap > best.specificity ||
      (overlap === best.specificity && confidence > best.confidence)
    ) {
      best = { id: c.id, confidence, specificity: overlap };
    }
  }

  return best
    ? { projectId: best.id, confidence: best.confidence }
    : { projectId: null, confidence: 0 };
}
