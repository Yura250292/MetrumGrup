import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function canManage(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "HR";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      department: true,
      leadEmployee: { select: { id: true, fullName: true } },
      members: {
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              user: { select: { id: true, avatar: true, role: true } },
            },
          },
          user: { select: { id: true, name: true, avatar: true, role: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Адаптуємо payload до UI: lead/members містять { id, name, avatar }.
  // Для нових Employee-based членів `id` — це employeeId. Якщо до співробітника
  // привʼязаний акаунт, користуємось його avatar; інакше — null.
  const { leadEmployee, members, ...rest } = team;
  const data = {
    ...rest,
    lead: leadEmployee
      ? { id: leadEmployee.id, name: leadEmployee.fullName }
      : null,
    members: members.map((m) => {
      if (m.employee) {
        return {
          id: m.id,
          joinedAt: m.joinedAt,
          user: {
            id: m.employee.id,
            name: m.employee.fullName,
            avatar: m.employee.user?.avatar ?? null,
            role: m.employee.user?.role ?? null,
          },
        };
      }
      // Legacy: запис з лише userId (не змігровано на employee).
      return {
        id: m.id,
        joinedAt: m.joinedAt,
        user: m.user
          ? { id: m.user.id, name: m.user.name ?? "", avatar: m.user.avatar, role: m.user.role }
          : null,
      };
    }),
  };
  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canManage(session.user.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const updated = await prisma.team.update({
    where: { id: teamId },
    data: {
      name: typeof body.name === "string" ? body.name : undefined,
      description:
        body.description === undefined
          ? undefined
          : body.description
            ? String(body.description).trim()
            : null,
      departmentId: body.departmentId === undefined ? undefined : body.departmentId,
      leadEmployeeId:
        body.leadEmployeeId === undefined ? undefined : body.leadEmployeeId,
      color: typeof body.color === "string" ? body.color : undefined,
    },
  });
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canManage(session.user.role)) return forbiddenResponse();
  await prisma.team.delete({ where: { id: teamId } });
  return NextResponse.json({ ok: true });
}
