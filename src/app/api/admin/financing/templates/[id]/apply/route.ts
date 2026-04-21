import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { FINANCE_ENTRY_SELECT } from "@/lib/financing/queries";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

/**
 * POST /api/admin/financing/templates/[id]/apply
 * Creates a FinanceEntry FACT from this template (one-click expense/income).
 * Body (optional): { amount?, occurredAt?, kind? ("PLAN"|"FACT", default FACT) }
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;

  const template = await prisma.financeExpenseTemplate.findUnique({ where: { id } });
  if (!template || !template.isActive) {
    return NextResponse.json({ error: "Шаблон не знайдено" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const amount = body.amount !== undefined ? Number(body.amount) : Number(template.defaultAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Некоректна сума" }, { status: 400 });
    }

    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json({ error: "Некоректна дата" }, { status: 400 });
    }

    const kind = body.kind === "PLAN" ? "PLAN" : "FACT";

    const entry = await prisma.financeEntry.create({
      data: {
        occurredAt,
        kind,
        type: template.type,
        source: "MANUAL",
        amount: new Prisma.Decimal(amount),
        currency: "UAH",
        projectId: null,
        folderId: template.folderId,
        category: template.category,
        title: template.name,
        description: template.description,
        counterparty: template.counterparty,
        createdById: session.user.id,
        status: "DRAFT",
      },
      select: FINANCE_ENTRY_SELECT,
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "FinanceEntry",
      entityId: entry.id,
      newData: {
        fromTemplate: template.id,
        templateName: template.name,
        amount,
        type: template.type,
      },
    });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error("[templates/apply] error:", error);
    return NextResponse.json({ error: "Помилка створення запису" }, { status: 500 });
  }
}
