import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Лайт-список активних співробітників для assignee-picker у формі задачі.
 *
 * Чому окремо від `/api/admin/hr/employees`:
 *  - той ACL обмежений SUPER_ADMIN/MANAGER/HR (бо містить зарплати).
 *  - тут — мінімум полів (ПІБ, email, посада, чи привʼязаний User) і
 *    доступно всім staff (не-CLIENT), бо це лише пошук людини для призначення.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") return forbiddenResponse();

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      position: true,
      // Привʼязаний User (якщо є) — щоб assignee-picker міг додати User'а
      // через `userId`, а не `externalName`.
      user: { select: { id: true, name: true, isActive: true } },
    },
  });

  return NextResponse.json({
    data: employees.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      position: e.position ?? null,
      // Якщо є активний User — використати його id, інакше null
      // (UI запише як externalName з ПІБ employee).
      linkedUserId: e.user?.isActive ? e.user.id : null,
      linkedUserName: e.user?.isActive ? e.user.name : null,
    })),
  });
}
