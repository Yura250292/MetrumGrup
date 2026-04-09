import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth-utils";

const MENTION_REGEX = /<@([a-z0-9_-]+)>/gi;

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
