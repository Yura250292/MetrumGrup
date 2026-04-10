import type { ProjectRole } from "@prisma/client";

/**
 * Effective per-project permissions for a member, derived by merging:
 *   1. Role defaults (from ProjectRole)
 *   2. Optional JSON override stored in ProjectMember.permissions
 *
 * The override is additive/subtractive per field. A null/missing value falls
 * back to the role default. This keeps the data model simple while letting
 * admins fine-tune individual members.
 */

export type EffectivePermissions = {
  canUpload: boolean;
  canDeleteOthers: boolean;
  canViewFinancials: boolean;
  canManageMembers: boolean;
  canViewInternalFiles: boolean;
};

const ROLE_DEFAULTS: Record<ProjectRole, EffectivePermissions> = {
  PROJECT_ADMIN: {
    canUpload: true,
    canDeleteOthers: true,
    canViewFinancials: true,
    canManageMembers: true,
    canViewInternalFiles: true,
  },
  PROJECT_MANAGER: {
    canUpload: true,
    canDeleteOthers: true,
    canViewFinancials: true,
    canManageMembers: true,
    canViewInternalFiles: true,
  },
  ENGINEER: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
  },
  FOREMAN: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
  },
  FINANCE: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: true,
    canManageMembers: false,
    canViewInternalFiles: true,
  },
  PROCUREMENT: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
  },
  VIEWER: {
    canUpload: false,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
  },
};

export function resolveMemberPermissions(
  role: ProjectRole,
  override: unknown,
): EffectivePermissions {
  const base = ROLE_DEFAULTS[role];
  if (!override || typeof override !== "object") return { ...base };

  const o = override as Partial<EffectivePermissions>;
  return {
    canUpload: typeof o.canUpload === "boolean" ? o.canUpload : base.canUpload,
    canDeleteOthers:
      typeof o.canDeleteOthers === "boolean" ? o.canDeleteOthers : base.canDeleteOthers,
    canViewFinancials:
      typeof o.canViewFinancials === "boolean"
        ? o.canViewFinancials
        : base.canViewFinancials,
    canManageMembers:
      typeof o.canManageMembers === "boolean"
        ? o.canManageMembers
        : base.canManageMembers,
    canViewInternalFiles:
      typeof o.canViewInternalFiles === "boolean"
        ? o.canViewInternalFiles
        : base.canViewInternalFiles,
  };
}
