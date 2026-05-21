import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function canManage(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "HR";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canManage(session.user.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? "");
  if (!employeeId) {
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  }

  // Тримаємо одночасно employeeId та userId (якщо у співробітника є акаунт),
  // щоб legacy-читачі через User.teamMemberships і далі бачили учасника.
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, userId: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  await prisma.teamMember.upsert({
    where: { teamId_employeeId: { teamId, employeeId } },
    update: { userId: employee.userId ?? null },
    create: { teamId, employeeId, userId: employee.userId ?? null },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canManage(session.user.role)) return forbiddenResponse();

  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");
  if (!employeeId) {
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  }

  await prisma.teamMember
    .delete({ where: { teamId_employeeId: { teamId, employeeId } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
