import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor } from "@/lib/firm/scope";

export const runtime = "nodejs";

/**
 * Кандидати на роль "Менеджер проекту":
 *   - User з ролями SUPER_ADMIN / MANAGER / ENGINEER / HR (мають login)
 *   - Employee штату (можуть НЕ мати User-акаунту в CRM)
 *
 * Об'єднано в union із розрізненням `source` (`user` | `employee`):
 *   * source=user → managerId = User.id (FK), managerName = null
 *   * source=employee → managerId = null, managerName = employee.fullName
 *
 * UI Combobox дає юзеру вибрати з єдиного списку. API проектів далі бере
 * правильне поле залежно від `source`.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "MANAGER" &&
    session.user.role !== "HR"
  ) {
    return forbiddenResponse();
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const [users, employees] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "MANAGER", "ENGINEER", "HR"] },
        isActive: true,
        OR: [{ firmId }, { firmId: null }],
      },
      select: { id: true, name: true, role: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { isActive: true, firmId },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        position: true,
        employeeNumber: true,
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  // De-dupe: якщо Employee і User мають однакове ім'я — лишаємо User
  // (Combobox показуватиме лише один варіант з login-можливістю).
  const userNames = new Set(
    users.map((u) => (u.name ?? "").trim().toLowerCase()).filter(Boolean),
  );

  type Candidate = {
    /** Унікальний ключ для Combobox: `user:<id>` або `employee:<id>`. */
    key: string;
    /** Реальний id у відповідній моделі. */
    id: string;
    name: string;
    source: "user" | "employee";
    /** Додатковий контекст для опису в Combobox. */
    description?: string;
  };

  const candidates: Candidate[] = [];

  for (const u of users) {
    if (!u.name) continue;
    candidates.push({
      key: `user:${u.id}`,
      id: u.id,
      name: u.name,
      source: "user",
      description:
        u.role === "SUPER_ADMIN"
          ? "Адмін"
          : u.role === "MANAGER"
            ? "Менеджер"
            : u.role === "ENGINEER"
              ? "Інженер"
              : "HR",
    });
  }

  for (const e of employees) {
    const name = e.fullName?.trim();
    if (!name) continue;
    if (userNames.has(name.toLowerCase())) continue;
    candidates.push({
      key: `employee:${e.id}`,
      id: e.id,
      name,
      source: "employee",
      description:
        [e.position, e.employeeNumber].filter(Boolean).join(" · ") ||
        "Штат",
    });
  }

  return NextResponse.json({ data: candidates });
}
