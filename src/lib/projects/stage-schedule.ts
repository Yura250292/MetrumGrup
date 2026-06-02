/**
 * Календарний розрахунок дат етапів із залежностей (кошторис-графік).
 * Чисте, тестоване. Дати — календарні, кінець ВКЛЮЧНО
 * (тривалість 3 від 01.05 → кінець 03.05).
 *
 * start/end виводяться так:
 *  - без попередника → start = ручний startDate (якір);
 *  - FS: start = кінець попередника + 1 + зміщення;
 *  - SS: start = початок попередника + зміщення;
 *  - FF: end = кінець попередника + зміщення; start = end − (тривалість−1);
 *  - SF: end = початок попередника + зміщення; start = end − (тривалість−1);
 *  - end (для FS/SS/якоря): тривалість≥1 → start+(тривалість−1); тривалість=0 → start;
 *    тривалість не задана → ручний endDate (або start).
 */

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export type ScheduleRow = {
  id: string;
  startDate: string | Date | null;
  endDate: string | Date | null;
  plannedDurationDays: number | null;
  predecessorStageId: string | null;
  dependencyType: DependencyType | null;
  dependencyLagDays: number | null;
};

export type ScheduledDates = { start: string | null; end: string | null };

function toIso(v: string | Date | null): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function scheduleStages(rows: ScheduleRow[]): Map<string, ScheduledDates> {
  const byId = new Map<string, ScheduleRow>();
  for (const r of rows) byId.set(r.id, r);

  const result = new Map<string, ScheduledDates>();
  const inProgress = new Set<string>();

  function resolve(id: string): ScheduledDates {
    const cached = result.get(id);
    if (cached) return cached;

    const row = byId.get(id);
    if (!row) return { start: null, end: null };

    const manualStart = toIso(row.startDate);
    const manualEnd = toIso(row.endDate);
    const dur = row.plannedDurationDays;
    const type = row.dependencyType;
    const lag = row.dependencyLagDays ?? 0;

    // Захист від циклу: якщо вузол уже в стеку — повертаємо ручні дати.
    if (inProgress.has(id)) return { start: manualStart, end: manualEnd };
    inProgress.add(id);

    let start = manualStart;
    let end = manualEnd;

    const predId = row.predecessorStageId;
    const pred = predId && byId.has(predId) && predId !== id ? resolve(predId) : null;

    if (pred && type) {
      if (type === "FS" && pred.end) {
        start = addDays(pred.end, 1 + lag);
      } else if (type === "SS" && pred.start) {
        start = addDays(pred.start, lag);
      } else if (type === "FF" && pred.end) {
        end = addDays(pred.end, lag);
        start = dur && dur >= 1 ? addDays(end, -(dur - 1)) : end;
      } else if (type === "SF" && pred.start) {
        end = addDays(pred.start, lag);
        start = dur && dur >= 1 ? addDays(end, -(dur - 1)) : end;
      }
    }

    // Кінець із тривалості (для FS/SS/якоря; FF/SF уже мають end).
    if (type !== "FF" && type !== "SF") {
      if (dur != null) {
        end = start ? (dur >= 1 ? addDays(start, dur - 1) : start) : end;
      } else if (end == null) {
        end = start;
      }
    }

    inProgress.delete(id);
    const res = { start, end };
    result.set(id, res);
    return res;
  }

  for (const r of rows) resolve(r.id);
  return result;
}
