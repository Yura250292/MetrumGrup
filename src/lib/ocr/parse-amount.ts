/**
 * Parse amount from Ukrainian/European text format.
 * Handles "23 121,12" (UA), "23,121.12" (EN), "23121.12", "23121,12".
 * Returns null when no positive finite number can be extracted.
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d\s,.]/g, "").trim();
  if (!cleaned) return null;
  cleaned = cleaned.replace(/\s/g, "");

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const afterComma = cleaned.length - 1 - lastComma;
    if (afterComma === 1 || afterComma === 2) {
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const afterDot = cleaned.length - 1 - lastDot;
    if (afterDot !== 1 && afterDot !== 2) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}
