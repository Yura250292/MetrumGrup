import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { calculateTaxesLLCWithVAT, calculateTaxesFOP3rdGroup } from "@/lib/financial-calculations";

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
      const subtotal = baseTotal.plus(totalProfitAmount);
      const totalWithProfitAndLogistics = subtotal.plus(logisticsCostDecimal);

      // Calculate detailed tax breakdown
      let taxRate = new Decimal(0);
      let taxAmount = new Decimal(0);
      let pdvAmount = new Decimal(0);
      let esvAmount = new Decimal(0);
      let militaryTaxAmount = new Decimal(0);
      let profitTaxAmount = new Decimal(0);
      let unifiedTaxAmount = new Decimal(0);
      let pdfoAmount = new Decimal(0);
      let totalTaxBurden = new Decimal(0);
      let netProfit = new Decimal(0);
      let effectiveTaxRate = new Decimal(0);

      if (taxationType === "FOP") {
        // ФОП 3 група - детальний розрахунок
        const fopTaxes = calculateTaxesFOP3rdGroup({
          subtotal: subtotal.toNumber(),
          totalMargin: totalProfitAmount.toNumber(),
        });

        taxRate = new Decimal(5); // ВИПРАВЛЕНО: було 6%, правильно 5%
        unifiedTaxAmount = new Decimal(fopTaxes.unifiedTaxAmount);
        esvAmount = new Decimal(fopTaxes.esvAmount);
        militaryTaxAmount = new Decimal(fopTaxes.militaryTaxAmount);
        totalTaxBurden = new Decimal(fopTaxes.totalTaxAmount);
        netProfit = new Decimal(fopTaxes.netProfit);
        effectiveTaxRate = new Decimal(fopTaxes.effectiveTaxRate);

        // Для клієнта показуємо тільки єдиний податок
        taxAmount = unifiedTaxAmount;
      } else if (taxationType === "VAT") {
        // ТОВ з ПДВ - детальний розрахунок
        const vatTaxes = calculateTaxesLLCWithVAT({
          subtotal: subtotal.toNumber(),
          totalLabor: estimate.totalLabor.toNumber(),
          totalMargin: totalProfitAmount.toNumber(),
        });

        taxRate = new Decimal(20);
        pdvAmount = new Decimal(vatTaxes.pdvAmount);
        esvAmount = new Decimal(vatTaxes.esvAmount);
        pdfoAmount = new Decimal(vatTaxes.pdfoAmount);
        militaryTaxAmount = new Decimal(vatTaxes.militaryTaxAmount);
        profitTaxAmount = new Decimal(vatTaxes.profitTaxAmount);
        totalTaxBurden = new Decimal(vatTaxes.totalTaxAmount);
        netProfit = new Decimal(vatTaxes.netProfit);
        effectiveTaxRate = new Decimal(vatTaxes.effectiveTaxRate);

        // Для клієнта показуємо тільки ПДВ (транзитний податок)
        taxAmount = pdvAmount;
      }
      // CASH = 0% tax

      const finalClientPrice = totalWithProfitAndLogistics.plus(taxAmount);

      // Update estimate with detailed tax breakdown
      await tx.estimate.update({
        where: { id },
        data: {
          profitAmount: totalProfitAmount.toDecimalPlaces(2),
          logisticsCost: logisticsCostDecimal.toDecimalPlaces(2),
          taxationType: taxationType || null,
          taxRate: taxRate.toDecimalPlaces(2),
          taxAmount: taxAmount.toDecimalPlaces(2),

          // Детальний розподіл податків
          pdvAmount: pdvAmount.toDecimalPlaces(2),
          esvAmount: esvAmount.toDecimalPlaces(2),
          militaryTaxAmount: militaryTaxAmount.toDecimalPlaces(2),
          profitTaxAmount: profitTaxAmount.toDecimalPlaces(2),
          unifiedTaxAmount: unifiedTaxAmount.toDecimalPlaces(2),
          pdfoAmount: pdfoAmount.toDecimalPlaces(2),

          // Метадані розрахунків
          taxCalculationDetails: taxationType !== "CASH" ? {
            totalTaxAmount: totalTaxBurden.toNumber(),
            netProfit: netProfit.toNumber(),
            effectiveTaxRate: effectiveTaxRate.toNumber(),
            calculatedAt: new Date().toISOString(),
            taxationType,
          } : null,
          taxCalculatedAt: taxationType !== "CASH" ? new Date() : null,

          finalClientPrice: finalClientPrice.toDecimalPlaces(2),
          finalAmount: finalClientPrice.toDecimalPlaces(2),
          financeReviewedById: session.user.id,
          financeReviewedAt: new Date(),
          financeNotes: financeNotes || null,
          status: "APPROVED", // Move to APPROVED after finance review
        },
      });

      // Create tax record for audit trail (only for VAT and FOP)
      if (taxationType === "VAT" || taxationType === "FOP") {
        await tx.taxRecord.create({
          data: {
            estimateId: id,
            taxationType: taxationType,
            pdvAmount: pdvAmount.toDecimalPlaces(2),
            esvAmount: esvAmount.toDecimalPlaces(2),
            militaryTaxAmount: militaryTaxAmount.toDecimalPlaces(2),
            profitTaxAmount: profitTaxAmount.toDecimalPlaces(2),
            unifiedTaxAmount: unifiedTaxAmount.toDecimalPlaces(2),
            pdfoAmount: pdfoAmount.toDecimalPlaces(2),
            totalTaxAmount: totalTaxBurden.toDecimalPlaces(2),
            netProfit: netProfit.toDecimalPlaces(2),
            effectiveTaxRate: effectiveTaxRate.toDecimalPlaces(2),
            calculationDetails: {
              subtotal: subtotal.toNumber(),
              totalLabor: estimate.totalLabor.toNumber(),
              totalMargin: totalProfitAmount.toNumber(),
              logisticsCost: logisticsCostDecimal.toNumber(),
              appliedBy: session.user.id,
              appliedAt: new Date().toISOString(),
            },
          },
        });
      }
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
