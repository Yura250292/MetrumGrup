import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function canManage(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
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
      lead: { select: { id: true, name: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, avatar: true, role: true } },
        },
      },
    },
  });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: team });
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
      departmentId: body.departmentId === undefined ? undefined : body.departmentId,
      leadUserId: body.leadUserId === undefined ? undefined : body.leadUserId,
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
