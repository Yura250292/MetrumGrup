import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function canManage(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
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
  const userId = String(body.userId ?? "");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    update: {},
    create: { teamId, userId },
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
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.teamMember
    .delete({ where: { teamId_userId: { teamId, userId } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
