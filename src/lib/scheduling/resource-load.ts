/**
 * Calculates daily load per assignee, з виявленням overload (>8h на день).
 * 7-денний робочий тиждень — без skipWeekends/holidays (per user preference).
 */
import { prisma } from "../prisma";

export type ResourceLoadDay = {
  date: string; // YYYY-MM-DD
  hours: number;
  overload: boolean; // hours > OVERLOAD_THRESHOLD
};

export type ResourceLoadEntry = {
  userId: string;
  userName: string;
  days: ResourceLoadDay[];
};

const OVERLOAD_THRESHOLD = 8; // hours/day
const DEFAULT_TASK_HOURS_PER_DAY = 8;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d.getTime() <= last.getTime()) {
    out.push(isoDay(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Returns one entry per assignee with daily-bucketed hours для всіх задач
 * проєкту, де assignee призначений. Якщо задача має кілька assignees —
 * hours розподіляються порівну.
 *
 * Не враховує external (не-user) assignees — їх не показуємо у resource view.
 */
export async function computeResourceLoad(
  projectId: string,
): Promise<ResourceLoadEntry[]> {
  const tasks = await prisma.task.findMany({
    where: { projectId, isArchived: false },
    select: {
      id: true,
      startDate: true,
      dueDate: true,
      plannedStartAt: true,
      plannedEndAt: true,
      estimatedHours: true,
      assignees: {
        select: {
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Map<userId, { name, days: Map<dateISO, hours> }>
  const acc = new Map<string, { name: string; days: Map<string, number> }>();

  for (const t of tasks) {
    const start = t.plannedStartAt ?? t.startDate;
    const end = t.plannedEndAt ?? t.dueDate ?? start;
    if (!start || !end) continue;

    const allDays = daysBetween(start, end);
    if (allDays.length === 0) continue;

    const totalHours =
      t.estimatedHours != null
        ? Number(t.estimatedHours)
        : allDays.length * DEFAULT_TASK_HOURS_PER_DAY;
    const hoursPerDay = totalHours / allDays.length;

    const realAssignees = t.assignees
      .map((a) => a.user)
      .filter((u): u is { id: string; name: string } => !!u);
    if (realAssignees.length === 0) continue;

    const sharePerAssignee = hoursPerDay / realAssignees.length;

    for (const u of realAssignees) {
      let bucket = acc.get(u.id);
      if (!bucket) {
        bucket = { name: u.name, days: new Map() };
        acc.set(u.id, bucket);
      }
      for (const day of allDays) {
        bucket.days.set(day, (bucket.days.get(day) ?? 0) + sharePerAssignee);
      }
    }
  }

  const result: ResourceLoadEntry[] = [];
  for (const [userId, { name, days }] of acc) {
    const sortedDays = [...days.entries()]
      .map(([date, hours]) => ({
        date,
        hours: Math.round(hours * 100) / 100,
        overload: hours > OVERLOAD_THRESHOLD,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    result.push({ userId, userName: name, days: sortedDays });
  }
  return result.sort((a, b) => a.userName.localeCompare(b.userName));
}
