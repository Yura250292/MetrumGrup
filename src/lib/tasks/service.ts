import { prisma } from "@/lib/prisma";
import type { Prisma, TaskPriority } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import {
  notifyProjectMembers,
  notifyUsers,
} from "@/lib/notifications/create";
import { getProjectAccessContext } from "@/lib/projects/access";
import { getOrCreateDefaultStatus } from "./defaults";
import { isTasksEnabledForProject } from "./feature-flag";
import { buildTaskOrderBy, buildTaskWhere, type FilterSpec, type SortSpec } from "./search";
import { dispatchEvent } from "@/lib/automations/engine";
import { emit as emitRealtime } from "@/lib/realtime/sse-hub";

/**
 * Core business logic for tasks. All mutations go through here so we can
 * centralize: permission enforcement, audit, notifications, recurring task
 * spawning, and (later) real-time fanout.
 */

export class TaskError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TaskError";
  }
}

function forbid(msg = "Forbidden"): never {
  throw new TaskError(msg, 403);
}
function notFound(msg = "Not found"): never {
  throw new TaskError(msg, 404);
}
function bad(msg: string): never {
  throw new TaskError(msg, 400);
}

/**
 * Apply private-task visibility filtering to a Prisma where clause.
 * Users without canViewPrivateTasks only see: non-private tasks, tasks they
 * created, tasks they are assigned to, or tasks they watch.
 */
import type { ProjectAccessContext } from "@/lib/projects/access";

function applyTaskPrivacyScope(
  where: Prisma.TaskWhereInput,
  ctx: ProjectAccessContext,
  currentUserId: string,
): void {
  if (ctx.isSuperAdmin || ctx.member?.effective.canViewPrivateTasks) return;

  const privacyOr: Prisma.TaskWhereInput[] = [
    { isPrivate: false },
    { createdById: currentUserId },
    { assignees: { some: { userId: currentUserId } } },
    { watchers: { some: { userId: currentUserId } } },
  ];

  const existingAnd = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];
  where.AND = [...existingAnd, { OR: privacyOr }];
  // Clean up top-level OR if search was set there — it's now inside AND
  delete where.OR;
}

const TASK_DETAIL_INCLUDE = {
  status: true,
  stage: { select: { id: true, stage: true, status: true } },
  assignees: {
    include: {
      user: { select: { id: true, name: true, avatar: true, email: true } },
    },
  },
  watchers: {
    include: {
      user: { select: { id: true, name: true, avatar: true } },
    },
  },
  labels: { include: { label: true } },
  checklist: { orderBy: { position: "asc" as const } },
  createdBy: { select: { id: true, name: true, avatar: true } },
  parentTask: { select: { id: true, title: true } },
  subtasks: {
    select: {
      id: true,
      title: true,
      statusId: true,
      priority: true,
      dueDate: true,
      isArchived: true,
    },
  },
  _count: { select: { subtasks: true, outgoingDeps: true, incomingDeps: true } },
} as const;

export type TaskDetail = Prisma.TaskGetPayload<{ include: typeof TASK_DETAIL_INCLUDE }>;

async function requireTasksEnabled(projectId: string) {
  const enabled = await isTasksEnabledForProject(projectId);
  if (!enabled) {
    throw new TaskError("Tasks feature is disabled for this project", 404);
  }
}

async function assertCanView(projectId: string, userId: string) {
  const ctx = await getProjectAccessContext(projectId, userId);
  if (!ctx || !ctx.canViewTasks) forbid();
  return ctx;
}

async function assertCanCreate(projectId: string, userId: string) {
  const ctx = await getProjectAccessContext(projectId, userId);
  if (!ctx || !ctx.canCreateTasks) forbid();
  return ctx;
}

async function loadTaskWithProject(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      stageId: true,
      createdById: true,
      isPrivate: true,
      isArchived: true,
      statusId: true,
      title: true,
    },
  });
  if (!task) notFound("Задачу не знайдено");
  return task;
}

// ------- Queries -------

export type ListFilter = {
  projectId: string;
  stageId?: string;
  statusId?: string;
  assigneeId?: string;
  labelId?: string;
  priority?: TaskPriority;
  parentTaskId?: string | null;
  search?: string;
  includeArchived?: boolean;
  cursor?: string;
  take?: number;
};

export async function listTasks(filter: ListFilter, currentUserId: string) {
  await requireTasksEnabled(filter.projectId);
  const ctx = await assertCanView(filter.projectId, currentUserId);

  const where: Prisma.TaskWhereInput = {
    projectId: filter.projectId,
    isArchived: filter.includeArchived ? undefined : false,
  };

  if (filter.stageId) where.stageId = filter.stageId;
  if (filter.statusId) where.statusId = filter.statusId;
  if (filter.priority) where.priority = filter.priority;
  if (filter.parentTaskId === null) where.parentTaskId = null;
  if (typeof filter.parentTaskId === "string") where.parentTaskId = filter.parentTaskId;
  if (filter.assigneeId) {
    where.assignees = { some: { userId: filter.assigneeId } };
  }
  if (filter.labelId) {
    where.labels = { some: { labelId: filter.labelId } };
  }
  if (filter.search) {
    const searchAnd: Prisma.TaskWhereInput = {
      OR: [
        { title: { contains: filter.search, mode: "insensitive" } },
        { description: { contains: filter.search, mode: "insensitive" } },
      ],
    };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), searchAnd];
  }

  // Private tasks: shared helper
  applyTaskPrivacyScope(where, ctx, currentUserId);

  const take = Math.min(filter.take ?? 50, 200);
  const rows = await prisma.task.findMany({
    where,
    include: {
      status: true,
      assignees: {
        include: { user: { select: { id: true, name: true, avatar: true } } },
      },
      labels: { include: { label: true } },
      _count: { select: { subtasks: true, checklist: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: take + 1,
    cursor: filter.cursor ? { id: filter.cursor } : undefined,
    skip: filter.cursor ? 1 : 0,
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function getTask(taskId: string, currentUserId: string): Promise<TaskDetail> {
  const lite = await loadTaskWithProject(taskId);
  await requireTasksEnabled(lite.projectId);
  const ctx = await assertCanView(lite.projectId, currentUserId);

  // Privacy guard
  if (lite.isPrivate && !ctx.isSuperAdmin && !ctx.member?.effective.canViewPrivateTasks) {
    const ownedOrParticipant =
      lite.createdById === currentUserId ||
      (await prisma.task.count({
        where: {
          id: taskId,
          OR: [
            { assignees: { some: { userId: currentUserId } } },
            { watchers: { some: { userId: currentUserId } } },
          ],
        },
      })) > 0;
    if (!ownedOrParticipant) forbid();
  }

  const full = await prisma.task.findUnique({
    where: { id: taskId },
    include: TASK_DETAIL_INCLUDE,
  });
  if (!full) notFound();
  return full;
}

// ------- Mutations -------

export type CreateInput = {
  projectId: string;
  stageId: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  statusId?: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  estimatedHours?: number | null;
  isPrivate?: boolean;
  assigneeIds?: string[];
  labelIds?: string[];
};

export async function createTask(input: CreateInput, actorId: string): Promise<TaskDetail> {
  await requireTasksEnabled(input.projectId);
  await assertCanCreate(input.projectId, actorId);

  if (!input.title.trim()) bad("Title is required");

  // Verify stage belongs to project
  const stage = await prisma.projectStageRecord.findFirst({
    where: { id: input.stageId, projectId: input.projectId },
    select: { id: true },
  });
  if (!stage) bad("Stage does not belong to this project");

  const status = input.statusId
    ? await prisma.taskStatus.findFirst({
        where: { id: input.statusId, projectId: input.projectId },
      })
    : await getOrCreateDefaultStatus(input.projectId);
  if (!status) bad("Invalid status");

  if (input.parentTaskId) {
    const parent = await prisma.task.findFirst({
      where: { id: input.parentTaskId, projectId: input.projectId },
      select: { id: true },
    });
    if (!parent) bad("Parent task not found in this project");
  }

  // Position — next free slot within (project, status)
  const lastPos = await prisma.task.aggregate({
    where: { projectId: input.projectId, statusId: status!.id },
    _max: { position: true },
  });
  const position = (lastPos._max.position ?? -1) + 1;

  // Validate assigneeIds: each must have task access on this project
  if (input.assigneeIds && input.assigneeIds.length > 0) {
    for (const uid of input.assigneeIds) {
      const targetCtx = await getProjectAccessContext(input.projectId, uid);
      if (!targetCtx?.canViewTasks) {
        bad(`Assignee ${uid} does not have task access on this project`);
      }
    }
  }

  // Validate labelIds: each must belong to this project
  if (input.labelIds && input.labelIds.length > 0) {
    const validLabels = await prisma.taskLabel.findMany({
      where: { id: { in: input.labelIds }, projectId: input.projectId },
      select: { id: true },
    });
    const validIds = new Set(validLabels.map((l) => l.id));
    for (const lid of input.labelIds) {
      if (!validIds.has(lid)) {
        bad(`Label ${lid} does not belong to this project`);
      }
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        projectId: input.projectId,
        stageId: input.stageId,
        parentTaskId: input.parentTaskId ?? null,
        statusId: status!.id,
        title: input.title.trim(),
        description: input.description ?? null,
        priority: input.priority ?? "NORMAL",
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        estimatedHours: input.estimatedHours ?? null,
        isPrivate: input.isPrivate ?? false,
        position,
        createdById: actorId,
      },
    });

    if (input.assigneeIds && input.assigneeIds.length > 0) {
      await tx.taskAssignee.createMany({
        data: input.assigneeIds.map((userId) => ({
          taskId: created.id,
          userId,
          assignedById: actorId,
        })),
        skipDuplicates: true,
      });
    }

    if (input.labelIds && input.labelIds.length > 0) {
      await tx.taskLabelAssignment.createMany({
        data: input.labelIds.map((labelId) => ({ taskId: created.id, labelId })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  // Best-effort audit + notifications (don't block on failure)
  try {
    await auditLog({
      userId: actorId,
      action: "CREATE",
      entity: "Task",
      entityId: task.id,
      projectId: task.projectId,
      newData: { title: task.title, statusId: task.statusId, priority: task.priority },
    });
  } catch {}

  try {
    const [project, actor] = await Promise.all([
      prisma.project.findUnique({
        where: { id: task.projectId },
        select: { title: true },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      }),
    ]);
    if (input.assigneeIds && input.assigneeIds.length > 0) {
      const dueLabel = task.dueDate
        ? new Date(task.dueDate).toLocaleDateString("uk-UA", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : null;
      const subject = dueLabel
        ? `Нова задача: «${task.title}» — до ${dueLabel}`
        : `Нова задача: «${task.title}»`;
      await notifyUsers({
        userIds: input.assigneeIds,
        actorId,
        type: "TASK_ASSIGNED",
        title: `Вас призначено на задачу «${task.title}»`,
        body: project?.title ? `Проєкт: ${project.title}` : undefined,
        relatedEntity: "Task",
        relatedId: `${task.projectId}:${task.id}`,
        emailOverride: {
          kind: "task",
          subject,
          taskTitle: task.title,
          projectTitle: project?.title,
          assignerName: actor?.name,
          priority: task.priority,
          dueDate: task.dueDate,
          specificationMarkdown: task.description,
          actionLabel: "Відкрити задачу",
        },
      });
    }
  } catch (err) {
    console.error("[tasks/createTask] notify failed:", err);
  }

  // Fire automation event (best-effort)
  try {
    const taskWithStatus = await prisma.task.findUnique({
      where: { id: task.id },
      include: { status: { select: { name: true, isDone: true } } },
    });
    if (taskWithStatus) {
      await dispatchEvent({
        event: "TASK_CREATED",
        projectId: task.projectId,
        actorId,
        task: taskWithStatus,
      });
    }
  } catch (err) {
    console.error("[tasks/createTask] dispatch failed:", err);
  }

  // Notify all project members about new task (best-effort)
  try {
    await notifyTaskCreatedToProject(task.id, actorId);
  } catch (err) {
    console.error("[tasks/createTask] notifyProject failed:", err);
  }

  // Real-time broadcast
  emitRealtime(task.projectId, "task.created", { taskId: task.id, actorId });

  return getTask(task.id, actorId);
}

export type UpdateInput = Partial<{
  title: string;
  description: string | null;
  priority: TaskPriority;
  statusId: string;
  stageId: string;
  parentTaskId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  isPrivate: boolean;
  position: number;
  customFields: Record<string, unknown> | null;
}>;

export async function updateTask(
  taskId: string,
  patch: UpdateInput,
  actorId: string,
): Promise<TaskDetail> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx || !ctx.canViewTasks) forbid();

  const isOwner = existing.createdById === actorId;
  const isAssignee =
    (await prisma.taskAssignee.count({ where: { taskId, userId: actorId } })) > 0;
  const canEdit =
    ctx.canEditAnyTask ||
    ((ctx.member?.effective.canEditOwnTasks ?? false) && (isOwner || isAssignee));
  if (!canEdit) forbid();

  // Validate FK patches against project
  if (patch.statusId) {
    const status = await prisma.taskStatus.findFirst({
      where: { id: patch.statusId, projectId: existing.projectId },
      select: { id: true },
    });
    if (!status) bad("Status does not belong to this project");
  }
  if (patch.stageId) {
    const stage = await prisma.projectStageRecord.findFirst({
      where: { id: patch.stageId, projectId: existing.projectId },
      select: { id: true },
    });
    if (!stage) bad("Stage does not belong to this project");
  }
  if (patch.parentTaskId) {
    if (patch.parentTaskId === taskId) bad("Task cannot be its own parent");
    const parent = await prisma.task.findFirst({
      where: { id: patch.parentTaskId, projectId: existing.projectId },
      select: { id: true },
    });
    if (!parent) bad("Parent task not found in this project");
  }

  const data: Prisma.TaskUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.statusId !== undefined) {
    data.status = { connect: { id: patch.statusId } };
  }
  if (patch.stageId !== undefined) {
    data.stage = { connect: { id: patch.stageId } };
  }
  if (patch.parentTaskId !== undefined) {
    data.parentTask = patch.parentTaskId
      ? { connect: { id: patch.parentTaskId } }
      : { disconnect: true };
  }
  if (patch.startDate !== undefined) data.startDate = patch.startDate;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.estimatedHours !== undefined) data.estimatedHours = patch.estimatedHours;
  if (patch.isPrivate !== undefined) data.isPrivate = patch.isPrivate;
  if (patch.position !== undefined) data.position = patch.position;
  if (patch.customFields !== undefined) {
    data.customFields = (patch.customFields ?? undefined) as
      | Prisma.InputJsonValue
      | undefined;
  }

  // Completion tracking
  if (patch.statusId) {
    const newStatus = await prisma.taskStatus.findUnique({
      where: { id: patch.statusId },
      select: { isDone: true },
    });
    if (newStatus?.isDone) data.completedAt = new Date();
    else if (newStatus && newStatus.isDone === false) data.completedAt = null;
  }

  await prisma.task.update({ where: { id: taskId }, data });

  try {
    await auditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "Task",
      entityId: taskId,
      projectId: existing.projectId,
      oldData: { statusId: existing.statusId, title: existing.title },
      newData: patch,
    });
  } catch {}

  // Notify assignees & watchers on status change + fire automation
  if (patch.statusId && patch.statusId !== existing.statusId) {
    try {
      const stakeholders = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          assignees: { select: { userId: true } },
          watchers: { select: { userId: true } },
        },
      });
      if (stakeholders) {
        const userIds = [
          ...stakeholders.assignees.map((a) => a.userId),
          ...stakeholders.watchers.map((w) => w.userId),
        ];
        await notifyUsers({
          userIds,
          actorId,
          type: "TASK_STATUS_CHANGED",
          title: `Статус задачі «${stakeholders.title}» змінено`,
          relatedEntity: "Task",
          relatedId: `${existing.projectId}:${taskId}`,
        });
      }
    } catch (err) {
      console.error("[tasks/updateTask] status-notify failed:", err);
    }

    try {
      const full = await prisma.task.findUnique({
        where: { id: taskId },
        include: { status: { select: { name: true, isDone: true } } },
      });
      if (full) {
        await dispatchEvent({
          event: "TASK_STATUS_CHANGED",
          projectId: existing.projectId,
          actorId,
          task: full,
          payload: { fromStatusId: existing.statusId, toStatusId: patch.statusId },
        });
      }
    } catch (err) {
      console.error("[tasks/updateTask] dispatch failed:", err);
    }
  }

  emitRealtime(existing.projectId, "task.updated", {
    taskId,
    actorId,
    statusChanged: !!(patch.statusId && patch.statusId !== existing.statusId),
  });

  return getTask(taskId, actorId);
}

export async function archiveTask(taskId: string, actorId: string): Promise<void> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx) forbid();
  // canDelete OR canEditAnyTask OR (own task + canEditOwnTasks)
  const isOwner = existing.createdById === actorId;
  const allowed =
    ctx.canDeleteTasks ||
    ctx.canEditAnyTask ||
    (isOwner && (ctx.member?.effective.canEditOwnTasks ?? false));
  if (!allowed) forbid();

  await prisma.task.update({ where: { id: taskId }, data: { isArchived: true } });
  try {
    await auditLog({
      userId: actorId,
      action: "DELETE",
      entity: "Task",
      entityId: taskId,
      projectId: existing.projectId,
      oldData: { title: existing.title },
    });
  } catch {}
  emitRealtime(existing.projectId, "task.archived", { taskId, actorId });
}

export async function unarchiveTask(taskId: string, actorId: string): Promise<void> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx) forbid();
  const allowed = ctx.canDeleteTasks || ctx.canEditAnyTask;
  if (!allowed) forbid();

  await prisma.task.update({ where: { id: taskId }, data: { isArchived: false } });
}

// ------- Assignees / Watchers / Labels / Checklist -------

export async function addAssignee(
  taskId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx?.canAssignTasks) forbid();

  // Target user must have access to the project
  const targetCtx = await getProjectAccessContext(existing.projectId, userId);
  if (!targetCtx?.canViewTasks) bad("User does not have task access on this project");

  await prisma.taskAssignee.upsert({
    where: { taskId_userId: { taskId, userId } },
    update: {},
    create: { taskId, userId, assignedById: actorId },
  });

  try {
    await auditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "Task",
      entityId: taskId,
      projectId: existing.projectId,
      newData: { assigneeAdded: userId },
    });
  } catch {}

  try {
    const [full, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          description: true,
          priority: true,
          dueDate: true,
          project: { select: { title: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      }),
    ]);
    if (full) {
      const dueLabel = full.dueDate
        ? new Date(full.dueDate).toLocaleDateString("uk-UA", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : null;
      const subject = dueLabel
        ? `Задача «${full.title}» — до ${dueLabel}`
        : `Вас призначено на задачу «${full.title}»`;
      await notifyUsers({
        userIds: [userId],
        actorId,
        type: "TASK_ASSIGNED",
        title: `Вас призначено на задачу «${full.title}»`,
        body: full.project.title ? `Проєкт: ${full.project.title}` : undefined,
        relatedEntity: "Task",
        relatedId: `${existing.projectId}:${taskId}`,
        emailOverride: {
          kind: "task",
          subject,
          taskTitle: full.title,
          projectTitle: full.project.title,
          assignerName: actor?.name,
          priority: full.priority,
          dueDate: full.dueDate,
          specificationMarkdown: full.description,
          actionLabel: "Відкрити задачу",
        },
      });
    }
  } catch {}
}

export async function removeAssignee(
  taskId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx?.canViewTasks) forbid();

  // Self-unassign: allowed for any project member who is currently assigned.
  // Removing someone else: requires canAssignTasks.
  const isSelfUnassign = userId === actorId;
  if (!isSelfUnassign && !ctx.canAssignTasks) forbid();
  await prisma.taskAssignee
    .delete({ where: { taskId_userId: { taskId, userId } } })
    .catch(() => {});

  try {
    await auditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "Task",
      entityId: taskId,
      projectId: existing.projectId,
      oldData: { assigneeRemoved: userId },
    });
  } catch {}
}

export async function toggleWatcher(taskId: string, userId: string): Promise<boolean> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, userId);
  if (!ctx?.canViewTasks) forbid();
  const row = await prisma.taskWatcher.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  if (row) {
    await prisma.taskWatcher.delete({ where: { id: row.id } });
    return false;
  }
  await prisma.taskWatcher.create({ data: { taskId, userId } });
  return true;
}

export async function attachLabel(
  taskId: string,
  labelId: string,
  actorId: string,
): Promise<void> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx || !ctx.canViewTasks) forbid();
  const isOwner = existing.createdById === actorId;
  const canEdit =
    ctx.canEditAnyTask ||
    ((ctx.member?.effective.canEditOwnTasks ?? false) && isOwner);
  if (!canEdit) forbid();

  const label = await prisma.taskLabel.findFirst({
    where: { id: labelId, projectId: existing.projectId },
    select: { id: true },
  });
  if (!label) bad("Label does not belong to this project");

  await prisma.taskLabelAssignment.upsert({
    where: { taskId_labelId: { taskId, labelId } },
    update: {},
    create: { taskId, labelId },
  });
  try {
    await auditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "Task",
      entityId: taskId,
      projectId: existing.projectId,
      newData: { labelAttached: labelId },
    });
  } catch {}
}

export async function detachLabel(
  taskId: string,
  labelId: string,
  actorId: string,
): Promise<void> {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  const isOwner = existing.createdById === actorId;
  const canEdit =
    ctx?.canEditAnyTask ||
    (ctx?.member?.effective.canEditOwnTasks && isOwner);
  if (!canEdit) forbid();
  await prisma.taskLabelAssignment
    .delete({ where: { taskId_labelId: { taskId, labelId } } })
    .catch(() => {});
  try {
    await auditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "Task",
      entityId: taskId,
      projectId: existing.projectId,
      oldData: { labelDetached: labelId },
    });
  } catch {}
}

export type ChecklistInput = {
  content: string;
  position?: number;
  dueDate?: Date | null;
  assigneeId?: string | null;
};

export async function addChecklistItem(
  taskId: string,
  input: ChecklistInput,
  actorId: string,
) {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  const isOwner = existing.createdById === actorId;
  const canEdit =
    ctx?.canEditAnyTask ||
    (ctx?.member?.effective.canEditOwnTasks && isOwner) ||
    (await prisma.taskAssignee.count({ where: { taskId, userId: actorId } })) > 0;
  if (!canEdit) forbid();

  const content = input.content.trim();
  if (!content) bad("Checklist item content required");

  const max = await prisma.checklistItem.aggregate({
    where: { taskId },
    _max: { position: true },
  });
  const position = input.position ?? (max._max.position ?? -1) + 1;

  const created = await prisma.checklistItem.create({
    data: {
      taskId,
      content,
      position,
      dueDate: input.dueDate ?? null,
      assigneeId: input.assigneeId ?? null,
    },
  });
  try {
    await auditLog({
      userId: actorId,
      action: "CREATE",
      entity: "ChecklistItem",
      entityId: created.id,
      projectId: existing.projectId,
      newData: { taskId, content: content.slice(0, 80) },
    });
  } catch {}
  return created;
}

export async function toggleChecklistItem(
  taskId: string,
  itemId: string,
  actorId: string,
) {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx?.canViewTasks) forbid();

  // Require edit capability — read-only users must not mutate checklist
  const isOwner = existing.createdById === actorId;
  const isAssignee =
    (await prisma.taskAssignee.count({ where: { taskId, userId: actorId } })) > 0;
  const canEdit =
    ctx.canEditAnyTask ||
    ((ctx.member?.effective.canEditOwnTasks ?? false) && (isOwner || isAssignee));
  if (!canEdit) forbid();

  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, taskId },
  });
  if (!item) notFound("Checklist item not found");

  const nextDone = !item.isDone;
  return prisma.checklistItem.update({
    where: { id: item.id },
    data: {
      isDone: nextDone,
      completedAt: nextDone ? new Date() : null,
      completedById: nextDone ? actorId : null,
    },
  });
}

export async function removeChecklistItem(
  taskId: string,
  itemId: string,
  actorId: string,
) {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  const isOwner = existing.createdById === actorId;
  const canEdit =
    ctx?.canEditAnyTask ||
    (ctx?.member?.effective.canEditOwnTasks && isOwner);
  if (!canEdit) forbid();
  await prisma.checklistItem
    .delete({ where: { id: itemId } })
    .catch(() => {});
}

// ------- Broadcasts (wired into UI later via SSE) -------

// ------- Advanced query (filter DSL + sorting) -------

export async function searchTasks(
  projectId: string,
  filter: FilterSpec,
  sort: SortSpec | undefined,
  currentUserId: string,
  take = 200,
) {
  await requireTasksEnabled(projectId);
  const ctx = await assertCanView(projectId, currentUserId);

  const where = buildTaskWhere(projectId, filter);
  applyTaskPrivacyScope(where, ctx, currentUserId);

  const rows = await prisma.task.findMany({
    where,
    include: {
      status: true,
      stage: { select: { id: true, stage: true } },
      assignees: {
        include: { user: { select: { id: true, name: true, avatar: true } } },
      },
      labels: { include: { label: true } },
      _count: { select: { subtasks: true, checklist: true } },
    },
    orderBy: buildTaskOrderBy(sort),
    take: Math.min(Math.max(take, 1), 500),
  });
  return rows;
}

// ------- Bulk operations -------

export async function bulkUpdateStatus(
  projectId: string,
  taskIds: string[],
  statusId: string,
  actorId: string,
) {
  await requireTasksEnabled(projectId);
  const ctx = await getProjectAccessContext(projectId, actorId);
  if (!ctx?.canEditAnyTask) forbid();

  const status = await prisma.taskStatus.findFirst({
    where: { id: statusId, projectId },
    select: { id: true, isDone: true },
  });
  if (!status) bad("Status does not belong to this project");

  await prisma.task.updateMany({
    where: { id: { in: taskIds }, projectId },
    data: {
      statusId: status.id,
      completedAt: status.isDone ? new Date() : null,
    },
  });
}

export async function bulkArchive(
  projectId: string,
  taskIds: string[],
  actorId: string,
) {
  await requireTasksEnabled(projectId);
  const ctx = await getProjectAccessContext(projectId, actorId);
  if (!ctx?.canDeleteTasks && !ctx?.canEditAnyTask) forbid();
  await prisma.task.updateMany({
    where: { id: { in: taskIds }, projectId },
    data: { isArchived: true },
  });
}

export async function bulkAssign(
  projectId: string,
  taskIds: string[],
  userId: string,
  actorId: string,
) {
  await requireTasksEnabled(projectId);
  const ctx = await getProjectAccessContext(projectId, actorId);
  if (!ctx?.canAssignTasks) forbid();

  // Ensure target user has task access on this project
  const targetCtx = await getProjectAccessContext(projectId, userId);
  if (!targetCtx?.canViewTasks) bad("User does not have task access");

  const existing = await prisma.taskAssignee.findMany({
    where: { taskId: { in: taskIds }, userId },
    select: { taskId: true },
  });
  const existingIds = new Set(existing.map((e) => e.taskId));
  const newRows = taskIds
    .filter((id) => !existingIds.has(id))
    .map((taskId) => ({ taskId, userId, assignedById: actorId }));

  if (newRows.length > 0) {
    await prisma.taskAssignee.createMany({ data: newRows, skipDuplicates: true });
  }
}

// ------- Kanban drag reorder (position update) -------

export async function reorderTask(
  taskId: string,
  newStatusId: string,
  newPosition: number,
  actorId: string,
) {
  const existing = await loadTaskWithProject(taskId);
  await requireTasksEnabled(existing.projectId);
  const ctx = await getProjectAccessContext(existing.projectId, actorId);
  if (!ctx?.canViewTasks) forbid();

  const isOwner = existing.createdById === actorId;
  const isAssignee =
    (await prisma.taskAssignee.count({ where: { taskId, userId: actorId } })) > 0;
  const canEdit =
    ctx.canEditAnyTask ||
    ((ctx.member?.effective.canEditOwnTasks ?? false) && (isOwner || isAssignee));
  if (!canEdit) forbid();

  const status = await prisma.taskStatus.findFirst({
    where: { id: newStatusId, projectId: existing.projectId },
    select: { id: true, isDone: true },
  });
  if (!status) bad("Invalid status");

  await prisma.$transaction(async (tx) => {
    // Get all tasks in the target column, ordered by position
    const columnTasks = await tx.task.findMany({
      where: {
        projectId: existing.projectId,
        statusId: newStatusId,
        id: { not: taskId }, // exclude the moving task
      },
      select: { id: true, position: true },
      orderBy: { position: "asc" },
    });

    // Insert the moving task at newPosition and reindex the entire column
    const clampedPos = Math.max(0, Math.min(newPosition, columnTasks.length));
    const reordered = [
      ...columnTasks.slice(0, clampedPos),
      { id: taskId, position: -1 }, // placeholder
      ...columnTasks.slice(clampedPos),
    ];

    // Batch-update positions for all tasks in the column
    for (let i = 0; i < reordered.length; i++) {
      const t = reordered[i]!;
      if (t.id === taskId) {
        await tx.task.update({
          where: { id: taskId },
          data: {
            statusId: newStatusId,
            position: i,
            completedAt:
              existing.statusId === newStatusId
                ? undefined
                : status.isDone
                  ? new Date()
                  : null,
          },
        });
      } else if (t.position !== i) {
        await tx.task.update({
          where: { id: t.id },
          data: { position: i },
        });
      }
    }

    // If moving between columns, reindex the old column to close the gap
    if (existing.statusId !== newStatusId) {
      const oldColumnTasks = await tx.task.findMany({
        where: {
          projectId: existing.projectId,
          statusId: existing.statusId,
          id: { not: taskId },
        },
        select: { id: true, position: true },
        orderBy: { position: "asc" },
      });
      for (let i = 0; i < oldColumnTasks.length; i++) {
        if (oldColumnTasks[i]!.position !== i) {
          await tx.task.update({
            where: { id: oldColumnTasks[i]!.id },
            data: { position: i },
          });
        }
      }
    }
  });
}

export async function notifyTaskCreatedToProject(taskId: string, actorId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true, project: { select: { title: true } } },
  });
  if (!task) return;
  try {
    await notifyProjectMembers({
      projectId: task.projectId,
      actorId,
      type: "TASK_CREATED",
      title: `Нова задача «${task.title}» у проєкті «${task.project.title}»`,
      relatedEntity: "Task",
      relatedId: `${task.projectId}:${task.id}`,
    });
  } catch {}
}
