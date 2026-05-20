/**
 * Historical Estimates Indexer
 *
 * Викликається синхронно з saveEstimate і flatten'ить items кошторису
 * у таблицю EstimateItemIndex. Це джерело правди для:
 *  - historical price provider (price-engine)
 *  - findSimilarEstimates (similarity search через aggregate)
 *
 * MVP: exact-match canonization (lowercase + normalized tokens). AI-based
 * canonization у фазі 2.
 *
 * Чому синхронно: упрощує invariant "estimate is in DB → its items are
 * indexed". Час: ~50 рядків × insertMany — близько 100мс на середньому
 * кошторисі. Якщо стане bottleneck — перевести в queue / setImmediate.
 */

import { prisma } from '@/lib/prisma';
import { normalizeDescription, normalizeUnit } from '@/lib/price-engine/normalizer';

export type IndexerContext = {
  /** Тип об'єкта з wizardData (house / apartment / commercial / office / townhouse). */
  projectType?: string;
  /** economy / standard / premium / luxury з wizardData.budgetRange. */
  qualityTier?: string;
  /** Регіон проєкту (поки опціонально). */
  region?: string;
  /** Загальна площа проєкту для коригування при retrieval (фільтр за діапазоном). */
  totalAreaM2?: number;
};

/**
 * Витягує projectType / qualityTier / region з wizardData JSON.
 * wizardData має різну форму залежно від objectType — нормалізуємо.
 */
export function contextFromWizard(wizardData: any): IndexerContext {
  if (!wizardData) return {};
  const objectType = wizardData.objectType || wizardData.projectType;
  const qualityTier = wizardData.budgetRange || wizardData.qualityTier;
  const region = wizardData.region || wizardData.location || undefined;
  const areaRaw = wizardData.totalArea ?? wizardData.area;
  const totalAreaM2 =
    typeof areaRaw === 'string'
      ? parseFloat(areaRaw.replace(',', '.'))
      : typeof areaRaw === 'number'
        ? areaRaw
        : undefined;

  return {
    projectType: typeof objectType === 'string' ? objectType : undefined,
    qualityTier: typeof qualityTier === 'string' ? qualityTier : undefined,
    region: typeof region === 'string' ? region : undefined,
    totalAreaM2: Number.isFinite(totalAreaM2) && (totalAreaM2 as number) > 0 ? totalAreaM2 : undefined,
  };
}

/**
 * Індексує всі позиції кошторису в EstimateItemIndex. Виконує:
 * 1. Підтягує firmId через Project (Estimate.projectId → Project.firmId)
 * 2. Видаляє попередні індекси для цього estimateId (для re-index)
 * 3. Flatten items → insertMany
 */
export async function indexEstimate(
  estimateId: string,
  context: IndexerContext = {}
): Promise<{ indexed: number; skipped: number }> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      project: { select: { firmId: true } },
      items: {
        select: {
          description: true,
          unit: true,
          unitPrice: true,
          laborRate: true,
          laborHours: true,
          itemType: true,
        },
      },
    },
  });

  if (!estimate || !estimate.items || estimate.items.length === 0) {
    return { indexed: 0, skipped: 0 };
  }

  const firmId = estimate.project?.firmId ?? null;

  // Видаляємо попередні індекси (re-index safe)
  await prisma.estimateItemIndex.deleteMany({
    where: { estimateId },
  });

  const rows = estimate.items
    .map((it) => {
      const workNameRaw = (it.description || '').trim();
      const workName = normalizeDescription(workNameRaw);
      const unitNorm = normalizeUnit(it.unit);
      const unitPrice = Number(it.unitPrice);

      // Skip rows that don't carry useful price signal
      if (!workName || !unitNorm || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        return null;
      }

      const laborCost = Number(it.laborRate) * Number(it.laborHours) || 0;
      const kind = it.itemType === 'material' ? 'material' : 'work';

      return {
        workName,
        workNameRaw,
        unit: unitNorm,
        kind,
        unitPrice,
        laborCost,
        estimateId,
        firmId,
        projectType: context.projectType ?? null,
        qualityTier: context.qualityTier ?? null,
        region: context.region ?? null,
        totalAreaM2: context.totalAreaM2 ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return { indexed: 0, skipped: estimate.items.length };
  }

  await prisma.estimateItemIndex.createMany({
    data: rows,
  });

  return {
    indexed: rows.length,
    skipped: estimate.items.length - rows.length,
  };
}
