import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { numberToDecimal } from "@/lib/financial-calculations";
import type { TaxationType } from "@prisma/client";

// GET /api/admin/financial-templates
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "FINANCIER" && session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  const templates = await prisma.financialTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return NextResponse.json({ data: templates });
}

// POST /api/admin/financial-templates
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "FINANCIER" && session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const { name, description, taxationType, globalMarginPercent, logisticsCost = 0, categoryMargins = {} } = await request.json();

    if (!name || !taxationType || globalMarginPercent == null) {
      return NextResponse.json({ error: "Не вказані обов'язкові поля" }, { status: 400 });
    }

    const template = await prisma.financialTemplate.create({
      data: {
        name,
        description,
        taxationType: taxationType as TaxationType,
        globalMarginPercent: numberToDecimal(globalMarginPercent),
        logisticsCost: numberToDecimal(logisticsCost),
        categoryMargins,
        createdById: session.user.id,
      },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entity: "FinancialTemplate",
        entityId: template.id,
        userId: session.user.id,
        newData: { name, taxationType, globalMarginPercent },
      },
    });

    return NextResponse.json({ data: template, message: "Шаблон створено успішно" });
  } catch (error) {
    return NextResponse.json({ error: "Помилка створення шаблону" }, { status: 500 });
  }
}
