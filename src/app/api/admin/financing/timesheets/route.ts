import { NextRequest, NextResponse } from "next/server";
import type { Role, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];

const COST_TYPES = ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"] as const;

const createSchema = z.object({
  employeeId: z.string().min(1).optional().nullable(),
  workerId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1, "projectId обовʼязковий"),
  costCodeId: z.string().min(1).optional().nullable(),
  costType: z.enum(COST_TYPES).optional().nullable(),
  date: z.string().min(8),
  hours: z.coerce.number().positive().max(24),
  hourlyRate: z.coerce.number().nonnegative(),
  notes: z.string().trim().optional().nullable(),
});

const TIMESHEET_SELECT = {
  id: true,
  employeeId: true,
  workerId: true,
  projectId: true,
  costCodeId: true,
  costType: true,
  date: true,
  hours: true,
  hourlyRate: true,
  amount: true,
  notes: true,
  approvedAt: true,
  approvedById: true,
  financeEntryId: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, fullName: true, position: true } },
  worker: { select: { id: true, name: true, specialty: true } },
  project: { select: { id: true, title: true, slug: true } },
  costCode: { select: { id: true, code: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.TimesheetDefaultArgs["select"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const employeeId = searchParams.get("employeeId") ?? undefined;
  const workerId = searchParams.get("workerId") ?? undefined;
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const approvedRaw = searchParams.get("approved");

  const where: Prisma.TimesheetWhereInput = {
    ...(projectId ? { projectId } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(workerId ? { workerId } : {}),
  };

  if (fromRaw || toRaw) {
    where.date = {
      ...(fromRaw ? { gte: new Date(fromRaw) } : {}),
      ...(toRaw ? { lte: new Date(toRaw) } : {}),
    };
  }

  if (approvedRaw === "true") where.approvedAt = { not: null };
  else if (approvedRaw === "false") where.approvedAt = null;

  const items = await prisma.timesheet.findMany({
    where,
    select: TIMESHEET_SELECT,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // XOR: exactly one of employeeId / workerId must be set.
  const hasEmployee = !!data.employeeId;
  const hasWorker = !!data.workerId;
  if (hasEmployee === hasWorker) {
    return NextResponse.json(
      { error: "Вкажіть або працівника, або робітника (не обидва)" },
      { status: 400 },
    );
  }

  // Verify referenced rows exist.
  const [project, employee, worker, costCode] = await Promise.all([
    prisma.project.findUnique({ where: { id: data.projectId }, select: { id: true } }),
    data.employeeId
      ? prisma.employee.findUnique({ where: { id: data.employeeId }, select: { id: true } })
      : null,
    data.workerId
      ? prisma.worker.findUnique({ where: { id: data.workerId }, select: { id: true } })
      : null,
    data.costCodeId
      ? prisma.costCode.findUnique({ where: { id: data.costCodeId }, select: { id: true } })
      : null,
  ]);
  if (!project) return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 400 });
  if (data.employeeId && !employee)
    return NextResponse.json({ error: "Працівника не знайдено" }, { status: 400 });
  if (data.workerId && !worker)
    return NextResponse.json({ error: "Робітника не знайдено" }, { status: 400 });
  if (data.costCodeId && !costCode)
    return NextResponse.json({ error: "Статтю витрат не знайдено" }, { status: 400 });

  const amount = +(data.hours * data.hourlyRate).toFixed(2);

  const created = await prisma.timesheet.create({
    data: {
      employeeId: data.employeeId ?? null,
      workerId: data.workerId ?? null,
      projectId: data.projectId,
      costCodeId: data.costCodeId ?? null,
      costType: data.costType ?? null,
      date: new Date(data.date),
      hours: data.hours,
      hourlyRate: data.hourlyRate,
      amount,
      notes: data.notes ?? null,
      createdById: session.user.id,
    },
    select: TIMESHEET_SELECT,
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
