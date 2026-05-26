import type { Role, RFIStatus } from "@prisma/client";

/// CLIENTs ask via a separate client-portal channel — exclude from staff RFI creation.
const CREATE_ROLES: Role[] = ["SUPER_ADMIN", "OWNER", "MANAGER", "ENGINEER", "FINANCIER", "FOREMAN"];

export function canCreateRFI(role: Role | null | undefined): boolean {
  return !!role && CREATE_ROLES.includes(role);
}

const PM_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER"];

type RFICheck = {
  status: RFIStatus;
  askedById: string;
  assignedToId: string | null;
};

export function canAnswerRFI(rfi: RFICheck, userId: string, role: Role): boolean {
  if (rfi.status !== "OPEN" && rfi.status !== "IN_PROGRESS") return false;
  if (PM_ROLES.includes(role)) return true;
  return !!rfi.assignedToId && rfi.assignedToId === userId;
}

export function canEditRFI(rfi: RFICheck, userId: string, role: Role): boolean {
  if (rfi.status !== "OPEN" && rfi.status !== "IN_PROGRESS") return false;
  if (PM_ROLES.includes(role)) return true;
  return rfi.askedById === userId;
}

export function canCloseRFI(rfi: RFICheck, userId: string, role: Role): boolean {
  // Може закрити після відповіді: автор, виконавець або PM. Після CANCELLED — ні.
  if (rfi.status === "CANCELLED" || rfi.status === "CLOSED") return false;
  if (rfi.status !== "ANSWERED") return false;
  if (PM_ROLES.includes(role)) return true;
  return rfi.askedById === userId || rfi.assignedToId === userId;
}

export function canCancelRFI(rfi: RFICheck, userId: string, role: Role): boolean {
  if (rfi.status === "CANCELLED" || rfi.status === "CLOSED") return false;
  if (PM_ROLES.includes(role)) return true;
  return rfi.askedById === userId;
}

/// Status transition matrix (from → allowed-tos).
export function isAllowedTransition(from: RFIStatus, to: RFIStatus): boolean {
  switch (from) {
    case "OPEN":
      return to === "IN_PROGRESS" || to === "ANSWERED" || to === "CANCELLED";
    case "IN_PROGRESS":
      return to === "ANSWERED" || to === "CANCELLED";
    case "ANSWERED":
      return to === "CLOSED" || to === "IN_PROGRESS"; // reopen for clarification
    case "CLOSED":
    case "CANCELLED":
      return false;
  }
}
