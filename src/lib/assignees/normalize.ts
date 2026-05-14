import { prisma } from "@/lib/prisma";
import type { AssigneeRef } from "./types";

/**
 * Розбиває масив AssigneeRef-ів на окремі списки userIds/employeeIds.
 * Дедупить, відфільтровує не-непорожні id.
 */
export function splitAssignees(refs: AssigneeRef[]): {
  userIds: string[];
  employeeIds: string[];
} {
  const userIds = new Set<string>();
  const employeeIds = new Set<string>();
  for (const r of refs) {
    if (!r || !r.id) continue;
    if (r.kind === "user") userIds.add(r.id);
    else if (r.kind === "employee") employeeIds.add(r.id);
  }
  return { userIds: [...userIds], employeeIds: [...employeeIds] };
}

/** Парс legacy `assigneeIds: string[]` — інтерпретуємо як User-ів. */
export function fromLegacyUserIds(ids: string[] | undefined | null): AssigneeRef[] {
  if (!ids) return [];
  return ids.filter(Boolean).map((id) => ({ kind: "user" as const, id }));
}

/**
 * Перевіряє, що всі User та Employee у списку належать заданій фірмі.
 * Кидає Error зі status=400 при некоректних id або status=403 при cross-firm.
 */
export async function assertAssigneesInFirm(
  refs: AssigneeRef[],
  firmId: string,
): Promise<void> {
  const { userIds, employeeIds } = splitAssignees(refs);

  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firmId: true },
    });
    if (users.length !== userIds.length) {
      throwError("Один або кілька призначених користувачів не знайдено", 400);
    }
    const bad = users.find((u) => u.firmId && u.firmId !== firmId);
    if (bad) {
      throwError("Призначений користувач належить до іншої фірми", 403);
    }
  }

  if (employeeIds.length) {
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firmId: true, isActive: true },
    });
    if (employees.length !== employeeIds.length) {
      throwError("Один або кілька призначених співробітників не знайдено", 400);
    }
    const wrongFirm = employees.find((e) => e.firmId !== firmId);
    if (wrongFirm) {
      throwError("Призначений співробітник належить до іншої фірми", 403);
    }
    const inactive = employees.find((e) => !e.isActive);
    if (inactive) {
      throwError("Не можна призначити неактивного співробітника", 400);
    }
  }
}

function throwError(message: string, status: number): never {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  throw e;
}
