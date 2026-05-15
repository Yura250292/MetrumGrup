import { prisma } from "@/lib/prisma";
import type { ProjectRole } from "@prisma/client";

/**
 * Reconcile a project's chat conversation participants with its active
 * ProjectMember set. Source of truth is ProjectMember; chat participants are
 * derived.
 *
 * Strategy:
 *   - Add missing participants for active members.
 *   - Remove participants who are no longer active members (their messages
 *     remain visible to remaining participants).
 *   - SUPER_ADMIN users are NOT auto-added — they only join via explicit
 *     navigation, since they may not be members of every project.
 *
 * Note: ESTIMATE conversations are also synced via syncEstimateConversation —
 * but only for the subset of roles that have finance/engineering visibility.
 */
export async function syncProjectConversationParticipants(projectId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!conversation) return; // No project conversation yet — nothing to sync.

  const [members, participants] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId, isActive: true },
      select: { userId: true },
    }),
    prisma.conversationParticipant.findMany({
      where: { conversationId: conversation.id },
      select: { userId: true },
    }),
  ]);

  const memberUserIds = new Set(members.map((m) => m.userId));
  const participantUserIds = new Set(participants.map((p) => p.userId));

  const toAdd: string[] = [];
  for (const userId of memberUserIds) {
    if (!participantUserIds.has(userId)) toAdd.push(userId);
  }

  const toRemove: string[] = [];
  for (const userId of participantUserIds) {
    if (!memberUserIds.has(userId)) toRemove.push(userId);
  }

  if (toAdd.length === 0 && toRemove.length === 0) return;

  await prisma.$transaction([
    ...toAdd.map((userId) =>
      prisma.conversationParticipant.create({
        data: { conversationId: conversation.id, userId },
      }),
    ),
    ...(toRemove.length > 0
      ? [
          prisma.conversationParticipant.deleteMany({
            where: {
              conversationId: conversation.id,
              userId: { in: toRemove },
            },
          }),
        ]
      : []),
  ]);
}

const ESTIMATE_CHAT_ROLES: ProjectRole[] = [
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "ENGINEER",
  "FINANCE",
];

/**
 * Sync ESTIMATE conversation participants — narrower set than project chat:
 * only members with finance/engineering visibility into the estimate.
 */
export async function syncEstimateConversationParticipants(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { projectId: true, conversation: { select: { id: true } } },
  });
  if (!estimate?.conversation) return;
  const conversationId = estimate.conversation.id;

  const [members, participants] = await Promise.all([
    prisma.projectMember.findMany({
      where: {
        projectId: estimate.projectId,
        isActive: true,
        roleInProject: { in: ESTIMATE_CHAT_ROLES },
      },
      select: { userId: true },
    }),
    prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    }),
  ]);

  const allowed = new Set(members.map((m) => m.userId));
  const present = new Set(participants.map((p) => p.userId));

  const toAdd: string[] = [];
  for (const id of allowed) if (!present.has(id)) toAdd.push(id);
  const toRemove: string[] = [];
  for (const id of present) if (!allowed.has(id)) toRemove.push(id);

  if (toAdd.length === 0 && toRemove.length === 0) return;

  await prisma.$transaction([
    ...toAdd.map((userId) =>
      prisma.conversationParticipant.create({
        data: { conversationId, userId },
      }),
    ),
    ...(toRemove.length > 0
      ? [
          prisma.conversationParticipant.deleteMany({
            where: { conversationId, userId: { in: toRemove } },
          }),
        ]
      : []),
  ]);
}
