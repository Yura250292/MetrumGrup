import { prisma } from "@/lib/prisma";

/**
 * Aggregation reports for time / cost / team workload.
 * All scoped to a single project and date range (default: last 30 days).
 */

export type DateRange = { from: Date; to: Date };

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

export async function timeReport(projectId: string, range?: DateRange) {
  const { from, to } = range ?? defaultRange();
  const logs = await prisma.timeLog.findMany({
    where: {
      task: { projectId },
      startedAt: { gte: from, lte: to },
      endedAt: { not: null },
    },
    include: {
      user: { select: { id: true, name: true } },
      task: { select: { id: true, title: true, stageId: true } },
    },
  });

  const byUser = new Map<string, { userId: string; name: string; minutes: number; cost: number }>();
  const byTask = new Map<string, { taskId: string; title: string; minutes: number; cost: number }>();
  let totalMinutes = 0;
  let totalCost = 0;
  let billableMinutes = 0;
  let billableCost = 0;

  for (const l of logs) {
    const mins = l.minutes ?? 0;
    const cost = Number(l.costSnapshot ?? 0);
    totalMinutes += mins;
    totalCost += cost;
    if (l.billable) {
      billableMinutes += mins;
      billableCost += cost;
    }

    const u = byUser.get(l.userId) ?? {
      userId: l.userId,
      name: l.user.name,
      minutes: 0,
      cost: 0,
    };
    u.minutes += mins;
    u.cost += cost;
    byUser.set(l.userId, u);

    const t = byTask.get(l.taskId) ?? {
      taskId: l.taskId,
      title: l.task.title,
      minutes: 0,
      cost: 0,
    };
    t.minutes += mins;
    t.cost += cost;
    byTask.set(l.taskId, t);
  }

  return {
    range: { from, to },
    totals: {
      minutes: totalMinutes,
      cost: Number(totalCost.toFixed(2)),
      billableMinutes,
      billableCost: Number(billableCost.toFixed(2)),
      entries: logs.length,
    },
    byUser: Array.from(byUser.values()).sort((a, b) => b.minutes - a.minutes),
    byTask: Array.from(byTask.values()).sort((a, b) => b.minutes - a.minutes),
  };
}

export async function workloadReport(projectId: string, range?: DateRange) {
  const { from, to } = range ?? defaultRange();

  // For each project member + assignees, count open tasks & logged hours
  const [members, assignees, logs] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId, isActive: true },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    }),
    prisma.taskAssignee.findMany({
      where: { task: { projectId, isArchived: false } },
      include: {
        task: {
          select: { id: true, statusId: true, dueDate: true, status: { select: { isDone: true } } },
        },
      },
    }),
    prisma.timeLog.findMany({
      where: {
        task: { projectId },
        startedAt: { gte: from, lte: to },
        endedAt: { not: null },
      },
      select: { userId: true, minutes: true },
    }),
  ]);

  type Row = {
    userId: string;
    name: string;
    avatar: string | null;
    assignedOpen: number;
    assignedOverdue: number;
    loggedMinutes: number;
  };
  const rows = new Map<string, Row>();
  for (const m of members) {
    rows.set(m.userId, {
      userId: m.userId,
      name: m.user.name,
      avatar: m.user.avatar ?? null,
      assignedOpen: 0,
      assignedOverdue: 0,
      loggedMinutes: 0,
    });
  }

  const now = new Date();
  for (const a of assignees) {
    const r = rows.get(a.userId);
    if (!r) continue;
    if (!a.task.status.isDone) r.assignedOpen += 1;
    if (!a.task.status.isDone && a.task.dueDate && a.task.dueDate < now) {
      r.assignedOverdue += 1;
    }
  }
  for (const l of logs) {
    const r = rows.get(l.userId);
    if (!r) continue;
    r.loggedMinutes += l.minutes ?? 0;
  }

  return {
    range: { from, to },
    rows: Array.from(rows.values()).sort((a, b) => b.assignedOpen - a.assignedOpen),
  };
}
