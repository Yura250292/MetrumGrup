import { NextRequest, NextResponse } from "next/server";
import type { Role, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];
const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const COST_TYPES = ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"] as const;

const updateSchema = z.object({
  hours: z.coerce.number().positive().max(24).optional(),
  hourlyRate: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().nullable().optional(),
  costCodeId: z.string().min(1).nullable().optional(),
  costType: z.enum(COST_TYPES).nullable().optional(),
  date: z.string().min(8).optional(),
  /// Approval transition: true = approve, false = un-approve. Lock if already linked
  /// to a finance entry (payroll has already rolled it up).
  approved: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.timesheet.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data: Prisma.TimesheetUpdateInput = { updatedBy: { connect: { id: session.user.id } } };

  // Locked once payroll has rolled it up.
  if (existing.financeEntryId) {
    const blocked = ["hours", "hourlyRate", "costCodeId", "costType", "date"] as const;
    for (const k of blocked) {
      if (k in parsed.data) {
        return NextResponse.json(
          { error: "Табель уже включений у нарахування ЗП — ці поля редагувати не можна" },
          { status: 409 },
        );
      }
    }
  }

  const p = parsed.data;

  if (p.hours !== undefined || p.hourlyRate !== undefined) {
    const hours = p.hours ?? Number(existing.hours);
    const rate = p.hourlyRate ?? Number(existing.hourlyRate);
    data.hours = hours;
    data.hourlyRate = rate;
    data.amount = +(hours * rate).toFixed(2);
  }
  if ("notes" in p) data.notes = p.notes ?? null;
  if ("costCodeId" in p) {
    if (p.costCodeId) {
      const cc = await prisma.costCode.findUnique({ where: { id: p.costCodeId }, select: { id: true } });
      if (!cc) return NextResponse.json({ error: "Статтю витрат не знайдено" }, { status: 400 });
    }
    data.costCode = p.costCodeId
      ? { connect: { id: p.costCodeId } }
      : { disconnect: true };
  }
  if ("costType" in p) data.costType = p.costType ?? null;
  if (p.date) data.date = new Date(p.date);

  if (p.approved !== undefined) {
    if (!APPROVER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Ви не маєте прав апрувити табелі" }, { status: 403 });
    }
    if (p.approved) {
      data.approvedAt = new Date();
      data.approvedBy = { connect: { id: session.user.id } };
    } else {
      data.approvedAt = null;
      data.approvedBy = { disconnect: true };
    }
  }

  const updated = await prisma.timesheet.update({ where: { id }, data });
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.timesheet.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  if (existing.financeEntryId) {
    return NextResponse.json(
      { error: "Табель уже у нарахуванні ЗП. Спочатку анулюйте відповідну операцію." },
      { status: 409 },
    );
  }

  await prisma.timesheet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
