import { prisma } from "@/lib/prisma";
import { CommentEntityType } from "@prisma/client";
import {
  createMentionNotifications,
  notifyProjectMembers,
  parseMentionedIds,
} from "@/lib/notifications/create";
import { canParticipateInProject, canViewProject } from "@/lib/projects/access";

/**
 * Resolve the project that owns a comment entity. Used to funnel comment
 * permission checks through the canonical project access layer.
 *  - PROJECT comments: entityId IS the project id
 *  - ESTIMATE comments: lookup estimate.projectId
 */
async function resolveCommentProjectId(
  entityType: CommentEntityType,
  entityId: string,
): Promise<string | null> {
  if (entityType === "PROJECT") {
    const p = await prisma.project.findUnique({ where: { id: entityId }, select: { id: true } });
    return p?.id ?? null;
  }
  if (entityType === "ESTIMATE") {
    const e = await prisma.estimate.findUnique({
      where: { id: entityId },
      select: { projectId: true },
    });
    return e?.projectId ?? null;
  }
  return null;
}

export const ALLOWED_REACTIONS = ["👍", "❤️", "✅", "⚠️", "💯", "👀"] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export function isAllowedReaction(emoji: string): emoji is AllowedReaction {
  return (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
}

type ReactionGroup = {
  emoji: string;
  count: number;
  users: { id: string; name: string }[];
  reactedByMe: boolean;
};

function groupReactions(
  reactions: { emoji: string; userId: string; user: { id: string; name: string } }[],
  currentUserId: string
): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    const existing = map.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      users: [],
      reactedByMe: false,
    };
    existing.count += 1;
    existing.users.push({ id: r.user.id, name: r.user.name });
    if (r.userId === currentUserId) existing.reactedByMe = true;
    map.set(r.emoji, existing);
  }
  return Array.from(map.values());
}

async function resolveMentionsMap(body: string) {
  const ids = parseMentionedIds(body);
  if (ids.length === 0) return [] as { id: string; name: string }[];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return users;
}

export async function listComments(
  entityType: CommentEntityType,
  entityId: string,
  currentUserId: string
) {
  const projectId = await resolveCommentProjectId(entityType, entityId);
  if (projectId) {
    const ok = await canViewProject(projectId, currentUserId);
    if (!ok) throw new Error("Forbidden");
  }
  const rows = await prisma.comment.findMany({
    where: { entityType, entityId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, avatar: true, role: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  const result = await Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      author: c.author,
      reactions: groupReactions(c.reactions, currentUserId),
      mentions: await resolveMentionsMap(c.body),
    }))
  );

  return result;
}

export async function postComment(
  entityType: CommentEntityType,
  entityId: string,
  authorId: string,
  body: string
) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Порожній коментар");

  // Verify entity exists
  if (entityType === "ESTIMATE") {
    const exists = await prisma.estimate.findUnique({
      where: { id: entityId },
      select: { id: true, number: true },
    });
    if (!exists) throw new Error("Кошторис не знайдено");
  } else if (entityType === "PROJECT") {
    const exists = await prisma.project.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!exists) throw new Error("Проєкт не знайдено");
  }

  // Centralized access check: posting requires active project membership
  // (CLIENT viewers cannot author internal comments).
  const projectId = await resolveCommentProjectId(entityType, entityId);
  if (projectId) {
    const allowed = await canParticipateInProject(projectId, authorId);
    if (!allowed) throw new Error("Forbidden");
  }

  const comment = await prisma.comment.create({
    data: {
      entityType,
      entityId,
      authorId,
      body: trimmed,
    },
    include: {
      author: { select: { id: true, name: true, avatar: true, role: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  await createMentionNotifications({
    body: trimmed,
    authorId,
    type: "COMMENT_MENTION",
    title:
      entityType === "PROJECT"
        ? "Вас згадано в обговоренні проєкту"
        : "Вас згадано в обговоренні кошторису",
    relatedEntity: entityType,
    relatedId: entityId,
  });

  // Broadcast to all active project members (skip those already mentioned
  // to avoid duplicate notifications). Best-effort: a notification failure
  // must not break comment creation.
  if (projectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { title: true },
      });
      const mentionedIds = parseMentionedIds(trimmed, authorId);
      await notifyProjectMembers({
        projectId,
        actorId: authorId,
        type: "PROJECT_COMMENT",
        title:
          entityType === "PROJECT"
            ? `Новий коментар у проєкті «${project?.title ?? ""}»`
            : `Новий коментар до кошторису у проєкті «${project?.title ?? ""}»`,
        body: trimmed,
        relatedEntity: entityType === "PROJECT" ? "Project" : "Estimate",
        relatedId: entityType === "PROJECT" ? projectId : entityId,
        excludeUserIds: mentionedIds,
      });
    } catch (err) {
      console.error("[comments/postComment] notifyProjectMembers failed:", err);
    }
  }

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    author: comment.author,
    reactions: groupReactions(comment.reactions, authorId),
    mentions: await resolveMentionsMap(comment.body),
  };
}

export async function deleteComment(
  commentId: string,
  currentUserId: string,
  isAdmin: boolean
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) throw new Error("Коментар не знайдено");
  if (comment.authorId !== currentUserId && !isAdmin) {
    throw new Error("Forbidden");
  }
  await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });
}

export async function toggleCommentReaction(
  commentId: string,
  userId: string,
  emoji: string
) {
  if (!isAllowedReaction(emoji)) throw new Error("Невідома реакція");

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) throw new Error("Коментар не знайдено");

  const existing = await prisma.reaction.findUnique({
    where: { uniq_comment_reaction: { commentId, userId, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({
      data: { commentId, userId, emoji },
    });
  }

  const reactions = await prisma.reaction.findMany({
    where: { commentId },
    include: { user: { select: { id: true, name: true } } },
  });

  return groupReactions(reactions, userId);
}

export async function toggleMessageReaction(
  messageId: string,
  userId: string,
  emoji: string
) {
  if (!isAllowedReaction(emoji)) throw new Error("Невідома реакція");

  // Verify the user is a participant in the message's conversation
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      conversation: {
        select: {
          participants: { where: { userId }, select: { id: true } },
        },
      },
    },
  });
  if (!message) throw new Error("Повідомлення не знайдено");
  if (message.conversation.participants.length === 0) throw new Error("Forbidden");

  const existing = await prisma.reaction.findUnique({
    where: { uniq_message_reaction: { messageId, userId, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({
      data: { messageId, userId, emoji },
    });
  }

  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    include: { user: { select: { id: true, name: true } } },
  });

  return groupReactions(reactions, userId);
}
