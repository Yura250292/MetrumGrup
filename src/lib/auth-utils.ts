import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";

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
// Хто бачить ЗП, project budgets, cashflow, strategic reports.
// Правило власника: ТІЛЬКИ SUPER_ADMIN. Винятки (2026-05-21):
//   - FINANCIER бачить Invoice/SupplierPayment (облік постачальників) і суми
//     у foreman-звітах при approve. ЗП/cashflow/budgets — НЕ бачить.
//   - MANAGER веде облік постачальників (без ЗП/cashflow).
// Для перевірки доступу до фін.цифр (ЗП/cashflow/budgets) використовуй FINANCE_ROLES.
// Для доступу до обліку постачальників — SUPPLIER_LEDGER_ROLES.
export const FINANCE_ROLES: Role[] = ["SUPER_ADMIN"];
// Хто має доступ до обліку постачальників (Invoice, SupplierPayment) — список,
// журнал платежів, ручне додавання накладних, FIFO-allocation.
export const SUPPLIER_LEDGER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

/** True iff this role may see any financial numbers. Use everywhere — UI, API, AI context. */
export function canViewFinance(role: Role | string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}
export const STAFF_ROLES: Role[] = ESTIMATE_ROLES;
// HR has read+write access to employees/counterparties/subcontractors/clients and read to
// equipment/warehouse/workers/meetings/chat. Treated as an admin peer for its allowlist only.
export const HR_ACCESSIBLE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "HR"];
// Foreman: kiosk PWA users (виконроб). Submit expense reports → manager approves.
export const FOREMAN_ROLES: Role[] = ["FOREMAN"];
// Хто бачить queue звітів виконробів і може approve/reject. SUPER_ADMIN + FINANCIER
// (фінансист виступає як проджект-менеджер по фінансовій частині — 2026-05-21).
export const FOREMAN_REPORT_REVIEWERS: Role[] = ["SUPER_ADMIN", "FINANCIER"];
// Owner: директор/засновник — мінімалістичний read-only аналітичний дашборд.
// SUPER_ADMIN теж пропускається у /owner (може дивитись overview якщо хоче).
export const OWNER_ROLES: Role[] = ["OWNER", "SUPER_ADMIN"];

export async function requireAdminRole() {
  const session = await requireAuth();
  const role = await getActiveRoleForRequest(session);
  if (!role || !ADMIN_ROLES.includes(role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireAuth();
  const role = await getActiveRoleForRequest(session);
  if (role !== "SUPER_ADMIN") {
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

/**
 * Гард для роль FOREMAN. Повертає session + активну фірму для firm-isolation
 * усередині foreman API endpoints. SUPER_ADMIN не пропускається — це окрема
 * роль для kiosk-у, не для адмінів.
 */
export async function requireForeman() {
  const session = await requireAuth();
  let firmId: string | null;
  try {
    ({ firmId } = await resolveFirmScopeForRequest(session));
  } catch {
    firmId = session.user.firmId ?? null;
  }
  const role = getActiveRoleFromSession(session, firmId);
  if (role !== "FOREMAN") {
    throw new Error("Forbidden");
  }
  return { session, firmId, role };
}

/**
 * Список проектів виконроба у активній фірмі. Foreman бачить ТІЛЬКИ ті проекти,
 * де він є ProjectMember з roleInProject=FOREMAN та isActive=true. Single source
 * of truth для всіх foreman endpoints.
 */
export async function getForemanProjects(userId: string, firmId: string | null) {
  const memberships = await prisma.projectMember.findMany({
    where: {
      userId,
      roleInProject: "FOREMAN",
      isActive: true,
      project: {
        firmId: firmId ?? undefined,
        status: { not: "CANCELLED" },
      },
    },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          slug: true,
          address: true,
          folderId: true,
          firmId: true,
          status: true,
        },
      },
    },
  });
  return memberships.map((m) => m.project);
}

/**
 * Defensive guard: foreman пробує писати у проект → перевір що проект справді
 * у його активній фірмі і він на нього призначений. Кидає "Forbidden" якщо ні.
 */
export async function assertForemanCanAccessProject(
  userId: string,
  firmId: string | null,
  projectId: string,
) {
  const member = await prisma.projectMember.findFirst({
    where: {
      userId,
      projectId,
      roleInProject: "FOREMAN",
      isActive: true,
      project: {
        firmId: firmId ?? undefined,
      },
    },
    select: { id: true },
  });
  if (!member) {
    throw new Error("Forbidden");
  }
}

/**
 * Гард для роль OWNER (директор/засновник). Read-only доступ до аналітики
 * усіх фірм. SUPER_ADMIN теж пропускається. Повертає session + активну фірму.
 */
export async function requireOwner() {
  const session = await requireAuth();
  let firmId: string | null;
  try {
    ({ firmId } = await resolveFirmScopeForRequest(session));
  } catch {
    firmId = session.user.firmId ?? null;
  }
  const role = getActiveRoleFromSession(session, firmId);
  if (role !== "OWNER" && role !== "SUPER_ADMIN") {
    throw new Error("Forbidden");
  }
  return { session, firmId, role };
}
