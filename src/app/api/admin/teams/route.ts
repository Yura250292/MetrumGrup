import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function canManage(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "HR";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const teams = await prisma.team.findMany({
    include: {
      department: { select: { id: true, name: true } },
      leadEmployee: { select: { id: true, fullName: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });
  const data = teams.map(({ leadEmployee, ...rest }) => ({
    ...rest,
    lead: leadEmployee
      ? { id: leadEmployee.id, name: leadEmployee.fullName }
      : null,
  }));
  return NextResponse.json({ data });
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
      description: body.description ? String(body.description).trim() : null,
      departmentId: body.departmentId ? String(body.departmentId) : null,
      leadEmployeeId: body.leadEmployeeId ? String(body.leadEmployeeId) : null,
      color: body.color ? String(body.color) : "#3b82f6",
    },
  });
  return NextResponse.json({ data: team }, { status: 201 });
}
