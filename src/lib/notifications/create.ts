import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth-utils";
import { listActiveMembers } from "@/lib/projects/members-service";
import { notificationTypeToCategory } from "./categories";
import { getBatchUserPrefs, shouldDeliver, isQuietHours } from "./preferences";
import { sendPush } from "./push";
import { sendNotificationEmail } from "./email";
import { relatedEntityLink } from "./links";

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
  | "TASK_CREATED"
  | "CHAT_MESSAGE";

type NotificationRow = {
  userId: string;
  type: string;
  title: string;
  body: string | null;
  relatedEntity: string;
  relatedId: string;
};

/**
 * Dispatch push and email notifications based on user preferences.
 * Fire-and-forget: never throws, never blocks the caller.
 */
async function dispatchExtraChannels(notifications: NotificationRow[]): Promise<void> {
  try {
    const userIds = [...new Set(notifications.map((n) => n.userId))];
    const userPrefsMap = await getBatchUserPrefs(userIds);
    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";

    const promises: Promise<void>[] = [];

    for (const n of notifications) {
      const userInfo = userPrefsMap.get(n.userId);
      if (!userInfo) continue;

      const category = notificationTypeToCategory(n.type);
      if (isQuietHours(userInfo.prefs, userInfo.timezone)) continue;

      const url = relatedEntityLink({
        relatedEntity: n.relatedEntity,
        relatedId: n.relatedId,
      });

      // Push
      if (shouldDeliver(userInfo.prefs, category, "push")) {
        promises.push(
          sendPush(n.userId, {
            title: n.title,
            body: n.body || undefined,
            url,
          }).catch((err) => console.error("[Dispatch] Push error:", err)),
        );
      }

      // Email
      if (shouldDeliver(userInfo.prefs, category, "email")) {
        promises.push(
          sendNotificationEmail({
            to: userInfo.email,
            subject: n.title,
            body: n.body || "",
            actionUrl: baseUrl + url,
          }).catch((err) => console.error("[Dispatch] Email error:", err)),
        );
      }
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.error("[Dispatch] Unexpected error:", err);
  }
}

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

  const data: NotificationRow[] = validIds.map((userId) => ({
    userId,
    type: opts.type,
    title: opts.title,
    body: preview,
    relatedEntity: opts.relatedEntity,
    relatedId: opts.relatedId,
  }));

  await prisma.notification.createMany({ data });

  // Fire-and-forget: push + email dispatch
  dispatchExtraChannels(data).catch(() => {});

  return validIds.length;
}

/**
 * Create Notification rows for a specific set of user IDs (skipping the actor).
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

  const data: NotificationRow[] = targets.map((userId) => ({
    userId,
    type: opts.type,
    title: opts.title,
    body: preview,
    relatedEntity: opts.relatedEntity,
    relatedId: opts.relatedId,
  }));

  await prisma.notification.createMany({ data });

  // Fire-and-forget: push + email dispatch
  dispatchExtraChannels(data).catch(() => {});

  return targets.length;
}

/**
 * Broadcast a Notification to every active member of a project,
 * skipping the actor.
 */
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

  const data: NotificationRow[] = recipients.map((userId) => ({
    userId,
    type: opts.type,
    title: opts.title,
    body: preview,
    relatedEntity: opts.relatedEntity,
    relatedId: opts.relatedId,
  }));

  await prisma.notification.createMany({ data });

  // Fire-and-forget: push + email dispatch
  dispatchExtraChannels(data).catch(() => {});

  return recipients.length;
}
