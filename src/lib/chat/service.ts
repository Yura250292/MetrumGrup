import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth-utils";
import { Prisma } from "@prisma/client";
import {
  createMentionNotifications,
  notifyUsers,
  parseMentionedIds,
} from "@/lib/notifications/create";
import {
  syncProjectConversationParticipants,
  syncEstimateConversationParticipants,
} from "@/lib/chat/sync";
import { canParticipateInProject } from "@/lib/projects/access";
import { handleAiMention } from "@/lib/chat/ai-mention";
import { AI_BOT_EMAIL } from "@/lib/chat/ai-bot";

function shapeAuthor(
  a: { id: string; name: string; avatar: string | null; role: string; email: string }
) {
  return {
    id: a.id,
    name: a.name,
    avatar: a.avatar,
    role: a.role,
    isAi: a.email === AI_BOT_EMAIL,
  };
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
      users: [] as { id: string; name: string }[],
      reactedByMe: false,
    };
    existing.count += 1;
    existing.users.push({ id: r.user.id, name: r.user.name });
    if (r.userId === currentUserId) existing.reactedByMe = true;
    map.set(r.emoji, existing);
  }
  return Array.from(map.values());
}

const dmKeyOf = (a: string, b: string) => [a, b].sort().join(":");

async function assertParticipant(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw new Error("Forbidden");

  // For PROJECT/ESTIMATE conversations, also enforce project-level membership.
  // This catches the race where a user is removed from the team between
  // opening the chat and posting a message — without this they could keep
  // posting until their participant row was reaped by sync.
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      projectId: true,
      estimate: { select: { projectId: true } },
    },
  });
  if (conv) {
    const projectId =
      conv.type === "PROJECT"
        ? conv.projectId
        : conv.type === "ESTIMATE"
          ? conv.estimate?.projectId ?? null
          : null;
    if (projectId) {
      const allowed = await canParticipateInProject(projectId, userId);
      if (!allowed) throw new Error("Forbidden");
    }
  }

  return participant;
}

export async function getOrCreateDM(currentUserId: string, otherUserId: string) {
  if (currentUserId === otherUserId) {
    throw new Error("Не можна почати чат із самим собою");
  }

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, role: true, isActive: true },
  });
  if (!other || !other.isActive || !STAFF_ROLES.includes(other.role)) {
    throw new Error("Користувач недоступний для чату");
  }

  const dmKey = dmKeyOf(currentUserId, otherUserId);

  const conversation = await prisma.conversation.upsert({
    where: { dmKey },
    create: {
      type: "DM",
      dmKey,
      participants: {
        create: [{ userId: currentUserId }, { userId: otherUserId }],
      },
    },
    update: {},
  });

  return conversation;
}

export async function getOrCreateProjectChannel(projectId: string, currentUserId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) throw new Error("Проєкт не знайдено");

  // Access check — only members or SUPER_ADMIN may open the channel.
  const allowed = await canParticipateInProject(projectId, currentUserId);
  if (!allowed) throw new Error("Forbidden");

  const conversation = await prisma.conversation.upsert({
    where: { projectId },
    create: {
      type: "PROJECT",
      projectId,
      title: project.title,
    },
    update: {},
  });

  // Sync participants from ProjectMember (single source of truth).
  await syncProjectConversationParticipants(projectId);

  // Ensure SUPER_ADMIN who isn't a member but explicitly opens the channel
  // becomes a participant for this session.
  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId: currentUserId,
      },
    },
    create: { conversationId: conversation.id, userId: currentUserId },
    update: {},
  });

  return conversation;
}

export async function createGroupConversation(
  ownerId: string,
  title: string,
  participantIds: string[]
) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Назва групи не може бути порожньою");

  const uniqueIds = Array.from(new Set([ownerId, ...participantIds]));
  if (uniqueIds.length < 2) {
    throw new Error("Додайте принаймні одного учасника");
  }

  const members = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, isActive: true, role: { in: STAFF_ROLES } },
    select: { id: true },
  });
  if (members.length !== uniqueIds.length) {
    throw new Error("Деякі користувачі недоступні для чату");
  }

  return prisma.conversation.create({
    data: {
      type: "GROUP",
      title: cleanTitle,
      participants: {
        create: uniqueIds.map((userId) => ({ userId })),
      },
    },
  });
}

export async function getOrCreateEstimateChannel(estimateId: string, currentUserId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, number: true, title: true },
  });
  if (!estimate) throw new Error("Кошторис не знайдено");

  const conversation = await prisma.conversation.upsert({
    where: { estimateId },
    create: {
      type: "ESTIMATE",
      estimateId,
      title: `Кошторис ${estimate.number}`,
      participants: {
        create: [{ userId: currentUserId }],
      },
    },
    update: {},
  });

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId: currentUserId,
      },
    },
    create: { conversationId: conversation.id, userId: currentUserId },
    update: {},
  });

  return conversation;
}

export async function listConversationsForUser(userId: string) {
  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          project: { select: { id: true, title: true, slug: true } },
          estimate: {
            select: {
              id: true,
              number: true,
              title: true,
              project: { select: { id: true, title: true } },
            },
          },
          participants: {
            include: {
              user: {
                select: { id: true, name: true, avatar: true, role: true },
              },
            },
          },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              createdAt: true,
              authorId: true,
              _count: { select: { attachments: true } },
            },
          },
        },
      },
    },
  });

  const result = await Promise.all(
    memberships.map(async (m) => {
      const conv = m.conversation;
      const lastReadAt = m.lastReadAt ?? new Date(0);

      const unreadCount = await prisma.chatMessage.count({
        where: {
          conversationId: conv.id,
          deletedAt: null,
          authorId: { not: userId },
          createdAt: { gt: lastReadAt },
        },
      });

      const peer =
        conv.type === "DM"
          ? conv.participants.find((p) => p.userId !== userId)?.user ?? null
          : null;

      const lastMsg = conv.messages[0] ?? null;

      return {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        project: conv.project,
        estimate: conv.estimate,
        peer,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              body: lastMsg.body,
              createdAt: lastMsg.createdAt,
              authorId: lastMsg.authorId,
              attachmentCount: lastMsg._count.attachments,
            }
          : null,
        lastMessageAt: conv.lastMessageAt,
        unreadCount,
      };
    })
  );

  result.sort((a, b) => {
    const aT = a.lastMessageAt?.getTime() ?? 0;
    const bT = b.lastMessageAt?.getTime() ?? 0;
    return bT - aT;
  });

  return result;
}

export async function getConversation(conversationId: string, userId: string) {
  await assertParticipant(conversationId, userId);
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      estimate: {
        select: {
          id: true,
          number: true,
          title: true,
          project: { select: { id: true, title: true } },
        },
      },
      participants: {
        include: {
          user: { select: { id: true, name: true, avatar: true, role: true } },
        },
      },
    },
  });
}

export async function getMessages(
  conversationId: string,
  userId: string,
  opts: { before?: string; after?: string; limit?: number } = {}
) {
  await assertParticipant(conversationId, userId);
  const limit = opts.limit ?? 50;

  const where: Prisma.ChatMessageWhereInput = {
    conversationId,
    deletedAt: null,
  };

  if (opts.after) {
    const cursor = await prisma.chatMessage.findUnique({
      where: { id: opts.after },
      select: { createdAt: true },
    });
    if (cursor) where.createdAt = { gt: cursor.createdAt };
  } else if (opts.before) {
    const cursor = await prisma.chatMessage.findUnique({
      where: { id: opts.before },
      select: { createdAt: true },
    });
    if (cursor) where.createdAt = { lt: cursor.createdAt };
  }

  const messages = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: opts.after ? "asc" : "desc" },
    take: limit + 1,
    include: {
      author: { select: { id: true, name: true, avatar: true, role: true, email: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });

  const hasMore = messages.length > limit;
  const sliced = hasMore ? messages.slice(0, limit) : messages;
  // Always return ascending (oldest -> newest) for the UI
  const ordered = opts.after ? sliced : sliced.slice().reverse();

  const enriched = ordered.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    authorId: m.authorId,
    author: shapeAuthor(m.author),
    reactions: groupReactions(m.reactions, userId),
    attachments: m.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      size: a.size,
      mimeType: a.mimeType,
      durationMs: a.durationMs,
      transcript: a.transcript,
    })),
  }));

  return { messages: enriched, hasMore };
}

export type ChatAttachmentInput = {
  name: string;
  url: string;
  r2Key?: string;
  size: number;
  mimeType: string;
  durationMs?: number;
};

export async function postMessage(
  conversationId: string,
  userId: string,
  body: string,
  attachments: ChatAttachmentInput[] = [],
  opts: { skipAiMention?: boolean } = {}
) {
  await assertParticipant(conversationId, userId);

  const trimmed = body.trim();
  if (!trimmed && attachments.length === 0) {
    throw new Error("Порожнє повідомлення");
  }

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId,
        authorId: userId,
        body: trimmed,
        attachments: attachments.length
          ? {
              create: attachments.map((a) => ({
                name: a.name,
                url: a.url,
                r2Key: a.r2Key,
                size: a.size,
                mimeType: a.mimeType,
                durationMs: a.durationMs,
              })),
            }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true, role: true, email: true } },
        attachments: true,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  // Fire-and-forget mention notifications (do not block message return)
  await createMentionNotifications({
    body: trimmed,
    authorId: userId,
    type: "CHAT_MENTION",
    title: "Вас згадали в чаті",
    relatedEntity: "CONVERSATION",
    relatedId: conversationId,
  });

  // Notify all other participants about a regular new message (push + email
  // gated by each user's preferences). Skip users already notified via @mention
  // to avoid duplicate push.
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: userId } },
    select: { userId: true },
  });
  const mentionedIds = new Set(parseMentionedIds(trimmed, userId));
  const recipients = participants
    .map((p) => p.userId)
    .filter((id) => !mentionedIds.has(id));
  if (recipients.length > 0) {
    const authorName = message.author.name ?? "Нове повідомлення";
    const notifyBody =
      trimmed ||
      (attachments.length > 0
        ? `📎 ${attachments.length} ${attachments.length === 1 ? "файл" : "файли"}`
        : "");
    notifyUsers({
      userIds: recipients,
      actorId: userId,
      type: "CHAT_MESSAGE",
      title: `Нове повідомлення від ${authorName}`,
      body: notifyBody,
      relatedEntity: "CONVERSATION",
      relatedId: conversationId,
    }).catch((err) =>
      console.error("[chat/postMessage] notifyUsers failed:", err),
    );
  }

  // Fire-and-forget: if the message tags @ai, let the bot reply in-thread.
  // Skipped when the caller already runs AI via /ai-invoke.
  if (!opts.skipAiMention) {
    handleAiMention({
      conversationId,
      authorId: userId,
      body: trimmed,
    }).catch((err) => console.error("[chat/postMessage] handleAiMention failed:", err));
  }

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    authorId: message.authorId,
    author: shapeAuthor(message.author),
    reactions: [] as ReactionGroup[],
    attachments: message.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      size: a.size,
      mimeType: a.mimeType,
      durationMs: a.durationMs,
      transcript: a.transcript,
    })),
  };
}

export async function markRead(conversationId: string, userId: string) {
  await assertParticipant(conversationId, userId);
  return prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });
}

export async function listStaffUsers(currentUserId: string) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: STAFF_ROLES },
      id: { not: currentUserId },
    },
    select: { id: true, name: true, email: true, avatar: true, role: true },
    orderBy: { name: "asc" },
  });
}
