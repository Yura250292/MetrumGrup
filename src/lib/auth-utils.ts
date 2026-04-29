import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export async function getSession() {
  return await auth();
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

/**
 * Повертає роль користувача у контексті активної фірми (з cookie).
 * Це КЛЮЧОВА відмінність від session.user.role:
 * - shymilo93 base=HR, але на Studio active=SUPER_ADMIN → guard пропустить
 * - SUPER_ADMINs завжди SUPER_ADMIN на всіх фірмах (правило з getActiveRoleFromSession)
 *
 * Якщо cookies() недоступне (jest, build-time) — fallback на home firm
 * щоб запит не падав з ERR_NEXT_REQUEST_SCOPE.
 */
async function getActiveRoleForRequest(
  session: Awaited<ReturnType<typeof requireAuth>>,
): Promise<Role | null> {
  let firmId: string | null;
  try {
    ({ firmId } = await resolveFirmScopeForRequest(session));
  } catch {
    firmId = session.user.firmId ?? null;
  }
  return getActiveRoleFromSession(session, firmId);
}

export async function requireRole(allowedRoles: Role[]) {
  const session = await requireAuth();
  const role = await getActiveRoleForRequest(session);
  if (!role || !allowedRoles.includes(role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export function scopeByClient(session: { user: { id: string; role: Role } }) {
  // CLIENT role: only see own projects
  if (session.user.role === "CLIENT") {
    return { clientId: session.user.id };
  }

  // Roles with full access
  const fullAccessRoles: Role[] = ["SUPER_ADMIN", "MANAGER"];
  if (fullAccessRoles.includes(session.user.role)) {
    return {};
  }

  // USER and other restricted roles: return impossible condition
  return { id: "__UNAUTHORIZED__" };
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized", message: "Необхідна авторизація" },
    { status: 401 }
  );
}

export function forbiddenResponse() {
  return NextResponse.json(
    { error: "Forbidden", message: "Недостатньо прав доступу" },
    { status: 403 }
  );
}

// Common role groups for consistent authorization
export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER"];
export const ESTIMATE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
export const FINANCE_ROLES: Role[] = ["SUPER_ADMIN", "FINANCIER"];
export const STAFF_ROLES: Role[] = ESTIMATE_ROLES;
// HR has read+write access to employees/counterparties/subcontractors/clients and read to
// equipment/warehouse/workers/meetings/chat. Treated as an admin peer for its allowlist only.
export const HR_ACCESSIBLE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "HR"];

export async function requireAdminRole() {
  const session = await requireAuth();
  const role = await getActiveRoleForRequest(session);
  if (!role || !ADMIN_ROLES.includes(role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireHrOrAdminRole() {
  const session = await requireAuth();
  const role = await getActiveRoleForRequest(session);
  if (!role || !HR_ACCESSIBLE_ROLES.includes(role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireEstimateAccess() {
  const session = await requireAuth();
  const role = await getActiveRoleForRequest(session);
  if (!role || !ESTIMATE_ROLES.includes(role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireStaffAccess() {
  const session = await requireAuth();
  const role = await getActiveRoleForRequest(session);
  if (!role || !STAFF_ROLES.includes(role)) {
    throw new Error("Forbidden");
  }
  return session;
}

/**
 * Project-scoped access guard. Throws "Forbidden" if user is neither
 * SUPER_ADMIN, the project's CLIENT, nor an active ProjectMember (with the
 * legacy chat-participant fallback while backfill is rolling out).
 */
export async function requireProjectAccess(projectId: string) {
  const session = await requireAuth();
  const { canViewProject } = await import("@/lib/projects/access");
  const ok = await canViewProject(projectId, session.user.id);
  if (!ok) {
    throw new Error("Forbidden");
  }
  return session;
}
