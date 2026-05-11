/**
 * Supplier name normalizer for ledger imports.
 *
 * Кошторисниця в Excel пише назви хаотично: "бударена", "ТзОВ Бударена",
 * `ТзОВ "Бударена"`, "БУДАРЕНА  ". Всі чотири — той самий контрагент.
 * Цей модуль виробляє стабільний ключ для групування таких варіантів у
 * один кластер перед створенням Counterparty.
 *
 * Свідомо консервативний: не зливає назви що відрізняються словами
 * (напр. "альянс фасад" vs "альянс фасад груп" → різні кластери, бо це
 * РІЗНІ юрособи).
 */

/// Legal-form prefixes/suffixes що знімаються при кластеризації. Регістр
/// нечутливий, межі слів обовʼязкові. Розширюй за потребою.
const LEGAL_FORMS = [
  "тзов",
  "тов",
  "пп",
  "фоп",
  "пп\\.",
  "приватне підприємство",
  "приватнепідприємство",
  "ат",
  "пат",
  "дп",
  "товариство з обмеженою відповідальністю",
];

// `\b` у JS-regex працює лише для ASCII — для кирилиці треба lookaround-и
// по non-letter символам.
const LEGAL_FORM_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${LEGAL_FORMS.join("|")})(?![\\p{L}\\p{N}])\\.?`,
  "giu",
);
const QUOTE_CHARS_RE = /[«»"'`'']/g;
const PUNCT_RE = /[.,;:!?]/g;
const WHITESPACE_RE = /\s+/g;

/**
 * Нормалізує назву до canonical-ключа для групування.
 * Повертає порожній рядок якщо вхід порожній.
 */
export function normalizeSupplierKey(name: string | null | undefined): string {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(LEGAL_FORM_RE, " ")
    .replace(QUOTE_CHARS_RE, " ")
    .replace(PUNCT_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

/**
 * Визначає тип контрагента за raw-назвою.
 * Heuristics: ФОП → FOP; ТОВ/ТзОВ/ПП/АТ/ДП → LEGAL; інакше LEGAL за замовчуванням.
 *
 * Прізвище-імʼя-по-батькові без legal-form (e.g. "Садкова Ірина Миронівна") —
 * INDIVIDUAL. Детект: 2-3 слова кирилиці з великих літер після нижнього регістру.
 */
export function inferCounterpartyType(
  rawName: string | null | undefined,
): "LEGAL" | "FOP" | "INDIVIDUAL" {
  if (!rawName) return "LEGAL";
  const lower = String(rawName).toLowerCase();

  const FOP_RE = /(?<![\p{L}\p{N}])фоп(?![\p{L}\p{N}])/iu;
  const LEGAL_RE = /(?<![\p{L}\p{N}])(тов|тзов|пп|ат|пат|дп|товариство)(?![\p{L}\p{N}])/iu;
  if (FOP_RE.test(lower)) return "FOP";
  if (LEGAL_RE.test(lower)) return "LEGAL";

  // ПІБ: ≥3 кириличних слова, ВСІ починаються з великої літери ("Садкова Ірина
  // Миронівна"). Цей сигнал відрізняє фізособу від компанії з 2 слів у нижньому
  // регістрі ("колір буд").
  const tokens = String(rawName)
    .replace(QUOTE_CHARS_RE, " ")
    .split(/\s+/)
    .filter(Boolean);
  const cyrillic = tokens.filter((t) => /^[Ѐ-ӿ'\-]+$/.test(t));
  if (
    tokens.length >= 3 &&
    cyrillic.length === tokens.length &&
    cyrillic.every((t) => /^[А-ЩЬЮЯҐЄІЇ]/.test(t))
  ) {
    return "INDIVIDUAL";
  }

  return "LEGAL";
}

/**
 * Обирає canonical display-name з кластеру raw-варіантів.
 * Стратегія: найдовший варіант (зазвичай він найбільш повний — з legal-form
 * і правильним регістром). При нічиї бере перший.
 * Trims, але не змінює регістр і не торкається лапок.
 */
export function pickDisplayName(rawNames: string[]): string {
  const cleaned = rawNames.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned.reduce((best, cur) => (cur.length > best.length ? cur : best));
}
