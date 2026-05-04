import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  type EmployeeRecord,
  redactSalaryForHr,
  stripSalaryWritesForHr,
} from "@/lib/hr/employee-privacy";

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return { error: forbiddenResponse() };
  }
  return { session };
}

const nullableString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v));

const emailField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Невірний email",
  });

const dateField = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !isNaN(d.getTime()), { message: "Невірна дата" });

const createSchema = z.object({
  fullName: z.string().trim().min(1, "ПІБ обовʼязкове").optional(),
  lastName: nullableString,
  firstName: nullableString,
  middleName: nullableString,
  phone: nullableString,
  email: emailField,
  position: nullableString,
  birthDate: dateField,
  residence: nullableString,
  maritalStatus: nullableString,
  hiredAt: dateField,
  terminatedAt: dateField,
  salaryType: z.enum(["MONTHLY", "HOURLY"]).default("MONTHLY"),
  salaryAmount: z.number().nonnegative().optional().nullable(),
  currency: z.string().trim().default("UAH"),
  extraData: nullableString,
  notes: nullableString,
  isActive: z.boolean().default(true),
  departmentId: z.string().trim().nullable().optional().transform((v) => v ?? null),
  deferralType: z.enum(["NONE", "RESERVATION", "DEFERMENT"]).default("NONE"),
  deferralUntil: dateField,
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
});

function composeFullName(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
  middleName: string | null | undefined,
): string {
  return [lastName, firstName, middleName]
    .map((p) => p?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;

  const employees = await prisma.employee.findMany({
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    include: { department: { select: { id: true, name: true } } },
  });
  const role = g.session.user.role;
  const data = employees.map((e) => redactSalaryForHr(e as EmployeeRecord, role));
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const body = await request.json();
  const parsed = createSchema.safeParse(stripSalaryWritesForHr(body, g.session.user.role));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  // Якщо клієнт не передав fullName — складаємо з частин імені.
  const composedFullName = composeFullName(data.lastName, data.firstName, data.middleName);
  const fullName = data.fullName?.trim() || composedFullName;
  if (!fullName) {
    return NextResponse.json(
      { error: "ПІБ обовʼязкове (вкажіть Прізвище або повне імʼя)" },
      { status: 400 },
    );
  }
  const employee = await prisma.employee.create({ data: { ...data, fullName } });
  return NextResponse.json(
    { data: redactSalaryForHr(employee as EmployeeRecord, g.session.user.role) },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const body = await request.json();
  const parsed = updateSchema.safeParse(stripSalaryWritesForHr(body, g.session.user.role));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id, ...data } = parsed.data;
  // Якщо змінилася будь-яка з частин імені — пересчитуємо fullName, щоб
  // legacy пошук/displays не розʼїхалися. Беремо актуальні дані з БД для
  // не-перевизначених полів.
  const namePartTouched =
    "lastName" in data || "firstName" in data || "middleName" in data;
  let fullNameOverride: string | undefined;
  if (namePartTouched && data.fullName === undefined) {
    const cur = await prisma.employee.findUnique({
      where: { id },
      select: { lastName: true, firstName: true, middleName: true, fullName: true },
    });
    if (cur) {
      const lastName = "lastName" in data ? data.lastName : cur.lastName;
      const firstName = "firstName" in data ? data.firstName : cur.firstName;
      const middleName = "middleName" in data ? data.middleName : cur.middleName;
      const composed = composeFullName(lastName, firstName, middleName);
      if (composed) fullNameOverride = composed;
    }
  }
  const finalData =
    fullNameOverride !== undefined ? { ...data, fullName: fullNameOverride } : data;
  const employee = await prisma.employee.update({ where: { id }, data: finalData });
  return NextResponse.json({
    data: redactSalaryForHr(employee as EmployeeRecord, g.session.user.role),
  });
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Відсутній id" }, { status: 400 });
  }

  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
