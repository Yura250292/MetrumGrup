/**
 * Historical Internal Provider
 *
 * Шукає ціну у власному корпусі минулих кошторисів (EstimateItemIndex).
 * Запускається ПЕРШИМ у chain — власні дані цінніші за публічний catalog.
 *
 * Логіка:
 *   1. Нормалізуємо description → workName (exact match по індексу)
 *   2. Фільтруємо за firmId + projectType + qualityTier (якщо передано)
 *   3. Якщо знайшли ≥3 рядки за останні 12 місяців → повертаємо середнє
 *      з confidence 0.95
 *   4. Якщо знайшли 1-2 → confidence 0.7 (нижче floor → engine піде далі)
 *   5. Якщо нічого — null
 *
 * Регіональність / brand selection / inflation — TODO для V2.
 */

import { prisma } from '@/lib/prisma';
import { normalizeDescription, normalizeUnit } from '../normalizer';
import type { PriceProvider, PriceQuery, PriceResult } from '../types';

const MIN_SAMPLES_FOR_HIGH_CONFIDENCE = 3;
const LOOKBACK_DAYS = 365;

export const historicalProvider: PriceProvider = {
  name: 'historical-internal',
  sourceType: 'manual', // використовуємо 'manual' тип (weight 1.0) для самописних/власних
  async lookup(query: PriceQuery): Promise<PriceResult | null> {
    const workName = normalizeDescription(query.description);
    const unit = normalizeUnit(query.unit);
    if (!workName) return null;

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // Жорсткий фільтр: workName + unit + firmId (з контексту caller'а — наразі немає; додати в PriceQuery пізніше)
    const where: any = {
      workName,
      unit,
      createdAt: { gte: since },
    };

    // Якщо contextual filters заданo через canonicalKey/region/qualityTier — застосовуємо.
    if (query.qualityTier) {
      where.qualityTier = query.qualityTier;
    }
    if (query.region) {
      where.region = query.region;
    }

    const stats = await prisma.estimateItemIndex.aggregate({
      where,
      _avg: { unitPrice: true, laborCost: true },
      _count: true,
    });

    const count = stats._count;
    const avgPrice = Number(stats._avg.unitPrice ?? 0);
    const avgLabor = Number(stats._avg.laborCost ?? 0);

    if (count === 0 || avgPrice <= 0) {
      return null;
    }

    // High-confidence path: ≥ N samples
    if (count >= MIN_SAMPLES_FOR_HIGH_CONFIDENCE) {
      return {
        unitPrice: avgPrice,
        laborCost: avgLabor > 0 ? avgLabor : undefined,
        source: `Метрум корпус (${count} кошторисів)`,
        sourceType: 'manual',
        rawConfidence: 0.95,
        confidence: 0.95,
        sourceDate: new Date(),
        notes: `Середня ціна з власної історії за останній рік. Зразків: ${count}.`,
      };
    }

    // Weak signal: ~0.7 (нижче CONFIDENCE_FLOOR=0.75 → engine спробує далі)
    return {
      unitPrice: avgPrice,
      laborCost: avgLabor > 0 ? avgLabor : undefined,
      source: `Метрум корпус (${count} ${count === 1 ? 'кошторис' : 'кошториси'})`,
      sourceType: 'manual',
      rawConfidence: 0.7,
      confidence: 0.7,
      sourceDate: new Date(),
      notes: `Замало зразків (${count}) — можливо engine візьме catalog/llm натомість.`,
    };
  },
};
