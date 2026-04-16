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
  // Files / members / financials (original)
  canUpload: boolean;
  canDeleteOthers: boolean;
  canViewFinancials: boolean;
  canManageMembers: boolean;
  canViewInternalFiles: boolean;
  // Tasks (Phase 1+)
  canViewTasks: boolean;
  canCreateTasks: boolean;
  canEditOwnTasks: boolean;
  canEditAnyTask: boolean;
  canDeleteTasks: boolean;
  canAssignTasks: boolean;
  canManageStatuses: boolean;
  canManageLabels: boolean;
  canManageCustomFields: boolean;
  // Time tracking (Phase 3+)
  canLogTime: boolean;
  canEditOthersTime: boolean;
  canViewTimeReports: boolean;
  canViewCostReports: boolean;
  // Automations / webhooks (Phase 5+)
  canManageAutomations: boolean;
  canManageWebhooks: boolean;
  // Visibility
  canViewPrivateTasks: boolean;
};

const ROLE_DEFAULTS: Record<ProjectRole, EffectivePermissions> = {
  PROJECT_ADMIN: {
    canUpload: true,
    canDeleteOthers: true,
    canViewFinancials: true,
    canManageMembers: true,
    canViewInternalFiles: true,
    canViewTasks: true,
    canCreateTasks: true,
    canEditOwnTasks: true,
    canEditAnyTask: true,
    canDeleteTasks: true,
    canAssignTasks: true,
    canManageStatuses: true,
    canManageLabels: true,
    canManageCustomFields: true,
    canLogTime: true,
    canEditOthersTime: true,
    canViewTimeReports: true,
    canViewCostReports: true,
    canManageAutomations: true,
    canManageWebhooks: true,
    canViewPrivateTasks: true,
  },
  PROJECT_MANAGER: {
    canUpload: true,
    canDeleteOthers: true,
    canViewFinancials: true,
    canManageMembers: true,
    canViewInternalFiles: true,
    canViewTasks: true,
    canCreateTasks: true,
    canEditOwnTasks: true,
    canEditAnyTask: true,
    canDeleteTasks: true,
    canAssignTasks: true,
    canManageStatuses: true,
    canManageLabels: true,
    canManageCustomFields: true,
    canLogTime: true,
    canEditOthersTime: true,
    canViewTimeReports: true,
    canViewCostReports: true,
    canManageAutomations: true,
    canManageWebhooks: false,
    canViewPrivateTasks: true,
  },
  ENGINEER: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
    canViewTasks: true,
    canCreateTasks: true,
    canEditOwnTasks: true,
    canEditAnyTask: false,
    canDeleteTasks: false,
    canAssignTasks: false,
    canManageStatuses: false,
    canManageLabels: false,
    canManageCustomFields: false,
    canLogTime: true,
    canEditOthersTime: false,
    canViewTimeReports: true,
    canViewCostReports: false,
    canManageAutomations: false,
    canManageWebhooks: false,
    canViewPrivateTasks: false,
  },
  FOREMAN: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
    canViewTasks: true,
    canCreateTasks: true,
    canEditOwnTasks: true,
    canEditAnyTask: false,
    canDeleteTasks: false,
    canAssignTasks: true,
    canManageStatuses: false,
    canManageLabels: false,
    canManageCustomFields: false,
    canLogTime: true,
    canEditOthersTime: false,
    canViewTimeReports: true,
    canViewCostReports: false,
    canManageAutomations: false,
    canManageWebhooks: false,
    canViewPrivateTasks: false,
  },
  FINANCE: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: true,
    canManageMembers: false,
    canViewInternalFiles: true,
    canViewTasks: true,
    canCreateTasks: false,
    canEditOwnTasks: false,
    canEditAnyTask: false,
    canDeleteTasks: false,
    canAssignTasks: false,
    canManageStatuses: false,
    canManageLabels: false,
    canManageCustomFields: false,
    canLogTime: true,
    canEditOthersTime: false,
    canViewTimeReports: true,
    canViewCostReports: true,
    canManageAutomations: false,
    canManageWebhooks: false,
    canViewPrivateTasks: false,
  },
  PROCUREMENT: {
    canUpload: true,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
    canViewTasks: true,
    canCreateTasks: true,
    canEditOwnTasks: true,
    canEditAnyTask: false,
    canDeleteTasks: false,
    canAssignTasks: false,
    canManageStatuses: false,
    canManageLabels: false,
    canManageCustomFields: false,
    canLogTime: true,
    canEditOthersTime: false,
    canViewTimeReports: false,
    canViewCostReports: false,
    canManageAutomations: false,
    canManageWebhooks: false,
    canViewPrivateTasks: false,
  },
  VIEWER: {
    canUpload: false,
    canDeleteOthers: false,
    canViewFinancials: false,
    canManageMembers: false,
    canViewInternalFiles: false,
    canViewTasks: true,
    canCreateTasks: false,
    canEditOwnTasks: false,
    canEditAnyTask: false,
    canDeleteTasks: false,
    canAssignTasks: false,
    canManageStatuses: false,
    canManageLabels: false,
    canManageCustomFields: false,
    canLogTime: false,
    canEditOthersTime: false,
    canViewTimeReports: false,
    canViewCostReports: false,
    canManageAutomations: false,
    canManageWebhooks: false,
    canViewPrivateTasks: false,
  },
};

const PERMISSION_KEYS = Object.keys(ROLE_DEFAULTS.PROJECT_ADMIN) as Array<
  keyof EffectivePermissions
>;

export function resolveMemberPermissions(
  role: ProjectRole,
  override: unknown,
): EffectivePermissions {
  const base = ROLE_DEFAULTS[role];
  if (!override || typeof override !== "object") return { ...base };

  const o = override as Partial<Record<keyof EffectivePermissions, unknown>>;
  const result = { ...base };
  for (const key of PERMISSION_KEYS) {
    const v = o[key];
    if (typeof v === "boolean") {
      result[key] = v;
    }
  }
  return result;
}

export function emptyPermissions(): EffectivePermissions {
  const zero = {} as EffectivePermissions;
  for (const key of PERMISSION_KEYS) {
    zero[key] = false;
  }
  return zero;
}
