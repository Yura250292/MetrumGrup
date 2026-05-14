import { NextRequest, NextResponse } from "next/server";
import { Role, type Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import type { AssigneeCandidate } from "@/lib/assignees/types";

const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 0,
  MANAGER: 1,
  HR: 2,
  FINANCIER: 3,
  ENGINEER: 4,
  FOREMAN: 5,
  CLIENT: 9,
};

/**
 * Уніфікований список кандидатів на роль "відповідального" — User + Employee
 * без User. Скоупається по поточній фірмі. Підтримує фільтр за роллю для
 * User (Employee ролі не мають → їх фільтр-роль не виключає).
 *
 * Доступ: SUPER_ADMIN / MANAGER / HR / ENGINEER (узгоджено з консьюмерами:
 * NewTaskModal — менеджер; ResponsibleCell стейджу — інженер/менеджер;
 * ProjectTeam — менеджер; HR-сторінка — HR).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const rolesParam = request.nextUrl.searchParams.get("roles");
  const roles = rolesParam
    ? (rolesParam.split(",").filter(Boolean) as Role[])
    : undefined;
  const q = request.nextUrl.searchParams.get("q")?.trim() || undefined;
  const includeEmployees =
    request.nextUrl.searchParams.get("includeEmployees") !== "0";
  const onlyActive = request.nextUrl.searchParams.get("onlyActive") !== "0";

  const { firmId } = await resolveFirmScopeForRequest(session);
  const activeRole = getActiveRoleFromSession(session, firmId);

  const allowedRoles: (Role | "SUPER_ADMIN")[] = [
    "SUPER_ADMIN",
    "MANAGER",
    "HR",
    "ENGINEER",
  ];
  if (!activeRole || !allowedRoles.includes(activeRole)) {
    return forbiddenResponse();
  }

  // ── User-кандидати ────────────────────────────────────────────────────────
  let userWhere: Prisma.UserWhereInput;
  if (roles && roles.length) {
    userWhere = firmId
      ? {
          OR: [
            { role: "SUPER_ADMIN" as Role },
            { AND: [{ role: { in: roles } }, { firmId }] },
            { firmAccess: { some: { firmId, role: { in: roles } } } },
          ],
        }
      : { role: { in: roles } };
  } else {
    userWhere = firmId
      ? {
          OR: [
            { role: "SUPER_ADMIN" as Role },
            { firmId },
            { firmAccess: { some: { firmId } } },
          ],
        }
      : {};
  }
  if (onlyActive) userWhere = { AND: [userWhere, { isActive: true }] };
  if (q) {
    userWhere = {
      AND: [
        userWhere,
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    };
  }

  // ── Employee-кандидати (без User-облікового запису) ───────────────────────
  let employeeWhere: Prisma.EmployeeWhereInput | null = null;
  if (includeEmployees) {
    employeeWhere = {
      userId: null, // тих, хто має User — вже включено через userWhere
      ...(firmId ? { firmId } : {}),
      ...(onlyActive ? { isActive: true } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { position: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  const [users, employees] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        employeeProfile: {
          select: { position: true, departmentId: true },
        },
      },
    }),
    employeeWhere
      ? prisma.employee.findMany({
          where: employeeWhere,
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            position: true,
            departmentId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const userCandidates: AssigneeCandidate[] = users.map((u) => ({
    kind: "user",
    id: u.id,
    name: u.name,
    email: u.email ?? null,
    phone: u.phone ?? null,
    role: u.role,
    position: u.employeeProfile?.position ?? null,
    departmentId: u.employeeProfile?.departmentId ?? null,
    hasAccount: true,
  }));

  const employeeCandidates: AssigneeCandidate[] = employees.map((e) => ({
    kind: "employee",
    id: e.id,
    name: e.fullName,
    email: e.email ?? null,
    phone: e.phone ?? null,
    role: null,
    position: e.position ?? null,
    departmentId: e.departmentId ?? null,
    hasAccount: false,
  }));

  // Сортування: hasAccount першими (за role priority + name), потім employees за name.
  userCandidates.sort((a, b) => {
    const pa = ROLE_PRIORITY[a.role ?? ""] ?? 99;
    const pb = ROLE_PRIORITY[b.role ?? ""] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name, "uk");
  });
  employeeCandidates.sort((a, b) => a.name.localeCompare(b.name, "uk"));

  return NextResponse.json({
    data: [...userCandidates, ...employeeCandidates],
  });
}
