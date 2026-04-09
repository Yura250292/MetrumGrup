/**
 * Prozorro Price Reference System
 * Система пошуку ринкових цін з розпарсених Prozorro кошторисів
 */

import { prisma } from './prisma';
import { Decimal } from '@prisma/client/runtime/library';

export interface PriceReference {
  description: string;
  unit: string;
  unitPrice: number;
  adjustedPrice: number; // Ціна з урахуванням інфляції
  quantity: number;
  totalPrice: number;
  tenderTitle: string;
  tenderDate: Date;
  tenderId: string;
  category?: string;
  ageMonths: number;
  inflationApplied: boolean;
  inflationFactor?: number;
  similarity: number; // 0-100, наскільки схожий опис
}

export interface PriceReferenceOptions {
  maxAge?: number;          // Максимальний вік даних в місяцях (default: 12)
  applyInflation?: boolean; // Чи застосовувати інфляційний коефіцієнт (default: true)
  minSimilarity?: number;   // Мінімальна схожість опису 0-100 (default: 60)
  limit?: number;           // Кількість результатів (default: 10)
}

/**
 * Знайти схожі позиції з Prozorro кошторисів
 */
export async function findSimilarPrices(
  itemDescription: string,
  unit: string,
  options: PriceReferenceOptions = {}
): Promise<PriceReference[]> {
  const {
    maxAge = 12,
    applyInflation = true,
    minSimilarity = 60,
    limit = 10,
  } = options;

  console.log(`🔍 Пошук схожих цін для: "${itemDescription}" (${unit})`);

  try {
    // Витягти ключові слова з опису
    const keywords = extractKeywords(itemDescription);

    if (keywords.length === 0) {
      console.log('⚠️ Немає ключових слів для пошуку');
      return [];
    }

    console.log(`🔑 Ключові слова: ${keywords.join(', ')}`);

    // Дата з якої шукати (maxAge місяців тому)
    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - maxAge);

    // Пошук в БД
    // Використовуємо ILIKE для case-insensitive пошуку по кожному ключовому слову
    const items = await prisma.prozorroEstimateItem.findMany({
      where: {
        unit: {
          contains: unit,
          mode: 'insensitive',
        },
        estimate: {
          datePublished: {
            gte: dateFrom,
          },
          parseStatus: 'success',
        },
        OR: keywords.map(keyword => ({
          description: {
            contains: keyword,
            mode: 'insensitive',
          },
        })),
      },
      include: {
        estimate: {
          include: {
            tender: true,
          },
        },
      },
      take: 100, // Беремо більше для фільтрації
    });

    console.log(`📊 Знайдено ${items.length} потенційних збігів`);

    if (items.length === 0) {
      return [];
    }

    // Розрахувати схожість та відфільтрувати
    const results = (items
      .map(item => {
        const similarity = calculateTextSimilarity(
          itemDescription.toLowerCase(),
          item.description.toLowerCase()
        );

        if (similarity < minSimilarity) {
          return null;
        }

        const ageMonths = getMonthsDifference(
          item.estimate.datePublished,
          new Date()
        );

        // Застосувати інфляцію якщо потрібно
        let adjustedPrice = parseFloat(item.unitPrice.toString());
        let inflationFactor: number | undefined;
        let inflationApplied = false;

        if (applyInflation && ageMonths > 6) {
          const factor = calculateInflationFactor(ageMonths);
          adjustedPrice = adjustedPrice * factor;
          inflationFactor = factor;
          inflationApplied = true;
        }

        return {
          description: item.description,
          unit: item.unit,
          unitPrice: parseFloat(item.unitPrice.toString()),
          adjustedPrice,
          quantity: parseFloat(item.quantity.toString()),
          totalPrice: parseFloat(item.totalPrice.toString()),
          tenderTitle: item.estimate.tenderTitle,
          tenderDate: item.estimate.datePublished,
          tenderId: item.estimate.tenderId,
          category: item.category || undefined,
          ageMonths,
          inflationApplied,
          inflationFactor,
          similarity,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        // Сортувати за схожістю (70%) та свіжістю (30%)
        const scoreA = a.similarity * 0.7 + (1 - a.ageMonths / maxAge) * 30;
        const scoreB = b.similarity * 0.7 + (1 - b.ageMonths / maxAge) * 30;
        return scoreB - scoreA;
      })
      .slice(0, limit)) as PriceReference[];

    console.log(`✅ Повертаємо ${results.length} найкращих збігів`);

    return results;
  } catch (error) {
    console.error('❌ Помилка пошуку цін:', error);
    return [];
  }
}

/**
 * Отримати рекомендовану ціну (медіана з топ-5)
 */
export async function getRecommendedPrice(
  itemDescription: string,
  unit: string,
  options: PriceReferenceOptions = {}
): Promise<{
  price: number;
  confidence: 'high' | 'medium' | 'low';
  references: PriceReference[];
  statistics: {
    count: number;
    min: number;
    max: number;
    median: number;
    average: number;
  };
} | null> {
  const references = await findSimilarPrices(itemDescription, unit, {
    ...options,
    limit: 10,
  });

  if (references.length === 0) {
    return null;
  }

  // Взяти топ-5 для розрахунку
  const top5 = references.slice(0, 5);
  const prices = top5.map(r => r.adjustedPrice).sort((a, b) => a - b);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  const median = prices[Math.floor(prices.length / 2)];

  // Визначити рівень впевненості
  let confidence: 'high' | 'medium' | 'low';
  const avgSimilarity = top5.reduce((sum, r) => sum + r.similarity, 0) / top5.length;

  if (top5.length >= 5 && avgSimilarity >= 80) {
    confidence = 'high';
  } else if (top5.length >= 3 && avgSimilarity >= 70) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    price: median, // Медіана найбільш надійна
    confidence,
    references: top5,
    statistics: {
      count: top5.length,
      min,
      max,
      median,
      average,
    },
  };
}

/**
 * Витягти ключові слова з опису
 */
function extractKeywords(description: string): string[] {
  // Стоп-слова які ігноруємо
  const stopWords = [
    'та', 'і', 'на', 'з', 'для', 'по', 'в', 'у', 'від', 'до', 'за',
    'при', 'без', 'під', 'над', 'або', 'а', 'але', 'як', 'що', 'це',
    'робота', 'роботи', 'монтаж', 'установка', 'влаштування',
  ];

  const words = description
    .toLowerCase()
    .replace(/[^\wа-яіїєґ\s]/g, ' ') // Залишити тільки літери та пробіли
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));

  return [...new Set(words)]; // Унікальні слова
}

/**
 * Розрахувати схожість між двома текстами (0-100)
 * Використовуємо простий алгоритм на основі спільних слів
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(extractKeywords(text1));
  const words2 = new Set(extractKeywords(text2));

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  // Кількість спільних слів
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  // Jaccard similarity
  const similarity = (intersection.size / union.size) * 100;

  return Math.round(similarity);
}

/**
 * Розрахувати різницю в місяцях між датами
 */
function getMonthsDifference(dateFrom: Date, dateTo: Date): number {
  const months =
    (dateTo.getFullYear() - dateFrom.getFullYear()) * 12 +
    (dateTo.getMonth() - dateFrom.getMonth());

  return Math.max(0, months);
}

/**
 * Розрахувати інфляційний коефіцієнт
 * Для тендерів старших 6 місяців застосовуємо +2% на місяць
 */
function calculateInflationFactor(ageMonths: number): number {
  if (ageMonths <= 6) {
    return 1.0; // Свіжі дані, коефіцієнт 1
  }

  // +2% на кожен місяць понад 6
  const monthsOverSix = ageMonths - 6;
  const inflationRate = 0.02; // 2% per month

  const factor = Math.pow(1 + inflationRate, monthsOverSix);

  return Math.round(factor * 100) / 100; // Округлити до 2 знаків
}

/**
 * Отримати статистику по категорії робіт
 */
export async function getCategoryPriceStats(
  category: string,
  maxAge: number = 12
): Promise<{
  category: string;
  itemsCount: number;
  tendersCount: number;
  avgPrice: number;
  priceRange: [number, number];
  lastUpdate: Date | null;
} | null> {
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - maxAge);

  const items = await prisma.prozorroEstimateItem.findMany({
    where: {
      category: {
        contains: category,
        mode: 'insensitive',
      },
      estimate: {
        datePublished: {
          gte: dateFrom,
        },
        parseStatus: 'success',
      },
    },
    include: {
      estimate: {
        select: {
          datePublished: true,
          tenderId: true,
        },
      },
    },
  });

  if (items.length === 0) {
    return null;
  }

  const prices = items.map(i => parseFloat(i.unitPrice.toString()));
  const uniqueTenders = new Set(items.map(i => i.estimate.tenderId));
  const latestDate = items.reduce((latest, item) =>
    item.estimate.datePublished > latest ? item.estimate.datePublished : latest,
    items[0].estimate.datePublished
  );

  return {
    category,
    itemsCount: items.length,
    tendersCount: uniqueTenders.size,
    avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
    priceRange: [Math.min(...prices), Math.max(...prices)],
    lastUpdate: latestDate,
  };
}
