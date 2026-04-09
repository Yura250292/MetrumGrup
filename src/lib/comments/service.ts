import { prisma } from "@/lib/prisma";
import { CommentEntityType } from "@prisma/client";
import { createMentionNotifications, parseMentionedIds } from "@/lib/notifications/create";

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
