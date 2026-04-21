import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.financeExpenseTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  try {
    const body = await request.json();
    const data: Parameters<typeof prisma.financeExpenseTemplate.update>[0]["data"] = {};

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.defaultAmount !== undefined) {
      const n = Number(body.defaultAmount);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "Сума має бути > 0" }, { status: 400 });
      }
      data.defaultAmount = new Prisma.Decimal(n);
    }
    if (body.type === "EXPENSE" || body.type === "INCOME") data.type = body.type;
    if (body.category && FINANCE_CATEGORY_LABELS[body.category]) data.category = body.category;
    if ("counterparty" in body) {
      data.counterparty = typeof body.counterparty === "string" && body.counterparty.trim()
        ? body.counterparty.trim()
        : null;
    }
    if ("description" in body) {
      data.description = typeof body.description === "string" ? body.description : null;
    }
    if ("emoji" in body) {
      data.emoji = typeof body.emoji === "string" ? body.emoji.slice(0, 4) : null;
    }
    if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
      data.sortOrder = Number(body.sortOrder);
    }
    if (body.isActive === false || body.isActive === true) data.isActive = body.isActive;

    const updated = await prisma.financeExpenseTemplate.update({ where: { id }, data });
    return NextResponse.json({
      data: { ...updated, defaultAmount: Number(updated.defaultAmount) },
    });
  } catch (error) {
    console.error("[templates/PATCH] error:", error);
    return NextResponse.json({ error: "Помилка оновлення" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.financeExpenseTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  await prisma.financeExpenseTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
