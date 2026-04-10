import { prisma } from "@/lib/prisma";
import type { ProjectRole } from "@prisma/client";
import { resolveMemberPermissions, type EffectivePermissions } from "./permissions";

/**
 * Centralized project access policies.
 *
 * All collaboration features (files, photos, comments, chat, estimates,
 * activity feed) MUST funnel access checks through this module rather than
 * doing role-based or ad-hoc checks. Reasoning lives in
 * project-collaboration-improvement-plan.md.
 *
 * Access is determined by three layers, evaluated in order:
 *   1. Global SUPER_ADMIN — bypass all
 *   2. CLIENT for project.clientId — read-only "external viewer" mode
 *   3. ProjectMember (active) with role-derived defaults
 *
 * LEGACY fallback: while ProjectMember backfill is in progress (PR1-PR2 in
 * production but PR4 not yet deployed), `canViewProject` falls back to chat
 * conversation participants. Remove fallback in PR4 once sync is live.
 */

type AccessProject = {
  id: string;
  clientId: string;
  managerId: string | null;
};

const PROJECT_ACCESS_SELECT = {
  id: true,
  clientId: true,
  managerId: true,
} as const;

async function loadProject(projectId: string): Promise<AccessProject | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: PROJECT_ACCESS_SELECT,
  });
}

async function loadUserRole(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role ?? null;
}

async function loadActiveMember(projectId: string, userId: string) {
  return prisma.projectMember.findFirst({
    where: { projectId, userId, isActive: true },
    select: { id: true, roleInProject: true, permissions: true },
  });
}

/** Roles with elevated finance visibility inside a project. */
const FINANCE_PROJECT_ROLES: ProjectRole[] = [
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "FINANCE",
];

/** Roles allowed to add/remove team members within a project. */
const MEMBER_MANAGER_ROLES: ProjectRole[] = ["PROJECT_ADMIN", "PROJECT_MANAGER"];

/** Roles that may upload files (i.e. all members except VIEWER). */
const UPLOAD_FORBIDDEN_ROLES: ProjectRole[] = ["VIEWER"];

export type ProjectAccessContext = {
  projectId: string;
  userId: string;
  isSuperAdmin: boolean;
  isClientOfProject: boolean;
  member: { roleInProject: ProjectRole; permissions: unknown } | null;
  legacyChatParticipant: boolean;
  canView: boolean;
  canParticipate: boolean;
  canUpload: boolean;
  canManageMembers: boolean;
  canViewFinancials: boolean;
};

export async function getProjectAccessContext(
  projectId: string,
  userId: string,
): Promise<ProjectAccessContext | null> {
  const [project, role, member] = await Promise.all([
    loadProject(projectId),
    loadUserRole(userId),
    loadActiveMember(projectId, userId),
  ]);
  if (!project || !role) return null;

  const isSuperAdmin = role === "SUPER_ADMIN";
  const isClientOfProject = role === "CLIENT" && project.clientId === userId;

  // LEGACY chat-participant fallback was removed in PR4 once chat sync became
  // authoritative. Membership is now the only signal for view access.
  const legacyChatParticipant = false;

  const canView = isSuperAdmin || isClientOfProject || Boolean(member);

  // CLIENT cannot post in team chat / write internal collaboration items.
  const canParticipate = isSuperAdmin || Boolean(member);

  const canUpload =
    isSuperAdmin ||
    (Boolean(member) &&
      !UPLOAD_FORBIDDEN_ROLES.includes(member!.roleInProject));

  const canManageMembers =
    isSuperAdmin ||
    (Boolean(member) && MEMBER_MANAGER_ROLES.includes(member!.roleInProject));

  const canViewFinancials =
    isSuperAdmin ||
    isClientOfProject || // client sees own financial summary
    (Boolean(member) && FINANCE_PROJECT_ROLES.includes(member!.roleInProject));

  return {
    projectId,
    userId,
    isSuperAdmin,
    isClientOfProject,
    member: member
      ? { roleInProject: member.roleInProject, permissions: member.permissions }
      : null,
    legacyChatParticipant,
    canView,
    canParticipate,
    canUpload,
    canManageMembers,
    canViewFinancials,
  };
}

export async function canViewProject(projectId: string, userId: string): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canView);
}

export async function canParticipateInProject(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canParticipate);
}

export async function canUploadProjectFiles(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canUpload);
}

export async function canManageProjectMembers(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canManageMembers);
}

export async function canViewProjectFinancials(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canViewFinancials);
}
