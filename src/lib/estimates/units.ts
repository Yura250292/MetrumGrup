/**
 * Дозволені одиниці виміру для робіт кошторису (P2).
 *
 * Канонічний список для UI-дропдауна форми позиції та м'якої валідації.
 * НЕ хард-енфорсимо на AI/Excel-імпортах — там одиниці приходять довільні і
 * нормалізуються окремо; жорстка заборона зламала б легітимні імпорти.
 */
export const ALLOWED_UNITS = ["м²", "м³", "пог.м", "шт", "компл"] as const;

export type AllowedUnit = (typeof ALLOWED_UNITS)[number];

/** Поширені синоніми → канонічна одиниця (для нормалізації вводу/імпорту). */
const UNIT_SYNONYMS: Record<string, AllowedUnit> = {
  "м2": "м²",
  "m2": "м²",
  "кв.м": "м²",
  "кв м": "м²",
  "м3": "м³",
  "m3": "м³",
  "куб.м": "м³",
  "пог.м.": "пог.м",
  "пм": "пог.м",
  "п.м": "пог.м",
  "шт.": "шт",
  "компл.": "компл",
  "к-т": "компл",
};

export function isAllowedUnit(unit: string | null | undefined): unit is AllowedUnit {
  return !!unit && (ALLOWED_UNITS as readonly string[]).includes(unit);
}

/**
 * Приводить одиницю до канонічної з дозволеного списку, якщо впізнаємо.
 * Інакше повертає вхідний рядок (trimmed) — нормалізація best-effort.
 */
export function normalizeUnit(unit: string | null | undefined): string {
  const raw = (unit ?? "").trim();
  if (!raw) return raw;
  if (isAllowedUnit(raw)) return raw;
  const lower = raw.toLowerCase();
  return UNIT_SYNONYMS[lower] ?? UNIT_SYNONYMS[raw] ?? raw;
}
