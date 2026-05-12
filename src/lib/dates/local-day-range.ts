/**
 * Convert a date string from `<input type="date">` (`"YYYY-MM-DD"`) into an
 * ISO timestamp that represents the start/end of that day in the **browser's
 * local timezone** (e.g. Europe/Kiev).
 *
 * `new Date("YYYY-MM-DD")` is parsed as UTC midnight per the spec — that
 * shifts the boundary by the local UTC offset. Appending an explicit time
 * component without `Z` is parsed as local time, which is what we want for
 * day-range filters driven by a user's calendar pick.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ensureIsoDate(dateStr: string): string {
  if (!ISO_DATE_RE.test(dateStr)) {
    throw new Error(`Expected YYYY-MM-DD, got "${dateStr}"`);
  }
  return dateStr;
}

export function startOfLocalDayISO(dateStr: string): string {
  return new Date(`${ensureIsoDate(dateStr)}T00:00:00`).toISOString();
}

export function endOfLocalDayISO(dateStr: string): string {
  return new Date(`${ensureIsoDate(dateStr)}T23:59:59.999`).toISOString();
}
