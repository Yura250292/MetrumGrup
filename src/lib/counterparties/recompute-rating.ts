import { Prisma } from "@prisma/client";

/**
 * Перераховує денормалізовані поля `avgRating`, `totalReviews`, `totalProjects`
 * на `Counterparty` після insert / update / delete у `CounterpartyReview`.
 *
 * Викликається ВСЕРЕДИНІ `prisma.$transaction(...)` (приймає tx-клієнт), щоб
 * recompute + review-mutation були атомарними.
 *
 * Округлення: HALF_UP до 2 знаків (Decimal.toFixed(2) у JS HALF_AWAY_FROM_ZERO,
 * що для додатних чисел еквівалентно HALF_UP).
 */
export async function recomputeCounterpartyRating(
  tx: Prisma.TransactionClient,
  counterpartyId: string,
): Promise<void> {
  const reviews = await tx.counterpartyReview.findMany({
    where: { counterpartyId },
    select: {
      qualityScore: true,
      timelinessScore: true,
      priceScore: true,
      communicationScore: true,
      projectId: true,
    },
  });

  if (reviews.length === 0) {
    await tx.counterparty.update({
      where: { id: counterpartyId },
      data: { avgRating: null, totalReviews: 0, totalProjects: 0 },
    });
    return;
  }

  const sumOverall = reviews.reduce(
    (acc, r) =>
      acc +
      (r.qualityScore + r.timelinessScore + r.priceScore + r.communicationScore) /
        4,
    0,
  );
  const avg = sumOverall / reviews.length;
  // HALF_UP до 2 знаків — використовуємо строкове округлення для точності.
  const rounded = Math.round(avg * 100) / 100;

  const uniqueProjects = new Set(reviews.map((r) => r.projectId)).size;

  await tx.counterparty.update({
    where: { id: counterpartyId },
    data: {
      avgRating: new Prisma.Decimal(rounded.toFixed(2)),
      totalReviews: reviews.length,
      totalProjects: uniqueProjects,
    },
  });
}

/**
 * Розраховує overall rating (Decimal(2,1)) з 4 component scores (1..5).
 * Викликається перед записом review у DB.
 */
export function computeOverallRating(opts: {
  qualityScore: number;
  timelinessScore: number;
  priceScore: number;
  communicationScore: number;
}): Prisma.Decimal {
  const avg =
    (opts.qualityScore +
      opts.timelinessScore +
      opts.priceScore +
      opts.communicationScore) /
    4;
  // Decimal(2,1) — округлюємо до 1 знаку HALF_UP.
  const rounded = Math.round(avg * 10) / 10;
  return new Prisma.Decimal(rounded.toFixed(1));
}
