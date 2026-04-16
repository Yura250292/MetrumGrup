import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import {
  parseListParams,
  buildWhere,
  computeSummary,
  FINANCE_ENTRY_SELECT,
} from "@/lib/financing/queries";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  try {
    const { searchParams } = new URL(request.url);
    const filters = parseListParams(searchParams);
    const where = buildWhere(filters);

    const [data, summary] = await Promise.all([
      prisma.financeEntry.findMany({
        where,
        select: FINANCE_ENTRY_SELECT,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
      computeSummary(where),
    ]);

    return NextResponse.json({ data, summary });
  } catch (error) {
    console.error("[financing/GET] error:", error);
    return NextResponse.json({ error: "Помилка завантаження операцій" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  try {
    const body = await request.json();

    const type = body.type === "INCOME" || body.type === "EXPENSE" ? body.type : null;
    const amountNum = Number(body.amount);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category =
      typeof body.category === "string" && FINANCE_CATEGORY_LABELS[body.category]
        ? body.category
        : null;
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
    const projectId =
      body.projectId === null || body.projectId === "" || body.projectId === undefined
        ? null
        : String(body.projectId);

    if (!type || !Number.isFinite(amountNum) || amountNum <= 0 || !title || !category || !occurredAt || Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json(
        { error: "Обов'язкові поля: тип, сума (>0), категорія, назва, дата" },
        { status: 400 }
      );
    }

    if (projectId) {
      const exists = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: "Проєкт не існує" }, { status: 400 });
      }
    }

    const entry = await prisma.financeEntry.create({
      data: {
        type,
        amount: amountNum,
        currency: typeof body.currency === "string" && body.currency ? body.currency : "UAH",
        occurredAt,
        projectId,
        category,
        subcategory:
          typeof body.subcategory === "string" && body.subcategory.trim() ? body.subcategory.trim() : null,
        title,
        description: typeof body.description === "string" ? body.description : null,
        counterparty:
          typeof body.counterparty === "string" && body.counterparty.trim() ? body.counterparty.trim() : null,
        createdById: session.user.id,
      },
      select: FINANCE_ENTRY_SELECT,
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "FinanceEntry",
      entityId: entry.id,
      projectId: entry.projectId ?? undefined,
      newData: { type: entry.type, amount: Number(entry.amount), category: entry.category, title: entry.title },
    });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error("[financing/POST] error:", error);
    return NextResponse.json({ error: "Помилка створення операції" }, { status: 500 });
  }
}
