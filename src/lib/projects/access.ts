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
 *
 * ================================================================
 * TASKS POLICY (Phase 1+): internal-staff-only
 * ================================================================
 * Product decision: tasks are an internal execution layer for the
 * Metrum team. CLIENTs see the public-facing project portal
 * (stages, photos, payments, completion acts) but NEVER see tasks,
 * checklists, time logs, comments on tasks, or task-related reports.
 *
 * Implementation:
 *   - All `canView*Tasks` / `canLogTime` / `canViewTimeReports` etc.
 *     below are hard-forced to `false` when `role === "CLIENT"`,
 *     regardless of `ProjectMember.permissions` overrides.
 *   - This is intentionally stricter than Worksection (which supports
 *     guest/reader external access to individual tasks). If a client
 *     portal for tasks is ever required, add a new `TaskVisibility`
 *     model or `isClientVisible` flag — DO NOT remove this hard-block.
 *
 * The `taskDenyClient` constant below enforces this; any new task
 * permission added here must be gated through it.
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
  // Tasks (Phase 1+). CLIENT is ALWAYS false here — enforced below.
  canViewTasks: boolean;
  canCreateTasks: boolean;
  canEditAnyTask: boolean;
  canDeleteTasks: boolean;
  canAssignTasks: boolean;
  canManageTaskConfig: boolean; // statuses / labels / custom fields
  canLogTime: boolean;
  canViewTimeReports: boolean;
  canViewCostReports: boolean;
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

  // Tasks are an INTERNAL tool — CLIENT never gets task-related access,
  // regardless of overrides. This hard-block is checked BEFORE merging
  // effective permissions.
  const taskDenyClient = role === "CLIENT";
  const canViewTasks =
    !taskDenyClient && (isSuperAdmin || (effective?.canViewTasks ?? false));
  const canCreateTasks =
    !taskDenyClient && (isSuperAdmin || (effective?.canCreateTasks ?? false));
  const canEditAnyTask =
    !taskDenyClient && (isSuperAdmin || (effective?.canEditAnyTask ?? false));
  const canDeleteTasks =
    !taskDenyClient && (isSuperAdmin || (effective?.canDeleteTasks ?? false));
  const canAssignTasks =
    !taskDenyClient && (isSuperAdmin || (effective?.canAssignTasks ?? false));
  const canManageTaskConfig =
    !taskDenyClient &&
    (isSuperAdmin ||
      Boolean(
        effective?.canManageStatuses &&
          effective?.canManageLabels &&
          effective?.canManageCustomFields,
      ));
  const canLogTime =
    !taskDenyClient && (isSuperAdmin || (effective?.canLogTime ?? false));
  const canViewTimeReports =
    !taskDenyClient && (isSuperAdmin || (effective?.canViewTimeReports ?? false));
  const canViewCostReports =
    !taskDenyClient && (isSuperAdmin || (effective?.canViewCostReports ?? false));

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
    canViewTasks,
    canCreateTasks,
    canEditAnyTask,
    canDeleteTasks,
    canAssignTasks,
    canManageTaskConfig,
    canLogTime,
    canViewTimeReports,
    canViewCostReports,
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

// ------- Tasks-specific helpers (Phase 1+) -------
// Each returns false for CLIENT regardless of override.

export async function canViewProjectTasks(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canViewTasks);
}

export async function canCreateProjectTasks(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canCreateTasks);
}

export async function canManageProjectTasks(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canEditAnyTask);
}

export async function canManageProjectTaskConfig(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canManageTaskConfig);
}

export async function canLogTimeOnProject(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canLogTime);
}

export async function canViewProjectTimeReports(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const ctx = await getProjectAccessContext(projectId, userId);
  return Boolean(ctx?.canViewTimeReports);
}
