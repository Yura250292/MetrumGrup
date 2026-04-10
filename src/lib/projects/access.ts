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

export type ProjectAccessContext = {
  projectId: string;
  userId: string;
  isSuperAdmin: boolean;
  isClientOfProject: boolean;
  member: {
    roleInProject: ProjectRole;
    permissions: unknown;
    effective: EffectivePermissions;
  } | null;
  canView: boolean;
  canParticipate: boolean;
  canUpload: boolean;
  canManageMembers: boolean;
  canViewFinancials: boolean;
  canViewInternalFiles: boolean;
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

  const effective = member
    ? resolveMemberPermissions(member.roleInProject, member.permissions)
    : null;

  const canView = isSuperAdmin || isClientOfProject || Boolean(member);
  // CLIENT cannot post in team chat / write internal collaboration items.
  const canParticipate = isSuperAdmin || Boolean(member);
  const canUpload = isSuperAdmin || (effective?.canUpload ?? false);
  const canManageMembers =
    isSuperAdmin || (effective?.canManageMembers ?? false);
  const canViewFinancials =
    isSuperAdmin ||
    isClientOfProject || // client sees own financial summary
    (effective?.canViewFinancials ?? false);
  const canViewInternalFiles =
    isSuperAdmin || (effective?.canViewInternalFiles ?? false);

  return {
    projectId,
    userId,
    isSuperAdmin,
    isClientOfProject,
    member: member && effective
      ? {
          roleInProject: member.roleInProject,
          permissions: member.permissions,
          effective,
        }
      : null,
    canView,
    canParticipate,
    canUpload,
    canManageMembers,
    canViewFinancials,
    canViewInternalFiles,
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
