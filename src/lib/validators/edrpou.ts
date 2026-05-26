/**
 * Валідація українських податкових ідентифікаторів за стандартом ДСТУ 4163-2003
 * і офіційною методикою ДПС:
 *   • ЄДРПОУ — 8 цифр для юридичних осіб (Єдиний державний реєстр підприємств
 *     та організацій України).
 *   • РНОКПП (ІПН) — 10 цифр для фізичних осіб і ФОП (Реєстраційний номер
 *     облікової картки платника податків).
 *
 * Обидва містять контрольну суму. Алгоритми відрізняються (різні вагові коефіцієнти).
 */

const EDRPOU_BASE_WEIGHTS = [1, 2, 3, 4, 5, 6, 7] as const;
const EDRPOU_FALLBACK_WEIGHTS = [3, 4, 5, 6, 7, 8, 9] as const;

const RNOKPP_WEIGHTS = [-1, 5, 7, 9, 4, 6, 10, 5, 7] as const;

export function normalizeTaxId(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/[\s\-_]/g, "");
}

function computeEdrpouChecksum(digits: number[], weights: readonly number[]): number {
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  return sum % 11;
}

/**
 * Перевірка ЄДРПОУ (юрособа, 8 цифр).
 *
 * Алгоритм:
 *   1. Розрахувати контрольну суму з вагами [1..7] по перших 7 цифрах.
 *   2. Якщо `sum % 11 === 10` — повторити з вагами [3..9].
 *   3. Якщо знову 10 — недійсний.
 *   4. Інакше залишок має дорівнювати останній цифрі.
 */
export function isValidEdrpou(input: string | null | undefined): boolean {
  const normalized = normalizeTaxId(input);
  if (!/^\d{8}$/.test(normalized)) return false;
  const digits = normalized.split("").map(Number);
  const control = digits[7];

  const primary = computeEdrpouChecksum(digits, EDRPOU_BASE_WEIGHTS);
  if (primary !== 10) return primary === control;

  const fallback = computeEdrpouChecksum(digits, EDRPOU_FALLBACK_WEIGHTS);
  if (fallback === 10) return false;
  return fallback === control;
}

/**
 * Перевірка РНОКПП / ІПН (фізична особа, 10 цифр).
 *
 * Алгоритм:
 *   sum = Σ(digit[i] * weight[i]) для i=0..8 (вагові [-1,5,7,9,4,6,10,5,7])
 *   checksum = (sum % 11) % 10
 *   має дорівнювати останній цифрі.
 */
export function isValidRnokpp(input: string | null | undefined): boolean {
  const normalized = normalizeTaxId(input);
  if (!/^\d{10}$/.test(normalized)) return false;
  const digits = normalized.split("").map(Number);
  const sum = RNOKPP_WEIGHTS.reduce((acc, w, i) => acc + w * digits[i], 0);
  const checksum = (sum % 11) % 10;
  return checksum === digits[9];
}

/**
 * Універсальна перевірка українського податкового ідентифікатора.
 * Підбирає алгоритм за довжиною.
 */
export function isValidTaxId(input: string | null | undefined): boolean {
  const normalized = normalizeTaxId(input);
  if (normalized.length === 8) return isValidEdrpou(normalized);
  if (normalized.length === 10) return isValidRnokpp(normalized);
  return false;
}
