// Working-hours calendar for RFI SLA (Europe/Kyiv).
// Working week: Mon–Fri 09:00–18:00. Saturday / Sunday — not working.
// Holidays — fixed list below. Holiday editing UI is rev.2.

export const WORK_HOURS_START = 9;  // 09:00 local Kyiv
export const WORK_HOURS_END = 18;   // 18:00 local Kyiv (exclusive)
export const WORK_HOURS_PER_DAY = WORK_HOURS_END - WORK_HOURS_START; // 9

/// Ukrainian public holidays (work-free days). Format: "YYYY-MM-DD" in Kyiv local.
/// Воєнні укази 2022+ перенесли частину — список нижче відповідає поточному стану.
export const HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // Новий рік
  "2026-01-07", // Різдво
  "2026-03-08", // Міжнародний жіночий день
  "2026-04-12", // Великдень (Пасха) — змінна, вираховуй на рік
  "2026-05-01", // День праці
  "2026-05-09", // День памʼяті
  "2026-05-31", // Трійця — змінна
  "2026-06-28", // День Конституції
  "2026-08-24", // День Незалежності
  "2026-10-14", // День захисників і захисниць
  "2026-12-25", // Різдво (григоріанське)

  // 2027
  "2027-01-01",
  "2027-01-07",
  "2027-03-08",
  "2027-05-02", // Великдень 2027
  "2027-05-01",
  "2027-05-09",
  "2027-06-20", // Трійця 2027
  "2027-06-28",
  "2027-08-24",
  "2027-10-14",
  "2027-12-25",
]);

/// Returns Kyiv local Y/M/D/h/m/s parts of a Date. Uses Intl to avoid deps.
function kyivParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dow: dowMap[parts.weekday as string] ?? 0,
  };
}

/// Constructs a UTC Date from Kyiv local Y/M/D/h/m/s. Handles DST automatically
/// via offset lookup at the constructed instant.
function kyivToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  // Initial naive UTC guess.
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Compute Kyiv offset at that instant by re-parsing.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(guess).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const kyivAtGuess = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  // Offset: how much UTC is behind Kyiv at this instant.
  const offsetMs = kyivAtGuess - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isHoliday(date: Date, holidays: ReadonlySet<string> = HOLIDAYS): boolean {
  const { year, month, day } = kyivParts(date);
  return holidays.has(ymd(year, month, day));
}

export function isWorkingDay(date: Date, holidays: ReadonlySet<string> = HOLIDAYS): boolean {
  const { dow } = kyivParts(date);
  if (dow === 0 || dow === 6) return false; // Sun / Sat
  return !isHoliday(date, holidays);
}

/// Returns the start of the next working moment ≥ `from`. If `from` is already
/// inside a working window — returns `from`. Otherwise advances to the next
/// 09:00 of a working day.
export function nextWorkingMoment(from: Date, holidays: ReadonlySet<string> = HOLIDAYS): Date {
  const { year, month, day, hour, minute, second } = kyivParts(from);

  if (isWorkingDay(from, holidays) && hour >= WORK_HOURS_START && (hour < WORK_HOURS_END || (hour === WORK_HOURS_END && minute === 0 && second === 0))) {
    // Inside working window (treat 18:00:00 sharp as the boundary — *not* inside).
    if (hour < WORK_HOURS_END) return from;
  }

  // Walk forward day-by-day until we find a working day; pin time at 09:00.
  let y = year;
  let m = month;
  let d = day;
  let h = hour;

  // If before 09:00 on a working day → today at 09:00.
  if (isWorkingDay(from, holidays) && h < WORK_HOURS_START) {
    return kyivToUtc(y, m, d, WORK_HOURS_START, 0, 0);
  }

  // Else: advance to next day, then keep advancing while non-working.
  do {
    const next = kyivToUtc(y, m, d, WORK_HOURS_START, 0, 0);
    // Add 24h then renormalize via Kyiv parts.
    const tomorrow = new Date(next.getTime() + 24 * 3600 * 1000);
    const p = kyivParts(tomorrow);
    y = p.year;
    m = p.month;
    d = p.day;
    h = WORK_HOURS_START;
  } while (!isWorkingDay(kyivToUtc(y, m, d, WORK_HOURS_START, 0, 0), holidays));

  return kyivToUtc(y, m, d, WORK_HOURS_START, 0, 0);
}

/// Adds `hours` of working time (Mon–Fri 09:00–18:00 Kyiv, skipping holidays)
/// to `from`. Returns the resulting UTC Date.
export function addWorkingHours(from: Date, hours: number, holidays: ReadonlySet<string> = HOLIDAYS): Date {
  if (hours <= 0) return from;
  let cursor = nextWorkingMoment(from, holidays);
  let remaining = hours;

  while (remaining > 0) {
    const { year, month, day, hour, minute, second } = kyivParts(cursor);
    // Hours left in today's working window.
    const hourFloat = hour + minute / 60 + second / 3600;
    const dayEndHours = WORK_HOURS_END - hourFloat; // hours till 18:00 today
    if (remaining <= dayEndHours) {
      // Finish today.
      const newHourFloat = hourFloat + remaining;
      const newH = Math.floor(newHourFloat);
      const newMinFloat = (newHourFloat - newH) * 60;
      const newMin = Math.floor(newMinFloat);
      const newSec = Math.round((newMinFloat - newMin) * 60);
      return kyivToUtc(year, month, day, newH, newMin, newSec);
    }
    // Consume rest of today, advance to next working day at 09:00.
    remaining -= dayEndHours;
    // Tomorrow at 09:00:
    const tomorrow = new Date(kyivToUtc(year, month, day, WORK_HOURS_START, 0, 0).getTime() + 24 * 3600 * 1000);
    cursor = nextWorkingMoment(tomorrow, holidays);
  }
  return cursor;
}
