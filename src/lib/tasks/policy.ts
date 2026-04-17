import { prisma } from "@/lib/prisma";
import {
  getProjectAccessContext,
  type ProjectAccessContext,
} from "@/lib/projects/access";
import type { Prisma } from "@prisma/client";

/**
 * Centralized task mutation policy helpers.
 *
 * Every task mutation should route its permission check through one of these
 * functions. This avoids drift between create/update/checklist/time/comments
 * paths and keeps the rules in one auditable place.
 */

export class PolicyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

function forbid(msg = "Forbidden"): never {
  throw new PolicyError(msg, 403);
}

type TaskLite = {
  id: string;
  projectId: string;
  createdById: string;
};

async function isAssignee(taskId: string, userId: string): Promise<boolean> {
  return (
    (await prisma.taskAssignee.count({ where: { taskId, userId } })) > 0
  );
}

// ──────────────────────────────────────────────
// Assertions — throw PolicyError on failure
// ──────────────────────────────────────────────

/**
 * User can edit the task: canEditAnyTask, or (isOwner/isAssignee + canEditOwnTasks).
 */
export async function assertCanEditTask(
  task: TaskLite,
  actorId: string,
  ctx?: ProjectAccessContext | null,
): Promise<ProjectAccessContext> {
  const resolved = ctx ?? (await getProjectAccessContext(task.projectId, actorId));
  if (!resolved?.canViewTasks) forbid();

  const isOwner = task.createdById === actorId;
  const assigned = await isAssignee(task.id, actorId);
  const canEdit =
    resolved.canEditAnyTask ||
    ((resolved.member?.effective.canEditOwnTasks ?? false) && (isOwner || assigned));
  if (!canEdit) forbid();
  return resolved;
}

/**
 * User can assign/unassign users on a task.
 */
export async function assertCanAssignUsers(
  task: TaskLite,
  actorId: string,
  ctx?: ProjectAccessContext | null,
): Promise<ProjectAccessContext> {
  const resolved = ctx ?? (await getProjectAccessContext(task.projectId, actorId));
  if (!resolved?.canAssignTasks) forbid();
  return resolved;
}

/**
 * User can mutate checklist items (add/toggle/remove).
 * Allowed: canEditAnyTask, or (isOwner/isAssignee + canEditOwnTasks).
 */
export async function assertCanMutateChecklist(
  task: TaskLite,
  actorId: string,
  ctx?: ProjectAccessContext | null,
): Promise<ProjectAccessContext> {
  return assertCanEditTask(task, actorId, ctx);
}

/**
 * User can view task time logs.
 * Requires canViewTasks + canViewTimeReports.
 */
export async function assertCanViewTaskLogs(
  task: TaskLite,
  actorId: string,
  ctx?: ProjectAccessContext | null,
): Promise<ProjectAccessContext> {
  const resolved = ctx ?? (await getProjectAccessContext(task.projectId, actorId));
  if (!resolved?.canViewTasks) forbid();
  if (!resolved.canViewTimeReports && !resolved.isSuperAdmin) forbid();
  return resolved;
}

/**
 * User can view cost data (hourlyRateSnapshot, costSnapshot).
 * Requires canViewCostReports or isSuperAdmin.
 */
export function canViewTaskCosts(ctx: ProjectAccessContext): boolean {
  return ctx.canViewCostReports || ctx.isSuperAdmin;
}

/**
 * Apply private-task visibility filtering to a Prisma where clause.
 * Users without canViewPrivateTasks only see: non-private tasks, tasks they
 * created, tasks they are assigned to, or tasks they watch.
 */
export function applyTaskPrivacyScope(
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
  delete where.OR;
}
