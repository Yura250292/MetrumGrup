import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

/**
 * Recomputes totals for an estimate based on its items.
 *
 * MVP3 scope: only `totalAmount`, `finalAmount` are recomputed.
 * Profit margins, taxes, prozorro analysis remain untouched —
 * those are recalculated through the dedicated finance flow.
 */
export async function recomputeEstimateTotals(estimateId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      discount: true,
      profitMarginOverall: true,
      taxAmount: true,
      items: {
        select: { amount: true, laborRate: true, laborHours: true },
      },
    },
  });
  if (!estimate) return;

  const totalAmount = estimate.items.reduce(
    (sum, item) => sum.plus(item.amount),
    new Decimal(0)
  );

  const totalLabor = estimate.items.reduce(
    (sum, item) => sum.plus(new Decimal(item.laborRate).times(item.laborHours)),
    new Decimal(0)
  );

  // Materials = total minus labor. The previous `materialId`-based filter
  // returned 0 for AI-generated items (no materialId is set on them).
  const totalMaterials = totalAmount.minus(totalLabor);

  const discount = new Decimal(estimate.discount ?? 0);
  const finalAmount = totalAmount.times(new Decimal(1).minus(discount.div(100)));

  const profitMargin = new Decimal(estimate.profitMarginOverall ?? 0);
  const taxAmount = new Decimal(estimate.taxAmount ?? 0);
  const finalClientPrice = finalAmount
    .times(new Decimal(1).plus(profitMargin.div(100)))
    .plus(taxAmount);

  await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      totalAmount: totalAmount.toFixed(2),
      totalMaterials: totalMaterials.toFixed(2),
      totalLabor: totalLabor.toFixed(2),
      finalAmount: finalAmount.toFixed(2),
      finalClientPrice: finalClientPrice.toFixed(2),
    },
  });
}
