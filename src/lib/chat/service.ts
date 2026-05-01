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
import { canSeeAllChats } from "@/lib/chat/oversight";

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

  // Need conversation context for both branches (visibility + project gate).
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      visibility: true,
      projectId: true,
      estimate: { select: { projectId: true } },
    },
  });

  if (!participant) {
    // Public chats: any active staff user may join (auto-participant created on
    // first action by the caller — postMessage / archive / markRead).
    if (conv?.visibility === "EVERYONE") return null;
    if (await canSeeAllChats(userId)) return null;
    throw new Error("Forbidden");
  }

  // For PROJECT/ESTIMATE conversations, also enforce project-level membership.
  // This catches the race where a user is removed from the team between
  // opening the chat and posting a message — without this they could keep
  // posting until their participant row was reaped by sync.
  if (conv) {
    const projectId =
      conv.type === "PROJECT"
        ? conv.projectId
        : conv.type === "ESTIMATE"
          ? conv.estimate?.projectId ?? null
          : null;
    if (projectId) {
      const allowed = await canParticipateInProject(projectId, userId);
      if (!allowed && !(await canSeeAllChats(userId))) throw new Error("Forbidden");
    }
  }

  return participant;
}

async function ensureOversightParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId },
    update: {},
  });
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
  participantIds: string[],
  visibility: "MEMBERS" | "EVERYONE" = "MEMBERS",
) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Назва групи не може бути порожньою");

  const uniqueIds = Array.from(new Set([ownerId, ...participantIds]));

  // Public groups can be created without explicit invites — everyone sees them.
  // Private groups still require at least one other invited user.
  if (visibility === "MEMBERS" && uniqueIds.length < 2) {
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
      visibility,
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
  const hasOversight = await canSeeAllChats(userId);

  const conversationInclude = {
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
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorId: true,
        _count: { select: { attachments: true } },
      },
    },
  };

  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true, archivedAt: true },
  });
  const membershipById = new Map<
    string,
    { lastReadAt: Date | null; archivedAt: Date | null }
  >();
  for (const m of memberships) {
    membershipById.set(m.conversationId, {
      lastReadAt: m.lastReadAt,
      archivedAt: m.archivedAt,
    });
  }

  const conversations = hasOversight
    ? await prisma.conversation.findMany({ include: conversationInclude })
    : await prisma.conversation.findMany({
        where: {
          OR: [
            { id: { in: memberships.map((m) => m.conversationId) } },
            // Public groups are visible to all staff users by design.
            { visibility: "EVERYONE" },
          ],
        },
        include: conversationInclude,
      });

  const result = await Promise.all(
    conversations.map(async (conv) => {
      const membership = membershipById.get(conv.id);
      const isObserver = !membership;
      const lastReadAt = membership?.lastReadAt ?? new Date(0);

      const unreadCount = isObserver
        ? 0
        : await prisma.chatMessage.count({
            where: {
              conversationId: conv.id,
              deletedAt: null,
              authorId: { not: userId },
              createdAt: { gt: lastReadAt },
            },
          });

      const peer =
        conv.type === "DM"
          ? conv.participants.find((p) => p.userId !== userId)?.user ??
            conv.participants[0]?.user ??
            null
          : null;

      const lastMsg = conv.messages[0] ?? null;

      return {
        id: conv.id,
        type: conv.type,
        visibility: conv.visibility,
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
        isObserver,
        isArchived: Boolean(membership?.archivedAt),
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
  const conv = await prisma.conversation.findUnique({
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
  if (!conv) return null;
  const me = conv.participants.find((p) => p.userId === userId);
  return { ...conv, isArchived: Boolean(me?.archivedAt) };
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
  const participant = await assertParticipant(conversationId, userId);
  if (!participant) {
    // Oversight user joining a conversation they're not a member of —
    // upsert participant row so unread tracking and notifications work.
    await ensureOversightParticipant(conversationId, userId);
  }

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
    // New message resurfaces the chat for everyone who archived it.
    prisma.conversationParticipant.updateMany({
      where: { conversationId, archivedAt: { not: null } },
      data: { archivedAt: null },
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
  const participant = await assertParticipant(conversationId, userId);
  if (!participant) {
    // Public-chat or oversight reader without a participant row yet —
    // create one so unread tracking starts from this point onward.
    return prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
  }
  return prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });
}

export async function deleteConversation(conversationId: string) {
  const exists = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!exists) {
    throw new Error("Розмову не знайдено");
  }
  await prisma.conversation.delete({ where: { id: conversationId } });
  return { id: conversationId };
}

export async function setConversationArchived(
  conversationId: string,
  userId: string,
  archived: boolean,
) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) {
    // No participant row yet: allowed if user has oversight OR the chat is
    // public (EVERYONE). In both cases we lazily create the row so the archive
    // flag persists per user.
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { visibility: true },
    });
    const allowed =
      conv?.visibility === "EVERYONE" || (await canSeeAllChats(userId));
    if (!allowed) throw new Error("Forbidden");
    await prisma.conversationParticipant.create({
      data: {
        conversationId,
        userId,
        archivedAt: archived ? new Date() : null,
      },
    });
    return { archived };
  }
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { archivedAt: archived ? new Date() : null },
  });
  return { archived };
}

async function assertCanManageParticipants(
  conversationId: string,
  actorId: string,
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, visibility: true },
  });
  if (!conv) throw new Error("Розмову не знайдено");
  if (conv.type !== "GROUP") {
    throw new Error("Учасників можна змінювати тільки у груповому чаті");
  }
  // Public groups have an implicit member set (everyone) — explicit
  // add/remove doesn't apply. Convert to a private group first if needed.
  if (conv.visibility === "EVERYONE") {
    throw new Error(
      "Це публічна розмова — її бачать усі. Учасників не призначають вручну.",
    );
  }
  // Either an existing participant of the group, or oversight (SUPER_ADMIN).
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: actorId } },
    select: { id: true },
  });
  if (!participant && !(await canSeeAllChats(actorId))) {
    throw new Error("Forbidden");
  }
}

export async function addGroupParticipants(
  conversationId: string,
  actorId: string,
  newUserIds: string[],
) {
  await assertCanManageParticipants(conversationId, actorId);
  const uniqueIds = Array.from(new Set(newUserIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new Error("Не вибрано жодного користувача");
  }
  const eligible = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, isActive: true, role: { in: STAFF_ROLES } },
    select: { id: true },
  });
  if (eligible.length === 0) {
    throw new Error("Користувачі недоступні для чату");
  }
  await prisma.$transaction(
    eligible.map((u) =>
      prisma.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: u.id } },
        create: { conversationId, userId: u.id },
        update: { archivedAt: null },
      }),
    ),
  );
  return { added: eligible.length };
}

export async function removeGroupParticipant(
  conversationId: string,
  actorId: string,
  removeUserId: string,
) {
  await assertCanManageParticipants(conversationId, actorId);
  const remaining = await prisma.conversationParticipant.count({
    where: { conversationId },
  });
  if (remaining <= 1) {
    throw new Error(
      "Неможливо видалити останнього учасника. Видаліть розмову замість цього.",
    );
  }
  await prisma.conversationParticipant.deleteMany({
    where: { conversationId, userId: removeUserId },
  });
  return { removed: removeUserId };
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
