import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";

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

export async function requireRole(allowedRoles: Role[]) {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.user.role)) {
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

export async function requireAdminRole() {
  const session = await requireAuth();
  if (!ADMIN_ROLES.includes(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireEstimateAccess() {
  const session = await requireAuth();
  if (!ESTIMATE_ROLES.includes(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}
