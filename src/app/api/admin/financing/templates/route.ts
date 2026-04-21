import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json({ error: "folderId обов'язковий" }, { status: 400 });
  }

  const templates = await prisma.financeExpenseTemplate.findMany({
    where: { folderId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      defaultAmount: true,
      type: true,
      category: true,
      counterparty: true,
      description: true,
      emoji: true,
      sortOrder: true,
    },
  });

  return NextResponse.json({
    data: templates.map((t) => ({ ...t, defaultAmount: Number(t.defaultAmount) })),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  try {
    const body = await request.json();
    const { folderId, name, defaultAmount, type, category, counterparty, description, emoji } = body;

    if (!folderId || typeof folderId !== "string") {
      return NextResponse.json({ error: "folderId обов'язковий" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });
    }
    const amount = Number(defaultAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Сума має бути > 0" }, { status: 400 });
    }
    if (type !== "EXPENSE" && type !== "INCOME") {
      return NextResponse.json({ error: "Тип має бути EXPENSE або INCOME" }, { status: 400 });
    }
    if (!category || !FINANCE_CATEGORY_LABELS[category]) {
      return NextResponse.json({ error: "Некоректна категорія" }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true, domain: true },
    });
    if (!folder || folder.domain !== "FINANCE") {
      return NextResponse.json({ error: "Папка не знайдена" }, { status: 404 });
    }

    const lastOrder = await prisma.financeExpenseTemplate.aggregate({
      where: { folderId },
      _max: { sortOrder: true },
    });

    const template = await prisma.financeExpenseTemplate.create({
      data: {
        folderId,
        name: name.trim(),
        defaultAmount: new Prisma.Decimal(amount),
        type,
        category,
        counterparty: typeof counterparty === "string" && counterparty.trim() ? counterparty.trim() : null,
        description: typeof description === "string" ? description : null,
        emoji: typeof emoji === "string" ? emoji.slice(0, 4) : null,
        sortOrder: (lastOrder._max.sortOrder ?? 0) + 10,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(
      {
        data: { ...template, defaultAmount: Number(template.defaultAmount) },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[templates/POST] error:", error);
    return NextResponse.json({ error: "Помилка створення шаблону" }, { status: 500 });
  }
}
