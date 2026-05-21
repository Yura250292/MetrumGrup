/**
 * Shared decimal parsing/formatting for foreman PWA inputs.
 * Foreman вводить числа з комою або крапкою — обидва формати приймаємо.
 */

export function parseNum(s: string | undefined | null): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function formatNum(n: number, digits = 2): string {
  return n.toLocaleString("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatMoney(n: number): string {
  return n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
