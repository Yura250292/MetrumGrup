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
  const items = await prisma.department.findMany({
    include: {
      head: { select: { id: true, name: true } },
      _count: { select: { teams: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canManage(session.user.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const created = await prisma.department.create({
    data: {
      name,
      description: body.description ? String(body.description) : null,
      headUserId: body.headUserId ? String(body.headUserId) : null,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
