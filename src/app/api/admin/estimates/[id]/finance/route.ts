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
      itemMargins, // Array<{ itemId: string, marginPercent: number }>
      logisticsCost,
      taxationType,
      financeNotes,
    } = body;

    // Get current estimate with all items
    const estimate = await prisma.estimate.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Кошторис не знайдено" },
        { status: 404 }
      );
    }

    // Create margin lookup map
    const marginMap = new Map<string, number>();
    itemMargins?.forEach((im: { itemId: string; marginPercent: number }) => {
      marginMap.set(im.itemId, im.marginPercent);
    });

    // Calculate profit for each item and update
    let totalProfitAmount = new Decimal(0);
    let baseTotal = new Decimal(0);

    await prisma.$transaction(async (tx) => {
      // Update each item with its margin
      for (const section of estimate.sections) {
        for (const item of section.items) {
          const itemAmount = new Decimal(item.amount.toString());
          baseTotal = baseTotal.plus(itemAmount);

          const marginPercent = marginMap.get(item.id) || 0;
          const marginAmount = itemAmount.times(new Decimal(marginPercent).div(100));
          const priceWithMargin = itemAmount.plus(marginAmount);

          totalProfitAmount = totalProfitAmount.plus(marginAmount);

          // Update item
          await tx.estimateItem.update({
            where: { id: item.id },
            data: {
              useCustomMargin: true,
              customMarginPercent: new Decimal(marginPercent),
              marginAmount: marginAmount.toDecimalPlaces(2),
              priceWithMargin: priceWithMargin.toDecimalPlaces(2),
            },
          });
        }
      }

      // Add logistics cost to total
      const logisticsCostDecimal = new Decimal(logisticsCost || 0);
      const totalWithProfitAndLogistics = baseTotal.plus(totalProfitAmount).plus(logisticsCostDecimal);

      // Calculate tax
      let taxRate = new Decimal(0);
      let taxAmount = new Decimal(0);

      if (taxationType === "FOP") {
        taxRate = new Decimal(6);
        taxAmount = totalWithProfitAndLogistics.times(taxRate.div(100));
      } else if (taxationType === "VAT") {
        taxRate = new Decimal(20);
        taxAmount = totalWithProfitAndLogistics.times(taxRate.div(100));
      }
      // CASH = 0% tax

      const finalClientPrice = totalWithProfitAndLogistics.plus(taxAmount);

      // Update estimate
      await tx.estimate.update({
        where: { id },
        data: {
          profitAmount: totalProfitAmount.toDecimalPlaces(2),
          logisticsCost: logisticsCostDecimal.toDecimalPlaces(2),
          taxationType: taxationType || null,
          taxRate: taxRate.toDecimalPlaces(2),
          taxAmount: taxAmount.toDecimalPlaces(2),
          finalClientPrice: finalClientPrice.toDecimalPlaces(2),
          finalAmount: finalClientPrice.toDecimalPlaces(2),
          financeReviewedById: session.user.id,
          financeReviewedAt: new Date(),
          financeNotes: financeNotes || null,
          status: "APPROVED", // Move to APPROVED after finance review
        },
      });
    });

    // Get updated estimate
    const updated = await prisma.estimate.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        totalAmount: true,
        profitAmount: true,
        logisticsCost: true,
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
          itemMarginsCount: itemMargins?.length || 0,
          logisticsCost,
          taxationType,
          finalClientPrice: updated?.finalClientPrice.toString(),
        },
      },
    });

    return NextResponse.json({
      data: updated,
      message: "Фінансові налаштування застосовано",
    });
  } catch (error: any) {
    console.error("Error applying financial settings:", error);
    return NextResponse.json(
      { error: error.message || "Помилка застосування фінансових налаштувань" },
      { status: 500 }
    );
  }
}
