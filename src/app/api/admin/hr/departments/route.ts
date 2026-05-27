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
  description: z.string().trim().optional(),
  headEmployeeId: z.string().trim().optional(),
});

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      headEmployee: { select: { id: true, fullName: true } },
      _count: { select: { employees: true, teams: true } },
    },
  });
  // Адаптуємо payload так, щоб клієнт не знав про різницю User vs Employee:
  // полем `head` далі віддаємо { id, name } — лише тепер це Employee.
  const data = departments.map(({ headEmployee, ...rest }) => ({
    ...rest,
    head: headEmployee
      ? { id: headEmployee.id, name: headEmployee.fullName }
      : null,
  }));
  return NextResponse.json({ data });
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
  const headId = parsed.data.headEmployeeId || null;
  const created = await prisma.$transaction(async (tx) => {
    const dep = await tx.department.create({
      data: {
        name,
        description: parsed.data.description?.trim() || null,
        headEmployeeId: headId,
      },
    });
    // Керівник підрозділу автоматично стає його працівником.
    if (headId) {
      await tx.employee.update({
        where: { id: headId },
        data: { departmentId: dep.id },
      });
    }
    return dep;
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
