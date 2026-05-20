/**
 * findSimilarEstimates — пошук схожих кошторисів у власному корпусі.
 *
 * MVP логіка: фільтр за projectType + площа в діапазоні ±30% від цільової
 * + firmId scope. Без embeddings. Embeddings — фаза 2.
 *
 * Використовується у:
 *  - master-estimate-agent prompt (контекст: "ось 5 схожих проєктів")
 *  - setup-screen UI ("шаблони з вашого корпусу")
 */

import { prisma } from '@/lib/prisma';

export type SimilarEstimateQuery = {
  /** Тип об'єкта з wizard. */
  projectType?: string;
  /** Цільова площа. Запит шукає в межах [area*0.7 .. area*1.3]. */
  totalAreaM2?: number;
  /** Multi-firm scope — обов'язково передавати для ізоляції. */
  firmId?: string | null;
  /** Бюджетний клас (опціонально для жорсткішого фільтра). */
  qualityTier?: string;
  /** Скільки результатів повертати. */
  limit?: number;
};

export type SimilarEstimateResult = {
  estimateId: string;
  number: string;
  title: string;
  projectId: string;
  projectTitle: string | null;
  totalAmount: number;
  totalAreaM2: number | null;
  pricePerM2: number | null;
  qualityTier: string | null;
  projectType: string | null;
  itemCount: number;
  createdAt: Date;
};

/**
 * Повертає ТОП-N схожих кошторисів зі скоупу firm'и користувача.
 * Сортування: спершу найближчі за площею, потім свіжіші.
 */
export async function findSimilarEstimates(
  query: SimilarEstimateQuery
): Promise<SimilarEstimateResult[]> {
  const limit = query.limit ?? 5;

  // Беремо унікальні estimateId через EstimateItemIndex (там денормалізовано firmId+projectType+totalAreaM2)
  // Це дозволяє не міняти Estimate schema, а тримати весь "пошуковий" контекст в індексі.
  const areaTarget = query.totalAreaM2;
  const areaMin = areaTarget ? areaTarget * 0.7 : undefined;
  const areaMax = areaTarget ? areaTarget * 1.3 : undefined;

  const indexRows = await prisma.estimateItemIndex.groupBy({
    by: ['estimateId', 'totalAreaM2', 'projectType', 'qualityTier'],
    where: {
      firmId: query.firmId ?? null,
      projectType: query.projectType ?? undefined,
      qualityTier: query.qualityTier ?? undefined,
      ...(areaMin && areaMax
        ? { totalAreaM2: { gte: areaMin, lte: areaMax } }
        : {}),
    },
    _count: { _all: true },
    orderBy: { estimateId: 'desc' },
    take: limit * 3, // беремо більше — фільтруємо після підтягування estimate metadata
  });

  if (indexRows.length === 0) return [];

  // Підтягуємо Estimate metadata
  const estimates = await prisma.estimate.findMany({
    where: {
      id: { in: indexRows.map((r) => r.estimateId) },
    },
    select: {
      id: true,
      number: true,
      title: true,
      totalAmount: true,
      createdAt: true,
      projectId: true,
      project: {
        select: { title: true },
      },
    },
  });

  const estimateMap = new Map(estimates.map((e) => [e.id, e]));

  const mapped = indexRows.map((row): SimilarEstimateResult | null => {
    const est = estimateMap.get(row.estimateId);
    if (!est) return null;
    const totalAreaM2 = row.totalAreaM2 ? Number(row.totalAreaM2) : null;
    const totalAmount = Number(est.totalAmount);
    return {
      estimateId: est.id,
      number: est.number,
      title: est.title,
      projectId: est.projectId,
      projectTitle: est.project?.title ?? null,
      totalAmount,
      totalAreaM2,
      pricePerM2:
        totalAreaM2 && totalAreaM2 > 0 ? Math.round(totalAmount / totalAreaM2) : null,
      qualityTier: row.qualityTier,
      projectType: row.projectType,
      itemCount: row._count._all,
      createdAt: est.createdAt,
    };
  });

  const results: SimilarEstimateResult[] = mapped.filter(
    (r): r is SimilarEstimateResult => r !== null
  );

  // Сортуємо: 1) ближча площа, 2) свіжіший
  if (areaTarget) {
    results.sort((a, b) => {
      const da = a.totalAreaM2 ? Math.abs(a.totalAreaM2 - areaTarget) : Infinity;
      const db = b.totalAreaM2 ? Math.abs(b.totalAreaM2 - areaTarget) : Infinity;
      if (da !== db) return da - db;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  } else {
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return results.slice(0, limit);
}

/**
 * Статистика корпусу — для UI dashboard.
 * Скільки кошторисів проіндексовано, скільки унікальних робіт, охоплення.
 */
export async function getCorpusStats(firmId: string | null): Promise<{
  totalIndexedItems: number;
  uniqueWorkNames: number;
  uniqueEstimates: number;
}> {
  const where = { firmId: firmId ?? null };

  const [totalIndexedItems, uniqueWorkNames, uniqueEstimates] = await Promise.all([
    prisma.estimateItemIndex.count({ where }),
    prisma.estimateItemIndex
      .groupBy({ by: ['workName'], where, _count: { _all: true } })
      .then((r) => r.length),
    prisma.estimateItemIndex
      .groupBy({ by: ['estimateId'], where, _count: { _all: true } })
      .then((r) => r.length),
  ]);

  return { totalIndexedItems, uniqueWorkNames, uniqueEstimates };
}
