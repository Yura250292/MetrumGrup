import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function canManage(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const teams = await prisma.team.findMany({
    include: {
      department: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });
  return NextResponse.json({ data: teams });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canManage(session.user.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const team = await prisma.team.create({
    data: {
      name,
      departmentId: body.departmentId ? String(body.departmentId) : null,
      leadUserId: body.leadUserId ? String(body.leadUserId) : null,
      color: body.color ? String(body.color) : "#3b82f6",
    },
  });
  return NextResponse.json({ data: team }, { status: 201 });
}
