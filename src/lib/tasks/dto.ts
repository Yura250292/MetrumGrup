import type { ProjectAccessContext } from "@/lib/projects/access";

/**
 * Server-side DTO mappers for task, time-log, and comment responses.
 *
 * All route handlers should pipe raw Prisma objects through these mappers
 * before returning JSON. This:
 *   - enforces a stable response shape
 *   - handles role-aware field masking in one place
 *   - prevents raw DB columns from leaking to the client
 */

// ─── Task DTOs ──────────────────────────────────

export type TaskListDTO = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  position: number;
  isPrivate: boolean;
  isArchived: boolean;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  completedAt: string | null;
  createdAt: string;
  status: { id: string; name: string; color: string | null; isDone: boolean };
  assignees: { id: string; name: string; avatar: string | null }[];
  labels: { id: string; name: string; color: string | null }[];
  _count: { subtasks: number; checklist: number };
};

export function toTaskListDTO(row: Record<string, unknown>): TaskListDTO {
  const r = row as any;
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    priority: r.priority,
    position: r.position ?? 0,
    isPrivate: r.isPrivate ?? false,
    isArchived: r.isArchived ?? false,
    startDate: r.startDate ? new Date(r.startDate).toISOString() : null,
    dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
    estimatedHours: r.estimatedHours ?? null,
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
    status: {
      id: r.status?.id,
      name: r.status?.name,
      color: r.status?.color ?? null,
      isDone: r.status?.isDone ?? false,
    },
    assignees: (r.assignees ?? []).map((a: any) => ({
      id: a.user?.id ?? a.userId,
      name: a.user?.name ?? "",
      avatar: a.user?.avatar ?? null,
    })),
    labels: (r.labels ?? []).map((l: any) => ({
      id: l.label?.id ?? l.labelId,
      name: l.label?.name ?? "",
      color: l.label?.color ?? null,
    })),
    _count: {
      subtasks: r._count?.subtasks ?? 0,
      checklist: r._count?.checklist ?? 0,
    },
  };
}

export type TaskDetailDTO = TaskListDTO & {
  stageId: string;
  parentTaskId: string | null;
  parentTask: { id: string; title: string } | null;
  subtasks: { id: string; title: string; statusId: string; priority: string }[];
  checklist: {
    id: string;
    content: string;
    isDone: boolean;
    position: number;
    dueDate: string | null;
    assigneeId: string | null;
  }[];
  watchers: { id: string; name: string; avatar: string | null }[];
  createdBy: { id: string; name: string; avatar: string | null } | null;
  customFields: Record<string, unknown> | null;
};

export function toTaskDetailDTO(row: Record<string, unknown>): TaskDetailDTO {
  const base = toTaskListDTO(row);
  const r = row as any;
  return {
    ...base,
    stageId: r.stageId,
    parentTaskId: r.parentTaskId ?? null,
    parentTask: r.parentTask ?? null,
    subtasks: (r.subtasks ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      statusId: s.statusId,
      priority: s.priority,
    })),
    checklist: (r.checklist ?? []).map((c: any) => ({
      id: c.id,
      content: c.content,
      isDone: c.isDone,
      position: c.position,
      dueDate: c.dueDate ? new Date(c.dueDate).toISOString() : null,
      assigneeId: c.assigneeId ?? null,
    })),
    watchers: (r.watchers ?? []).map((w: any) => ({
      id: w.user?.id ?? w.userId,
      name: w.user?.name ?? "",
      avatar: w.user?.avatar ?? null,
    })),
    createdBy: r.createdBy ?? null,
    customFields: r.customFields && typeof r.customFields === "object"
      ? (r.customFields as Record<string, unknown>)
      : null,
  };
}

// ─── Time Log DTOs ──────────────────────────────

export type TimeLogDTO = {
  id: string;
  taskId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  description: string | null;
  billable: boolean;
  approvedAt: string | null;
  hourlyRateSnapshot: number | null;
  costSnapshot: number | null;
  user: { id: string; name: string; avatar: string | null } | null;
  approvedBy: { id: string; name: string } | null;
};

export function toTimeLogDTO(
  row: Record<string, unknown>,
  ctx: ProjectAccessContext,
): TimeLogDTO {
  const r = row as any;
  const canSeeCosts = ctx.canViewCostReports || ctx.isSuperAdmin;
  return {
    id: r.id,
    taskId: r.taskId,
    userId: r.userId,
    startedAt: new Date(r.startedAt).toISOString(),
    endedAt: r.endedAt ? new Date(r.endedAt).toISOString() : null,
    minutes: r.minutes ?? null,
    description: r.description ?? null,
    billable: r.billable ?? true,
    approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
    hourlyRateSnapshot: canSeeCosts ? (r.hourlyRateSnapshot ?? null) : null,
    costSnapshot: canSeeCosts ? (r.costSnapshot ?? null) : null,
    user: r.user ?? null,
    approvedBy: r.approvedBy ?? null,
  };
}

// ─── Comment DTOs ──────────────────────────────

export type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: { id: string; name: string; avatar: string | null; role: string };
  reactions: {
    emoji: string;
    count: number;
    users: { id: string; name: string }[];
    reactedByMe: boolean;
  }[];
  mentions: { id: string; name: string }[];
};

export function toCommentDTO(row: Record<string, unknown>): CommentDTO {
  const r = row as any;
  return {
    id: r.id,
    body: r.body,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(r.createdAt).toISOString(),
    editedAt: r.editedAt
      ? (typeof r.editedAt === "string" ? r.editedAt : new Date(r.editedAt).toISOString())
      : null,
    author: r.author ?? { id: "", name: "", avatar: null, role: "" },
    reactions: r.reactions ?? [],
    mentions: r.mentions ?? [],
  };
}
