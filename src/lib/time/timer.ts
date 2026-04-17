import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { emit as emitRealtime } from "@/lib/realtime/sse-hub";
import { resolveUserRateAt } from "./rates";

/**
 * Timer lifecycle — start/stop with single-active invariant per user.
 * Uses DB-level uniqueness check (count of endedAt=null rows per user)
 * rather than a DB constraint to avoid a partial-unique-index migration.
 */

export class TimerError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TimerError";
  }
}

async function loadTaskProject(taskId: string) {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, isArchived: true },
  });
  if (!t) throw new TimerError("Task not found", 404);
  if (t.isArchived) throw new TimerError("Task is archived", 400);
  return t;
}

async function assertCanLogTime(projectId: string, userId: string) {
  const enabled = await isTasksEnabledForProject(projectId);
  if (!enabled) throw new TimerError("Tasks feature disabled", 404);
  const ctx = await getProjectAccessContext(projectId, userId);
  if (!ctx?.canLogTime) throw new TimerError("Forbidden", 403);
}

export async function getActiveTimer(userId: string) {
  return prisma.timeLog.findFirst({
    where: { userId, endedAt: null },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function startTimer(opts: {
  userId: string;
  taskId: string;
  description?: string;
  billable?: boolean;
}) {
  const task = await loadTaskProject(opts.taskId);
  await assertCanLogTime(task.projectId, opts.userId);

  // Stop any active timer for this user first
  const active = await getActiveTimer(opts.userId);
  if (active) {
    await stopTimer({ userId: opts.userId });
  }

  const created = await prisma.timeLog.create({
    data: {
      taskId: opts.taskId,
      userId: opts.userId,
      startedAt: new Date(),
      description: opts.description ?? null,
      billable: opts.billable ?? true,
    },
    include: {
      task: { select: { id: true, title: true, projectId: true } },
    },
  });
  emitRealtime(task.projectId, "timer.started", {
    taskId: opts.taskId,
    userId: opts.userId,
  });
  try {
    await auditLog({
      userId: opts.userId,
      action: "CREATE",
      entity: "TimeLog",
      entityId: created.id,
      projectId: task.projectId,
      newData: { taskId: opts.taskId, startedAt: created.startedAt },
    });
  } catch {}
  return created;
}

export async function stopTimer(opts: {
  userId: string;
  logId?: string;
  description?: string;
}) {
  const where = opts.logId
    ? { id: opts.logId, userId: opts.userId, endedAt: null }
    : { userId: opts.userId, endedAt: null };

  const active = await prisma.timeLog.findFirst({
    where,
    include: {
      task: { select: { id: true, projectId: true } },
    },
  });
  if (!active) return null;

  const endedAt = new Date();
  const minutes = Math.max(
    1,
    Math.round((endedAt.getTime() - active.startedAt.getTime()) / 60000),
  );

  // Snapshot the rate at stop time
  const resolved = await resolveUserRateAt(
    active.userId,
    active.task.projectId,
    endedAt,
  );
  const cost = resolved
    ? Number(((minutes / 60) * resolved.rate).toFixed(2))
    : null;

  const updated = await prisma.timeLog.update({
    where: { id: active.id },
    data: {
      endedAt,
      minutes,
      hourlyRateSnapshot: resolved?.rate ?? null,
      costSnapshot: cost,
      description: opts.description ?? active.description,
    },
    include: {
      task: { select: { id: true, title: true, projectId: true } },
    },
  });
  emitRealtime(active.task.projectId, "timer.stopped", {
    taskId: active.taskId,
    userId: active.userId,
    minutes,
  });
  try {
    await auditLog({
      userId: active.userId,
      action: "UPDATE",
      entity: "TimeLog",
      entityId: active.id,
      projectId: active.task.projectId,
      newData: { minutes, cost: cost ?? null },
    });
  } catch {}
  return updated;
}

/**
 * Create a manual time log entry (no timer — e.g. past date).
 * Snapshots the rate at endedAt.
 */
export async function createManualLog(opts: {
  userId: string;
  taskId: string;
  startedAt: Date;
  endedAt: Date;
  description?: string;
  billable?: boolean;
  actorId: string;
}) {
  const task = await loadTaskProject(opts.taskId);
  await assertCanLogTime(task.projectId, opts.actorId);

  if (opts.userId !== opts.actorId) {
    // Only users with canEditOthersTime can log for another user
    const ctx = await getProjectAccessContext(task.projectId, opts.actorId);
    if (!ctx?.member?.effective.canEditOthersTime && !ctx?.isSuperAdmin) {
      throw new TimerError("Forbidden", 403);
    }
  }

  if (opts.endedAt <= opts.startedAt) {
    throw new TimerError("endedAt must be after startedAt", 400);
  }

  const minutes = Math.max(
    1,
    Math.round((opts.endedAt.getTime() - opts.startedAt.getTime()) / 60000),
  );
  const resolved = await resolveUserRateAt(
    opts.userId,
    task.projectId,
    opts.endedAt,
  );
  const cost = resolved
    ? Number(((minutes / 60) * resolved.rate).toFixed(2))
    : null;

  const created = await prisma.timeLog.create({
    data: {
      taskId: opts.taskId,
      userId: opts.userId,
      startedAt: opts.startedAt,
      endedAt: opts.endedAt,
      minutes,
      description: opts.description ?? null,
      billable: opts.billable ?? true,
      hourlyRateSnapshot: resolved?.rate ?? null,
      costSnapshot: cost,
    },
  });

  // Audit log (parity with start/stop)
  try {
    await auditLog({
      userId: opts.actorId,
      action: "CREATE",
      entity: "TimeLog",
      entityId: created.id,
      projectId: task.projectId,
      newData: { taskId: opts.taskId, userId: opts.userId, minutes, manual: true },
    });
  } catch {}

  // Real-time broadcast
  emitRealtime(task.projectId, "timelog.created", {
    taskId: opts.taskId,
    userId: opts.userId,
    minutes,
    manual: true,
  });

  return created;
}

export async function deleteLog(opts: { logId: string; actorId: string }) {
  const log = await prisma.timeLog.findUnique({
    where: { id: opts.logId },
    include: { task: { select: { projectId: true } } },
  });
  if (!log) throw new TimerError("Log not found", 404);

  if (log.userId !== opts.actorId) {
    const ctx = await getProjectAccessContext(log.task.projectId, opts.actorId);
    if (!ctx?.member?.effective.canEditOthersTime && !ctx?.isSuperAdmin) {
      throw new TimerError("Forbidden", 403);
    }
  }

  await prisma.timeLog.delete({ where: { id: log.id } });
}

export async function approveLog(opts: { logId: string; actorId: string }) {
  const log = await prisma.timeLog.findUnique({
    where: { id: opts.logId },
    include: { task: { select: { projectId: true } } },
  });
  if (!log) throw new TimerError("Log not found", 404);
  const ctx = await getProjectAccessContext(log.task.projectId, opts.actorId);
  if (!ctx?.member?.effective.canEditOthersTime && !ctx?.isSuperAdmin) {
    throw new TimerError("Forbidden", 403);
  }
  return prisma.timeLog.update({
    where: { id: log.id },
    data: { approvedAt: new Date(), approvedById: opts.actorId },
  });
}

export async function listTaskLogs(taskId: string, currentUserId: string) {
  const task = await loadTaskProject(taskId);
  const ctx = await getProjectAccessContext(task.projectId, currentUserId);
  if (!ctx?.canViewTasks) throw new TimerError("Forbidden", 403);

  // Require canViewTimeReports to see time logs at all
  if (!ctx.canViewTimeReports && !ctx.isSuperAdmin) {
    throw new TimerError("Forbidden", 403);
  }

  const rows = await prisma.timeLog.findMany({
    where: { taskId },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  // Strip cost data unless user has canViewCostReports
  const canSeeCosts = ctx.canViewCostReports || ctx.isSuperAdmin;
  if (!canSeeCosts) {
    return rows.map((row) => ({
      ...row,
      hourlyRateSnapshot: null,
      costSnapshot: null,
    }));
  }

  return rows;
}

export async function listUserLogs(opts: {
  userId: string;
  from?: Date;
  to?: Date;
  take?: number;
}) {
  return prisma.timeLog.findMany({
    where: {
      userId: opts.userId,
      ...(opts.from || opts.to
        ? {
            startedAt: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: opts.take ?? 100,
  });
}
