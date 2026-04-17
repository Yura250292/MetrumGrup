import { prisma } from "@/lib/prisma";
import { CommentEntityType } from "@prisma/client";
import {
  createMentionNotifications,
  notifyProjectMembers,
  notifyUsers,
  parseMentionedIds,
} from "@/lib/notifications/create";
import {
  canParticipateInProject,
  canViewProject,
  getProjectAccessContext,
} from "@/lib/projects/access";

/**
 * Resolve the project that owns a comment entity. Used to funnel comment
 * permission checks through the canonical project access layer.
 *  - PROJECT comments: entityId IS the project id
 *  - ESTIMATE comments: lookup estimate.projectId
 *  - TASK comments: lookup task.projectId
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
  if (entityType === "TASK") {
    const t = await prisma.task.findUnique({
      where: { id: entityId },
      select: { projectId: true },
    });
    return t?.projectId ?? null;
  }
  return null;
}

/**
 * For TASK comments, enforce private-task visibility.
 * Users without canViewPrivateTasks can only access comments on a private task
 * if they created, are assigned to, or are watching it.
 */
async function assertTaskCommentAccess(
  taskId: string,
  userId: string,
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { isPrivate: true, projectId: true, createdById: true },
  });
  if (!task) throw new Error("Задачу не знайдено");
  if (!task.isPrivate) return;

  const ctx = await getProjectAccessContext(task.projectId, userId);
  if (ctx?.isSuperAdmin || ctx?.member?.effective.canViewPrivateTasks) return;

  const isOwner = task.createdById === userId;
  if (isOwner) return;

  const isAssigned =
    (await prisma.taskAssignee.count({ where: { taskId, userId } })) > 0;
  if (isAssigned) return;

  const isWatcher =
    (await prisma.taskWatcher.count({ where: { taskId, userId } })) > 0;
  if (isWatcher) return;

  throw new Error("Forbidden");
}

/**
 * Collect task stakeholders (creator, assignees, watchers) for targeted
 * notifications — aligned with Worksection's subscriber model.
 */
async function getTaskStakeholderIds(taskId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      createdById: true,
      assignees: { select: { userId: true } },
      watchers: { select: { userId: true } },
    },
  });
  if (!task) return [];
  const ids = new Set<string>();
  if (task.createdById) ids.add(task.createdById);
  for (const a of task.assignees) ids.add(a.userId);
  for (const w of task.watchers) ids.add(w.userId);
  return Array.from(ids);
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
  // Enforce private-task visibility on top of project-level access
  if (entityType === "TASK") {
    await assertTaskCommentAccess(entityId, currentUserId);
  }
  const rows = await prisma.comment.findMany({
    where: { entityType, entityId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, avatar: true, role: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
      attachments: {
        select: { id: true, name: true, url: true, size: true, mimeType: true },
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
      attachments: c.attachments,
    }))
  );

  return result;
}

export type AttachmentInput = {
  name: string;
  url: string;
  r2Key?: string;
  size: number;
  mimeType: string;
};

export async function postComment(
  entityType: CommentEntityType,
  entityId: string,
  authorId: string,
  body: string,
  attachments?: AttachmentInput[],
) {
  const trimmed = body.trim();
  if (!trimmed && (!attachments || attachments.length === 0)) {
    throw new Error("��орожній коментар");
  }

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
  } else if (entityType === "TASK") {
    const exists = await prisma.task.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!exists) throw new Error("Задачу не знайдено");
  }

  // Centralized access check: posting requires active project membership
  // (CLIENT viewers cannot author internal comments).
  const projectId = await resolveCommentProjectId(entityType, entityId);
  if (projectId) {
    const allowed = await canParticipateInProject(projectId, authorId);
    if (!allowed) throw new Error("Forbidden");
  }
  // Enforce private-task visibility on top of project-level access
  if (entityType === "TASK") {
    await assertTaskCommentAccess(entityId, authorId);
  }

  const comment = await prisma.comment.create({
    data: {
      entityType,
      entityId,
      authorId,
      body: trimmed,
      attachments:
        attachments && attachments.length > 0
          ? {
              create: attachments.map((a) => ({
                name: a.name,
                url: a.url,
                r2Key: a.r2Key,
                size: a.size,
                mimeType: a.mimeType,
              })),
            }
          : undefined,
    },
    include: {
      author: { select: { id: true, name: true, avatar: true, role: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      attachments: {
        select: { id: true, name: true, url: true, size: true, mimeType: true },
      },
    },
  });

  // Build context for notification titles (best-effort)
  let mentionTitle: string;
  let taskRelatedId = entityId; // default for non-task entities
  if (entityType === "TASK" && projectId) {
    const taskDetail = await prisma.task.findUnique({
      where: { id: entityId },
      select: { title: true },
    });
    mentionTitle = `Вас позначили у задачі «${taskDetail?.title ?? ""}»`;
    // "projectId:taskId" format for deep-link routing
    taskRelatedId = `${projectId}:${entityId}`;
  } else if (entityType === "PROJECT") {
    mentionTitle = "Вас позначили в обговоренні проєкту";
  } else {
    mentionTitle = "Вас позначили в обговоренні кошторису";
  }

  await createMentionNotifications({
    body: trimmed,
    authorId,
    type: "COMMENT_MENTION",
    title: mentionTitle,
    relatedEntity: entityType,
    relatedId: entityType === "TASK" ? taskRelatedId : entityId,
  });

  // Broadcast notifications — best-effort: a notification failure must not
  // break comment creation.
  // For TASK comments → notify task stakeholders (creator, assignees, watchers)
  // For PROJECT/ESTIMATE → broadcast to all active project members
  if (projectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { title: true },
      });
      const mentionedIds = parseMentionedIds(trimmed, authorId);

      if (entityType === "TASK") {
        const taskDetail = await prisma.task.findUnique({
          where: { id: entityId },
          select: { title: true },
        });
        const stakeholderIds = await getTaskStakeholderIds(entityId);
        const targets = stakeholderIds.filter(
          (id) => !mentionedIds.includes(id),
        );
        await notifyUsers({
          userIds: targets,
          actorId: authorId,
          type: "TASK_COMMENTED",
          title: `Новий коментар у задачі «${taskDetail?.title ?? ""}» (${project?.title ?? ""})`,
          body: trimmed,
          relatedEntity: "Task",
          relatedId: `${projectId}:${entityId}`,
        });
      } else {
        const title =
          entityType === "PROJECT"
            ? `Новий коментар у проєкті «${project?.title ?? ""}»`
            : `Новий коментар до кошторису у проєкті «${project?.title ?? ""}»`;
        const relEntity = entityType === "PROJECT" ? "Project" : "Estimate";
        const relId = entityType === "PROJECT" ? projectId : entityId;
        await notifyProjectMembers({
          projectId,
          actorId: authorId,
          type: "PROJECT_COMMENT",
          title,
          body: trimmed,
          relatedEntity: relEntity,
          relatedId: relId,
          excludeUserIds: mentionedIds,
        });
      }
    } catch (err) {
      console.error("[comments/postComment] notification failed:", err);
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
    attachments: comment.attachments,
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

// ──────────────────────────────────────────────
// Read / Unread tracking
// ──────────────────────────────────────────────

export async function markCommentsRead(
  entityType: CommentEntityType,
  entityId: string,
  userId: string,
): Promise<void> {
  await prisma.commentReadState.upsert({
    where: {
      uniq_comment_read_state: { entityType, entityId, userId },
    },
    update: { lastReadAt: new Date() },
    create: { entityType, entityId, userId },
  });
}

export async function getUnreadCommentCount(
  entityType: CommentEntityType,
  entityId: string,
  userId: string,
): Promise<number> {
  const state = await prisma.commentReadState.findUnique({
    where: {
      uniq_comment_read_state: { entityType, entityId, userId },
    },
    select: { lastReadAt: true },
  });
  const since = state?.lastReadAt ?? new Date(0);
  return prisma.comment.count({
    where: {
      entityType,
      entityId,
      deletedAt: null,
      authorId: { not: userId },
      createdAt: { gt: since },
    },
  });
}
