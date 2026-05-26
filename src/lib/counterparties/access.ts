import { NextResponse } from "next/server";
import type { Counterparty, Role } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession, isHomeFirmFor } from "@/lib/firm/scope";
import { canAccessCounterparty } from "@/lib/firm/counterparty-scope";

export const READ_ROLES: Role[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "FINANCIER",
  "ENGINEER",
  "HR",
];
export const WRITE_ROLES: Role[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "FINANCIER",
  "HR",
];
export const DELETE_ROLES: Role[] = ["SUPER_ADMIN"];

export interface CounterpartyAccess {
  session: Session;
  counterparty: Counterparty;
  firmId: string | null;
  activeRole: Role;
}

/**
 * Стандартна перевірка для всіх SRM endpoints: автентифікація, firm-scope,
 * активна роль і доступ до конкретного контрагента (включно з shared:
 * firmId=null доступний з будь-якої фірми).
 *
 * Повертає NextResponse якщо доступ заборонено, або CounterpartyAccess.
 */
export async function requireCounterpartyAccess(opts: {
  session: Session | null;
  counterpartyId: string;
  allowedRoles: Role[];
}): Promise<NextResponse | CounterpartyAccess> {
  const { session, counterpartyId, allowedRoles } = opts;
  if (!session?.user) return unauthorizedResponse();

  const counterparty = await prisma.counterparty.findUnique({
    where: { id: counterpartyId },
  });
  if (!counterparty) {
    return NextResponse.json(
      { error: "Контрагента не знайдено" },
      { status: 404 },
    );
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!activeRole || !allowedRoles.includes(activeRole)) {
    return forbiddenResponse();
  }

  if (
    !canAccessCounterparty({
      userFirmId: session.user.firmId ?? null,
      userIsSuperAdmin: session.user.role === "SUPER_ADMIN",
      counterpartyFirmId: counterparty.firmId,
    })
  ) {
    // 404 (а не 403), щоб не leak'ати існування чужого контрагента.
    return NextResponse.json(
      { error: "Контрагента не знайдено" },
      { status: 404 },
    );
  }

  return { session, counterparty, firmId, activeRole };
}

export function isAccessResponse(
  v: NextResponse | CounterpartyAccess,
): v is NextResponse {
  return v instanceof NextResponse;
}
