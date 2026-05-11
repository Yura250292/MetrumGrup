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
  // ЗП — лише фінансові ролі (SUPER_ADMIN + FINANCIER). MANAGER/HR не пропускаються.
  if (!canViewFinance(session.user.role)) {
    return { error: forbiddenResponse() };
  }
  return { session };
}

const dateField = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), { message: "Невірна дата" });

const createSchema = z.object({
  baseSalary: z.number().nonnegative(),
  officialPart: z.number().nonnegative().nullable().optional(),
  coefficient: z.number().min(-1_000_000_000).default(0),
  description: z.string().trim().nullable().optional().transform((v) => v ?? null),
  effectiveFrom: z
    .string()
    .min(1, "Початок дії обовʼязковий")
    .transform((v) => new Date(v))
    .refine((d) => !Number.isNaN(d.getTime()), { message: "Невірна дата" }),
  effectiveTo: dateField,
  currency: z.string().trim().default("UAH"),
});

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canViewFinance(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const salaries = await prisma.employeeSalary.findMany({
    where: { employeeId: id },
    orderBy: [{ effectiveFrom: "desc" }],
  });
  return NextResponse.json({ data: salaries });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await ctx.params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Співробітника не знайдено" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.effectiveTo && parsed.data.effectiveTo < parsed.data.effectiveFrom) {
    return NextResponse.json(
      { error: "Кінець дії не може бути раніше за початок" },
      { status: 400 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    // Закриваємо ВСЕ ще відкриті записи (effectiveTo IS NULL), які
    // починалися раніше нового effectiveFrom — чтоби не було перекриття.
    if (!parsed.data.effectiveTo) {
      await tx.employeeSalary.updateMany({
        where: {
          employeeId: id,
          effectiveTo: null,
          effectiveFrom: { lt: parsed.data.effectiveFrom },
        },
        data: { effectiveTo: parsed.data.effectiveFrom },
      });
    }
    const row = await tx.employeeSalary.create({
      data: {
        employeeId: id,
        baseSalary: parsed.data.baseSalary,
        officialPart: parsed.data.officialPart ?? null,
        coefficient: parsed.data.coefficient ?? 0,
        description: parsed.data.description,
        effectiveFrom: parsed.data.effectiveFrom,
        effectiveTo: parsed.data.effectiveTo,
        currency: parsed.data.currency,
      },
    });
    await syncEmployeeSalaryCache(id, tx);
    return row;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
