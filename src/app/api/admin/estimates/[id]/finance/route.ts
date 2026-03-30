import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

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
      profitMarginMaterials,
      profitMarginLabor,
      profitMarginOverall,
      taxationType,
      financeNotes,
    } = body;

    // Get current estimate
    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: {
        totalMaterials: true,
        totalLabor: true,
        totalOverhead: true,
        totalAmount: true,
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Кошторис не знайдено" },
        { status: 404 }
      );
    }

    // Calculate profit
    const materials = new Decimal(estimate.totalMaterials.toString());
    const labor = new Decimal(estimate.totalLabor.toString());
    const overhead = new Decimal(estimate.totalOverhead.toString());
    const baseTotal = materials.plus(labor).plus(overhead);

    let profitAmount = new Decimal(0);

    // If individual margins specified for materials and labor
    if (profitMarginMaterials !== undefined && profitMarginLabor !== undefined) {
      const materialsProfit = materials.times(new Decimal(profitMarginMaterials).div(100));
      const laborProfit = labor.plus(overhead).times(new Decimal(profitMarginLabor).div(100));
      profitAmount = materialsProfit.plus(laborProfit);
    } else {
      // Use overall profit margin
      const margin = new Decimal(profitMarginOverall || 20);
      profitAmount = baseTotal.times(margin.div(100));
    }

    const totalWithProfit = baseTotal.plus(profitAmount);

    // Calculate tax
    let taxRate = new Decimal(0);
    let taxAmount = new Decimal(0);

    if (taxationType === "FOP") {
      taxRate = new Decimal(6);
      taxAmount = totalWithProfit.times(taxRate.div(100));
    } else if (taxationType === "VAT") {
      taxRate = new Decimal(20);
      taxAmount = totalWithProfit.times(taxRate.div(100));
    }
    // CASH = 0% tax

    const finalClientPrice = totalWithProfit.plus(taxAmount);

    // Update estimate
    const updated = await prisma.estimate.update({
      where: { id },
      data: {
        profitMarginMaterials: profitMarginMaterials !== undefined
          ? new Decimal(profitMarginMaterials)
          : null,
        profitMarginLabor: profitMarginLabor !== undefined
          ? new Decimal(profitMarginLabor)
          : null,
        profitMarginOverall: profitMarginOverall !== undefined
          ? new Decimal(profitMarginOverall)
          : new Decimal(20),
        profitAmount: profitAmount.toDecimalPlaces(2),
        taxationType: taxationType || null,
        taxRate: taxRate.toDecimalPlaces(2),
        taxAmount: taxAmount.toDecimalPlaces(2),
        finalClientPrice: finalClientPrice.toDecimalPlaces(2),
        financeReviewedById: session.user.id,
        financeReviewedAt: new Date(),
        financeNotes: financeNotes || null,
        status: "APPROVED", // Move to APPROVED after finance review
      },
      select: {
        id: true,
        number: true,
        totalAmount: true,
        profitAmount: true,
        taxationType: true,
        taxRate: true,
        taxAmount: true,
        finalClientPrice: true,
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
          profitMarginMaterials,
          profitMarginLabor,
          profitMarginOverall,
          taxationType,
          finalClientPrice: finalClientPrice.toNumber(),
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
