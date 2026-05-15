import { prisma } from "@/lib/prisma";
import { Prisma, type ProjectRole } from "@prisma/client";
import {
  syncEstimateConversationParticipants,
  syncProjectConversationParticipants,
} from "@/lib/chat/sync";

/**
 * ProjectMember service — single source of truth for project team membership.
 *
 * Used by:
 *   - aggregations.ts (team composition)
 *   - access.ts (permission checks)
 *   - chat sync (PR4)
 *   - admin team management API (PR5)
 */

export type ProjectMemberWithUser = Prisma.ProjectMemberGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true; avatar: true; role: true } };
    invitedBy: { select: { id: true; name: true } };
  };
}>;

const memberInclude = {
  user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
  invitedBy: { select: { id: true, name: true } },
} satisfies Prisma.ProjectMemberInclude;

export async function listActiveMembers(projectId: string): Promise<ProjectMemberWithUser[]> {
  return prisma.projectMember.findMany({
    where: { projectId, isActive: true },
    include: memberInclude,
    orderBy: { joinedAt: "asc" },
  });
}

export async function listAllMembers(projectId: string): Promise<ProjectMemberWithUser[]> {
  return prisma.projectMember.findMany({
    where: { projectId },
    include: memberInclude,
    orderBy: [{ isActive: "desc" }, { joinedAt: "asc" }],
  });
}

export async function getMemberOrNull(
  projectId: string,
  userId: string,
): Promise<ProjectMemberWithUser | null> {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: memberInclude,
  });
}

export async function isActiveMember(projectId: string, userId: string): Promise<boolean> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { isActive: true },
  });
  return Boolean(m?.isActive);
}

export type AddMemberInput = {
  projectId: string;
  userId: string;
  roleInProject: ProjectRole;
  invitedById?: string | null;
  permissions?: Prisma.InputJsonValue | null;
};

/**
 * Idempotent add: якщо запис існує (навіть isActive=false), реактивує його
 * та оновлює роль. Якщо ні — створює.
 *
 * Side effect: triggers syncProjectConversationParticipants so the chat
 * stays consistent with the team. Estimates within the project are also
 * re-synced because role changes affect estimate-channel visibility.
 */
export async function addProjectMember(input: AddMemberInput): Promise<ProjectMemberWithUser> {
  const { projectId, userId, roleInProject, invitedById, permissions } = input;
  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: {
      projectId,
      userId,
      roleInProject,
      invitedById: invitedById ?? null,
      permissions: permissions ?? undefined,
      isActive: true,
    },
    update: {
      roleInProject,
      isActive: true,
      leftAt: null,
      ...(permissions !== undefined ? { permissions: permissions ?? Prisma.JsonNull } : {}),
    },
    include: memberInclude,
  });

  await syncMemberDerivedChannels(projectId);
  return member;
}

export async function changeMemberRole(
  projectId: string,
  userId: string,
  roleInProject: ProjectRole,
): Promise<ProjectMemberWithUser> {
  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { roleInProject },
    include: memberInclude,
  });
  await syncMemberDerivedChannels(projectId);
  return updated;
}

export async function deactivateMember(
  projectId: string,
  userId: string,
): Promise<ProjectMemberWithUser> {
  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { isActive: false, leftAt: new Date() },
    include: memberInclude,
  });
  await syncMemberDerivedChannels(projectId);
  return updated;
}

/**
 * Re-sync project chat + all estimate chats for a project after a membership
 * change. Best-effort: errors are logged but do not fail the parent op.
 */
async function syncMemberDerivedChannels(projectId: string) {
  try {
    await syncProjectConversationParticipants(projectId);
  } catch (err) {
    console.error("[members-service] project chat sync failed:", err);
  }
  try {
    const estimates = await prisma.estimate.findMany({
      where: { projectId, conversation: { isNot: null } },
      select: { id: true },
    });
    for (const e of estimates) {
      await syncEstimateConversationParticipants(e.id);
    }
  } catch (err) {
    console.error("[members-service] estimate chat sync failed:", err);
  }
}
