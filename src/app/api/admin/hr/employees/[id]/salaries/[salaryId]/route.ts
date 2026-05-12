import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, canViewFinance } from "@/lib/auth-utils";
import { syncEmployeeSalaryCache } from "@/lib/hr/employee-salary";

export const runtime = "nodejs";

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  // ЗП — лише фінансові ролі (SUPER_ADMIN + FINANCIER).
  if (!canViewFinance(session.user.role)) {
    return { error: forbiddenResponse() };
  }
  return { session };
}

// undefined → undefined (поле не передане → не торкаємо), null/"" → null.
// Старий transform конвертував undefined у null — баг для partial-PATCH.
const dateField = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  })
  .refine(
    (d) => d === undefined || d === null || !Number.isNaN(d.getTime()),
    { message: "Невірна дата" },
  );

const updateSchema = z.object({
  baseSalary: z.number().nonnegative().optional(),
  officialPart: z.number().nonnegative().nullable().optional(),
  coefficient: z.number().optional(),
  description: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v)),
  effectiveFrom: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !Number.isNaN(d.getTime()), { message: "Невірна дата" }),
  effectiveTo: dateField,
  currency: z.string().trim().optional(),
});

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; salaryId: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id, salaryId } = await ctx.params;
  const existing = await prisma.employeeSalary.findUnique({ where: { id: salaryId } });
  if (!existing || existing.employeeId !== id) {
    return NextResponse.json({ error: "Запис ЗП не знайдено" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    const row = await tx.employeeSalary.update({
      where: { id: salaryId },
      data,
    });
    await syncEmployeeSalaryCache(id, tx);
    return row;
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; salaryId: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id, salaryId } = await ctx.params;
  const existing = await prisma.employeeSalary.findUnique({ where: { id: salaryId } });
  if (!existing || existing.employeeId !== id) {
    return NextResponse.json({ error: "Запис ЗП не знайдено" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.employeeSalary.delete({ where: { id: salaryId } });
    await syncEmployeeSalaryCache(id, tx);
  });

  return NextResponse.json({ ok: true });
}
