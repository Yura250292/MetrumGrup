import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { numberToDecimal } from "@/lib/financial-calculations";
import type { TaxationType } from "@prisma/client";

// GET /api/admin/financial-templates/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "FINANCIER" && session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  const { id } = await params;
  const template = await prisma.financialTemplate.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  if (!template) {
    return NextResponse.json({ error: "Шаблон не знайдено" }, { status: 404 });
  }

  return NextResponse.json({ data: template });
}

// PATCH /api/admin/financial-templates/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "FINANCIER" && session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, taxationType, globalMarginPercent, logisticsCost, categoryMargins } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (taxationType !== undefined) updateData.taxationType = taxationType as TaxationType;
    if (globalMarginPercent !== undefined) updateData.globalMarginPercent = numberToDecimal(globalMarginPercent);
    if (logisticsCost !== undefined) updateData.logisticsCost = numberToDecimal(logisticsCost);
    if (categoryMargins !== undefined) updateData.categoryMargins = categoryMargins;

    const updated = await prisma.financialTemplate.update({
      where: { id },
      data: updateData,
      include: { createdBy: { select: { name: true, email: true } } },
    });

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "FinancialTemplate",
        entityId: id,
        userId: session.user.id,
        newData: updateData,
      },
    });

    return NextResponse.json({ data: updated, message: "Шаблон оновлено успішно" });
  } catch (error) {
    return NextResponse.json({ error: "Помилка оновлення шаблону" }, { status: 500 });
  }
}

// DELETE /api/admin/financial-templates/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const { id } = await params;

    await prisma.financialTemplate.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: "DELETE",
        entity: "FinancialTemplate",
        entityId: id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ message: "Шаблон видалено успішно" });
  } catch (error) {
    return NextResponse.json({ error: "Помилка видалення шаблону" }, { status: 500 });
  }
}
