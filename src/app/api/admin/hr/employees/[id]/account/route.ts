import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { canAssignRole } from "@/app/admin-v2/_lib/role-display";
import {
  AccountSyncError,
  buildEmployeeNameSlice,
  syncUserFromEmployee,
} from "@/lib/hr/account-sync";

export const runtime = "nodejs";

const VALID_ROLES = Object.values(Role) as string[];

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return { error: forbiddenResponse() };
  }
  return { session };
}

const createSchema = z.object({
  email: z.string().trim().email("Невірний email"),
  password: z.string().min(6, "Пароль мін. 6 символів").optional(),
  role: z.string().refine((r) => VALID_ROLES.includes(r), { message: "Невірна роль" }),
});

const linkSchema = z.object({
  existingUserId: z.string().min(1),
});

const patchSchema = z.object({
  role: z.string().optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
});

function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// POST /api/admin/hr/employees/[id]/account
// Body — або { email, password?, role } для нового User,
// або { existingUserId } для привʼязки існуючого.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      lastName: true,
      firstName: true,
      middleName: true,
      fullName: true,
      email: true,
      phone: true,
      isActive: true,
    },
  });
  if (!employee) {
    return NextResponse.json({ error: "Співробітника не знайдено" }, { status: 404 });
  }
  if (employee.userId) {
    return NextResponse.json(
      { error: "До співробітника вже привʼязано акаунт" },
      { status: 409 },
    );
  }

  // Гілка 1: привʼязка існуючого юзера.
  if (typeof body?.existingUserId === "string") {
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
    }
    const target = await prisma.user.findUnique({
      where: { id: parsed.data.existingUserId },
      select: { id: true, role: true, employeeProfile: { select: { id: true } } },
    });
    if (!target) {
      return NextResponse.json({ error: "Користувача не знайдено" }, { status: 404 });
    }
    if (target.employeeProfile) {
      return NextResponse.json(
        { error: "Цей акаунт уже привʼязаний до іншого співробітника" },
        { status: 409 },
      );
    }
    if (!canAssignRole(g.session.user.role, target.role)) {
      return forbiddenResponse();
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.employee.update({
          where: { id },
          data: { userId: target.id },
        });
        await syncUserFromEmployee(tx, target.id, buildEmployeeNameSlice(employee));
      });
    } catch (e) {
      if (e instanceof AccountSyncError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Employee",
        entityId: id,
        userId: g.session.user.id,
        newData: { linkedUserId: target.id },
      },
    });
    return NextResponse.json({ data: { userId: target.id } }, { status: 200 });
  }

  // Гілка 2: створення нового User.
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { email, role } = parsed.data;
  if (!canAssignRole(g.session.user.role, role)) {
    return forbiddenResponse();
  }

  const dup = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (dup) {
    return NextResponse.json(
      { error: "Користувач з таким email вже існує" },
      { status: 409 },
    );
  }

  const password = parsed.data.password ?? generatePassword();
  const hashed = await bcrypt.hash(password, 10);
  const composedName = [employee.lastName, employee.firstName, employee.middleName]
    .map((p) => p?.trim() ?? "")
    .filter(Boolean)
    .join(" ") || employee.fullName;

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: hashed,
        name: composedName || email,
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone,
        role: role as Role,
        // firmId — нехай ставиться як null за замовчуванням; SUPER_ADMIN зможе
        // присвоїти у профілі. У поточних зразках це опціонально.
        isActive: employee.isActive,
      },
      select: { id: true, email: true, role: true, isActive: true },
    });
    await tx.employee.update({
      where: { id },
      data: { userId: user.id },
    });
    return user;
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entity: "User",
      entityId: created.id,
      userId: g.session.user.id,
      newData: { email: created.email, role: created.role, viaEmployeeId: id },
    },
  });

  return NextResponse.json(
    {
      data: {
        userId: created.id,
        email: created.email,
        role: created.role,
        // Повертаємо одноразовий пароль лише якщо він був згенерований.
        oneTimePassword: parsed.data.password ? undefined : password,
      },
    },
    { status: 201 },
  );
}

// PATCH /api/admin/hr/employees/[id]/account
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!employee?.userId) {
    return NextResponse.json(
      { error: "Акаунт не привʼязано" },
      { status: 404 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: employee.userId },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Користувача не знайдено" }, { status: 404 });
  }

  // HR не може чіпати привілейовані акаунти.
  if (!canAssignRole(g.session.user.role, target.role)) {
    return forbiddenResponse();
  }

  const data: Record<string, unknown> = {};
  let oneTimePassword: string | undefined;

  if (parsed.data.role !== undefined) {
    if (!VALID_ROLES.includes(parsed.data.role)) {
      return NextResponse.json({ error: "Невірна роль" }, { status: 400 });
    }
    if (!canAssignRole(g.session.user.role, parsed.data.role)) {
      return forbiddenResponse();
    }
    data.role = parsed.data.role as Role;
  }
  if (parsed.data.isActive !== undefined) {
    data.isActive = parsed.data.isActive;
  }
  if (parsed.data.resetPassword) {
    oneTimePassword = generatePassword();
    data.password = await bcrypt.hash(oneTimePassword, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data,
    select: { id: true, email: true, role: true, isActive: true },
  });

  const auditPayload: Record<string, string | boolean> = {};
  if (parsed.data.role !== undefined) auditPayload.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) auditPayload.isActive = parsed.data.isActive;
  if (parsed.data.resetPassword) auditPayload.passwordReset = true;

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entity: "User",
      entityId: target.id,
      userId: g.session.user.id,
      newData: auditPayload,
    },
  });

  return NextResponse.json({
    data: {
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      oneTimePassword,
    },
  });
}

// DELETE /api/admin/hr/employees/[id]/account
// За замовчуванням лише розривʼязує. ?deactivateUser=1 — додатково гасить User.
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await ctx.params;
  const deactivate = new URL(request.url).searchParams.get("deactivateUser") === "1";

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!employee?.userId) {
    return NextResponse.json({ error: "Акаунт не привʼязано" }, { status: 404 });
  }
  const target = await prisma.user.findUnique({
    where: { id: employee.userId },
    select: { id: true, role: true },
  });
  if (!target) {
    // Звʼязок битий — почистимо FK і повертаємо ок.
    await prisma.employee.update({ where: { id }, data: { userId: null } });
    return NextResponse.json({ ok: true });
  }
  // HR не може відвʼязувати акаунт привілейованого користувача.
  if (!canAssignRole(g.session.user.role, target.role)) {
    return forbiddenResponse();
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { userId: null } });
    if (deactivate) {
      await tx.user.update({ where: { id: target.id }, data: { isActive: false } });
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entity: "Employee",
      entityId: id,
      userId: g.session.user.id,
      newData: { unlinkedUserId: target.id, deactivate },
    },
  });

  return NextResponse.json({ ok: true });
}
