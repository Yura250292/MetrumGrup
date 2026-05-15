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

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  headUserId: z.string().trim().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;

  const department = await prisma.department.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      head: { select: { id: true, name: true } },
      employees: {
        orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
        select: { id: true, fullName: true, position: true, isActive: true },
      },
      teams: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          lead: { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!department) {
    return NextResponse.json({ error: "Підрозділ не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ data: department });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.name) {
    const name = parsed.data.name.trim();
    const conflict = await prisma.department.findUnique({ where: { name } });
    if (conflict && conflict.id !== id) {
      return NextResponse.json(
        { error: "Підрозділ із такою назвою вже існує" },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description?.trim() || null }
        : {}),
      ...(parsed.data.headUserId !== undefined
        ? { headUserId: parsed.data.headUserId || null }
        : {}),
    },
  });
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;

  const counts = await prisma.department.findUnique({
    where: { id },
    select: { _count: { select: { employees: true, teams: true } } },
  });
  if (!counts) {
    return NextResponse.json({ error: "Підрозділ не знайдено" }, { status: 404 });
  }
  if (counts._count.employees > 0 || counts._count.teams > 0) {
    return NextResponse.json(
      {
        error:
          "Неможливо видалити — до підрозділу привʼязані співробітники або бригади. " +
          "Спочатку перемістіть або звільніть їх.",
      },
      { status: 409 },
    );
  }

  await prisma.department.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
