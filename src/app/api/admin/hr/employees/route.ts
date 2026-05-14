import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, canViewFinance } from "@/lib/auth-utils";
import {
  type EmployeeRecord,
  redactSalaryForHr,
  stripSalaryWritesForHr,
} from "@/lib/hr/employee-privacy";
import {
  AccountSyncError,
  buildEmployeeNameSlice,
  syncUserFromEmployee,
} from "@/lib/hr/account-sync";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  assertCanAccessFirm,
  firmIdForNewEntity,
  firmWhereForEmployee,
} from "@/lib/firm/scope";

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return { error: forbiddenResponse() };
  }
  const { firmId } = await resolveFirmScopeForRequest(session);
  return { session, firmId };
}

// КРИТИЧНО: undefined → undefined (поле не передане → не торкаємо), null/"" → null
// (явна очистка). Старий transform конвертував undefined у null, через що PATCH
// з одним полем стирав усі інші nullable-поля у БД. Регресія була виявлена
// 2026-05-12 на Стецькому після створення підрозділу.
const nullableString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    return v;
  });

const emailField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    return v;
  })
  .refine(
    (v) => v === undefined || v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    { message: "Невірний email" },
  );

const dateField = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  })
  .refine((d) => d === undefined || d === null || !isNaN(d.getTime()), {
    message: "Невірна дата",
  });

const createSchema = z.object({
  fullName: z.string().trim().min(1, "ПІБ обовʼязкове").optional(),
  lastName: nullableString,
  firstName: nullableString,
  middleName: nullableString,
  phone: nullableString,
  email: emailField,
  position: nullableString,
  birthDate: dateField,
  // residence/maritalStatus — колонки лишилися, на UI не показуються,
  // але приймаємо через Excel-імпорт (історичні дані).
  residence: nullableString,
  maritalStatus: nullableString,
  hiredAt: dateField,
  terminatedAt: dateField,
  notes: nullableString,
  isActive: z.boolean().default(true),
  departmentId: z.string().trim().nullable().optional().transform((v) => v ?? null),
  deferralType: z.enum(["NONE", "RESERVATION", "DEFERMENT"]).default("NONE"),
  deferralUntil: dateField,
  employmentType: z.enum(["FULL", "PART", "CONTRACT"]).default("FULL"),
  employmentRate: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "" || v === null) return undefined;
      const n = typeof v === "string" ? Number(v) : v;
      return Number.isFinite(n) ? n : undefined;
    })
    .refine((v) => v === undefined || (v >= 0.1 && v <= 2.0), {
      message: "Ставка зайнятості має бути в діапазоні 0.10 – 2.00",
    }),
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

  const role = g.session.user.role;
  // Salaries — лише фінансові ролі (SUPER_ADMIN + FINANCIER). MANAGER/HR — ні.
  const canSeeSalary = canViewFinance(role);

  const employees = await prisma.employee.findMany({
    where: firmWhereForEmployee(g.firmId),
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    include: {
      department: { select: { id: true, name: true } },
      user: {
        select: { id: true, email: true, role: true, isActive: true },
      },
      // Активний ЗП-період (один) — для зведеної індикації у картці.
      // Не-фінансові ролі не бачать → query skip + redact.
      salaries: canSeeSalary
        ? {
            orderBy: [{ effectiveFrom: "desc" }],
            take: 1,
          }
        : false,
    },
  });
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
  const firmId = firmIdForNewEntity(g.session);
  const employee = await prisma.employee.create({
    data: { ...data, fullName, firmId },
  });
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
  // Firm-isolation: перевіряємо, що Employee, який редагується, належить
  // фірмі, до якої поточний користувач має доступ.
  const target = await prisma.employee.findUnique({
    where: { id },
    select: { firmId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Співробітника не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(g.session, target.firmId);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: (e as Error & { status?: number }).status ?? 403 },
    );
  }
  // Якщо змінилася будь-яка з частин імені — пересчитуємо fullName, щоб
  // legacy пошук/displays не розʼїхалися. Беремо актуальні дані з БД для
  // не-перевизначених полів. ВАЖЛИВО: перевіряємо за значенням
  // (не `key in data`), бо після zod-parse усі ключі присутні з undefined.
  const namePartTouched =
    data.lastName !== undefined ||
    data.firstName !== undefined ||
    data.middleName !== undefined;
  let fullNameOverride: string | undefined;
  if (namePartTouched && data.fullName === undefined) {
    const cur = await prisma.employee.findUnique({
      where: { id },
      select: { lastName: true, firstName: true, middleName: true, fullName: true },
    });
    if (cur) {
      const lastName = data.lastName !== undefined ? data.lastName : cur.lastName;
      const firstName = data.firstName !== undefined ? data.firstName : cur.firstName;
      const middleName = data.middleName !== undefined ? data.middleName : cur.middleName;
      const composed = composeFullName(lastName, firstName, middleName);
      if (composed) fullNameOverride = composed;
    }
  }
  const finalData =
    fullNameOverride !== undefined ? { ...data, fullName: fullNameOverride } : data;

  // Якщо до Employee привʼязаний User І зачеплено sync-поля — оновлюємо обидва
  // рядки в одній транзакції (Employee — джерело правди для name/email/phone).
  const syncTriggered =
    data.lastName !== undefined ||
    data.firstName !== undefined ||
    data.middleName !== undefined ||
    data.email !== undefined ||
    data.phone !== undefined ||
    data.isActive !== undefined;

  try {
    const employee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: finalData,
        include: {
          department: { select: { id: true, name: true } },
          user: {
            select: { id: true, email: true, role: true, isActive: true },
          },
        },
      });
      if (syncTriggered && updated.userId) {
        await syncUserFromEmployee(
          tx,
          updated.userId,
          buildEmployeeNameSlice(updated),
        );
      }
      return updated;
    });
    return NextResponse.json({
      data: redactSalaryForHr(employee as EmployeeRecord, g.session.user.role),
    });
  } catch (e) {
    if (e instanceof AccountSyncError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Відсутній id" }, { status: 400 });
  }

  const target = await prisma.employee.findUnique({
    where: { id },
    select: { firmId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Співробітника не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(g.session, target.firmId);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: (e as Error & { status?: number }).status ?? 403 },
    );
  }

  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
