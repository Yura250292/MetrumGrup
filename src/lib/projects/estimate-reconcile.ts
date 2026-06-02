/**
 * Звірка арифметики кошторисних лінійок (для AI-помічника парсингу кошторисів).
 * Чисте, тестоване. Якщо стейтед сума рядка не дорівнює кількість×ціна —
 * ймовірна помилка в кошторисі → UI підсвічує клітинку червоним.
 */

export type LineReconcileStatus = "ok" | "mismatch" | "na";

export type LineReconcile = {
  status: LineReconcileStatus;
  /** Очікувана сума = quantity × unitPrice (null якщо даних бракує). */
  expected: number | null;
  /** Стейтед сума з кошторису. */
  stated: number | null;
  /** stated − expected (для підказки). */
  diff: number | null;
};

/**
 * tolerance: допуск на округлення. За замовч. max(0.5 грн, 0.5% від очікуваного).
 * Якщо бракує quantity/unitPrice/amount — статус "na" (нема що звіряти).
 */
export function reconcileLine(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
  amount: number | null | undefined,
  toleranceAbs = 0.5,
  tolerancePct = 0.005,
): LineReconcile {
  const q = numOrNull(quantity);
  const p = numOrNull(unitPrice);
  const stated = numOrNull(amount);

  if (q === null || p === null || stated === null) {
    return { status: "na", expected: null, stated, diff: null };
  }
  const expected = round2(q * p);
  const diff = round2(stated - expected);
  const tol = Math.max(toleranceAbs, Math.abs(expected) * tolerancePct);
  return {
    status: Math.abs(diff) <= tol ? "ok" : "mismatch",
    expected,
    stated,
    diff,
  };
}

function numOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
