import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { EquipmentStatus } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) return forbiddenResponse();

  const equipment = await prisma.equipment.findMany({
    include: { currentProject: { select: { title: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: equipment });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) return forbiddenResponse();

  const body = await request.json();
  const equipment = await prisma.equipment.create({ data: body });
  return NextResponse.json({ data: equipment }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) return forbiddenResponse();

  const { id, ...data } = await request.json();
  const equipment = await prisma.equipment.update({ where: { id }, data });
  return NextResponse.json({ data: equipment });
}
