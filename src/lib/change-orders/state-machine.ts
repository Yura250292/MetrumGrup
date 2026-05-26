import type { ChangeOrderStatus, Role } from "@prisma/client";

export type COAction =
  | "submit"
  | "approve_pm"
  | "approve_admin"
  | "approve_client"
  | "reject"
  | "cancel";

/// Дозволені переходи статусів. Якщо action відсутня для статусу → перехід заборонено.
export const TRANSITIONS: Record<
  ChangeOrderStatus,
  Partial<Record<COAction, ChangeOrderStatus>>
> = {
  DRAFT: { submit: "PENDING_PM", cancel: "CANCELLED" },
  PENDING_PM: {
    approve_pm: "PENDING_ADMIN",
    reject: "REJECTED",
    cancel: "CANCELLED",
  },
  PENDING_ADMIN: {
    approve_admin: "PENDING_CLIENT",
    reject: "REJECTED",
    cancel: "CANCELLED",
  },
  PENDING_CLIENT: {
    approve_client: "APPROVED",
    reject: "REJECTED",
  },
  APPROVED: {},
  REJECTED: {},
  CANCELLED: {},
};

/// Хто може викликати кожну action. SUPER_ADMIN присутній у всіх (override).
export const ACTION_RBAC: Record<COAction, Role[]> = {
  submit: ["MANAGER", "ENGINEER", "SUPER_ADMIN"],
  approve_pm: ["MANAGER", "SUPER_ADMIN"],
  approve_admin: ["SUPER_ADMIN"],
  approve_client: ["CLIENT", "SUPER_ADMIN"],
  reject: ["MANAGER", "SUPER_ADMIN", "CLIENT"],
  cancel: ["MANAGER", "ENGINEER", "SUPER_ADMIN"],
};

export type TransitionResult =
  | { ok: true; nextStatus: ChangeOrderStatus }
  | { ok: false; reason: "invalid-transition" | "forbidden-role" };

/// Перевіряє і дозволеність переходу для (status, action), і RBAC для role.
export function validateTransition(
  currentStatus: ChangeOrderStatus,
  action: COAction,
  role: Role,
): TransitionResult {
  const nextStatus = TRANSITIONS[currentStatus]?.[action];
  if (!nextStatus) {
    return { ok: false, reason: "invalid-transition" };
  }
  const allowed = ACTION_RBAC[action];
  if (!allowed.includes(role)) {
    return { ok: false, reason: "forbidden-role" };
  }
  return { ok: true, nextStatus };
}

/// HTTP-статус для відмови (для API мапінгу).
export function transitionErrorStatus(
  reason: "invalid-transition" | "forbidden-role",
): 409 | 403 {
  return reason === "invalid-transition" ? 409 : 403;
}
