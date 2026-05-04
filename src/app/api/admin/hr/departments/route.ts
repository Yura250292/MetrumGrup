import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return { error: forbiddenResponse() };
  }
  return { session };
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Назва обовʼязкова"),
});

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ data: departments });
}

export async function POST(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const name = parsed.data.name.trim();
  // Idempotent: if a department with this name exists, return it.
  const existing = await prisma.department.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ data: existing });
  }
  const created = await prisma.department.create({ data: { name } });
  return NextResponse.json({ data: created }, { status: 201 });
}
