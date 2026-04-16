import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth-utils";
import { listActiveMembers } from "@/lib/projects/members-service";

const MENTION_REGEX = /<@([a-z0-9_-]+)>/gi;

export type ProjectNotificationType =
  | "PROJECT_UPDATED"
  | "PROJECT_FILE_ADDED"
  | "PROJECT_PHOTO_REPORT"
  | "PROJECT_ESTIMATE_CREATED"
  | "PROJECT_ESTIMATE_APPROVED"
  | "PROJECT_MEMBER_ADDED"
  | "PROJECT_COMMENT"
  | "TASK_ASSIGNED"
  | "TASK_COMMENTED"
  | "TASK_STATUS_CHANGED"
  | "TASK_DUE_SOON"
  | "TASK_CREATED";

/**
 * Parse <@userId> tags from a body of text and return unique userIds
 * (excluding a given author).
 */
export function parseMentionedIds(body: string, excludeUserId?: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_REGEX)) {
    const id = match[1];
    if (id && id !== excludeUserId) ids.add(id);
  }
  return Array.from(ids);
}

/**
 * Filter mentioned IDs to only active staff users.
 */
export async function filterValidStaffIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: ids },
      isActive: true,
      role: { in: STAFF_ROLES },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Create Notification rows for a list of mentioned staff users.
 * Silently filters out invalid IDs and the author.
 */
export async function createMentionNotifications(opts: {
  body: string;
  authorId: string;
  type: "COMMENT_MENTION" | "CHAT_MENTION";
  title: string;
  relatedEntity: string;
  relatedId: string;
}): Promise<number> {
  const candidateIds = parseMentionedIds(opts.body, opts.authorId);
  const validIds = await filterValidStaffIds(candidateIds);
  if (validIds.length === 0) return 0;

  const preview = opts.body.replace(MENTION_REGEX, "@…").trim().slice(0, 120);

  await prisma.notification.createMany({
    data: validIds.map((userId) => ({
      userId,
      type: opts.type,
      title: opts.title,
      body: preview,
      relatedEntity: opts.relatedEntity,
      relatedId: opts.relatedId,
    })),
  });

  return validIds.length;
}

/**
 * Broadcast a Notification row to every active member of a project,
 * skipping the actor (the user who caused the change). Used for
 * project-change events: status updates, file uploads, photo reports,
 * estimates, member changes, comments.
 *
 * Best-effort: callers should wrap in try/catch so a notification
 * failure does not break the parent write operation.
 */
/**
 * Create Notification rows for a specific set of user IDs (skipping the actor).
 * Useful for task assignments, mentions, due-date reminders — any case where
 * we want targeted delivery rather than broadcasting to all project members.
 */
export async function notifyUsers(opts: {
  userIds: string[];
  actorId: string;
  type: ProjectNotificationType;
  title: string;
  body?: string;
  relatedEntity: string;
  relatedId: string;
}): Promise<number> {
  const targets = Array.from(
    new Set(opts.userIds.filter((id) => id && id !== opts.actorId)),
  );
  if (targets.length === 0) return 0;

  const preview = opts.body
    ? opts.body.replace(MENTION_REGEX, "@…").trim().slice(0, 160)
    : null;

  await prisma.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: opts.type,
      title: opts.title,
      body: preview,
      relatedEntity: opts.relatedEntity,
      relatedId: opts.relatedId,
    })),
  });

  return targets.length;
}

export async function notifyProjectMembers(opts: {
  projectId: string;
  actorId: string;
  type: ProjectNotificationType;
  title: string;
  body?: string;
  relatedEntity: string;
  relatedId: string;
  excludeUserIds?: string[];
}): Promise<number> {
  const members = await listActiveMembers(opts.projectId);
  const exclude = new Set<string>([opts.actorId, ...(opts.excludeUserIds ?? [])]);
  const recipients = members
    .map((m) => m.user.id)
    .filter((id) => !exclude.has(id));
  if (recipients.length === 0) return 0;

  const preview = opts.body ? opts.body.replace(MENTION_REGEX, "@…").trim().slice(0, 160) : null;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: opts.type,
      title: opts.title,
      body: preview,
      relatedEntity: opts.relatedEntity,
      relatedId: opts.relatedId,
    })),
  });

  return recipients.length;
}
