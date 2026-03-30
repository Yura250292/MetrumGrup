import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { configureFinancials } from "@/lib/financial-workflow";
import type { TaxationType } from "@prisma/client";

// PATCH /api/admin/estimates/[id]/finance - Apply financial settings (FINANCIER only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Only FINANCIER and SUPER_ADMIN can modify financial settings
  if (session.user.role !== "FINANCIER" && session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      taxationType,
      globalMarginPercent,
      logisticsCost = 0,
      itemMargins,
      financeNotes,
    } = body;

    // Використати нову логіку з модуля financial-workflow
    await configureFinancials(id, session.user.id, {
      taxationType: taxationType as TaxationType,
      globalMarginPercent: globalMarginPercent || 20,
      logisticsCost: logisticsCost,
      itemMargins: itemMargins,
      notes: financeNotes,
    });

    // Отримати оновлений кошторис
    const updated = await prisma.estimate.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        totalAmount: true,
        profitAmount: true,
        taxationType: true,
        taxRate: true,
        taxAmount: true,
        logisticsCost: true,
        finalAmount: true,
        status: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Estimate",
        entityId: id,
        userId: session.user.id,
        newData: {
          globalMarginPercent,
          taxationType,
          logisticsCost,
          finalAmount: updated?.finalAmount.toString(),
        },
      },
    });

    return NextResponse.json({
      data: updated,
      message: "Фінансові налаштування застосовано",
    });
  } catch (error) {
    console.error("Error applying financial settings:", error);
    return NextResponse.json(
      { error: "Помилка застосування фінансових налаштувань" },
      { status: 500 }
    );
  }
}
