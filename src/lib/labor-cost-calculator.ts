/**
 * Розрахунок вартості робіт з використанням реальних розцінок
 * Пріоритет джерел (highest → lowest):
 *   1. Збірник 15 (офіційні кошторисні норми України, 748 норм) — для оздоблювальних робіт
 *   2. Прайс KAPITEL від 08.09.2025 (Львів/Івано-Франківськ)
 *   3. Існуюча база робіт (work-items-database-extended)
 *   4. Оцінка на основі категорії
 */

import { LABOR_RATES_KAPITEL_2025, findLaborRate, type LaborRate } from './labor-rates-kapitel-2025';
import { WORK_ITEMS_DATABASE, type WorkItemWithPrice } from './work-items-database-extended';
import { findBestZbirnykNorm, detectZbirnykSection } from './zbirnyk-15-search';
import type { Zbirnyk15Norm } from './zbirnyk-15-norms';

export interface LaborCostResult {
  workName: string;
  quantity: number;
  unit: string;
  laborCost: number;
  source: 'zbirnyk_15' | 'kapitel_2025' | 'database' | 'estimated';
  confidence: number; // 0-1
  rate?: LaborRate | WorkItemWithPrice | Zbirnyk15Norm | null;
  notes?: string;
}

/**
 * Головна функція розрахунку вартості робіт.
 * Пріоритет: Збірник 15 → KAPITEL → база робіт → оцінка.
 */
export function calculateLaborCost(
  workName: string,
  quantity: number,
  unit: string
): LaborCostResult {
  // 1. ⭐ НАЙВИЩИЙ ПРІОРИТЕТ: Збірник 15 (офіційні кошторисні норми України)
  //    Покриває: облицювання, штукатурку, малярні, склярські, ліпнину, шпалери
  const section = detectZbirnykSection(workName);
  if (section) {
    const zbMatch = findBestZbirnykNorm(workName, unit, section, 0.3);
    if (zbMatch && zbMatch.similarity >= 0.4) {
      return {
        workName,
        quantity,
        unit,
        laborCost: quantity * zbMatch.norm.laborPrice,
        source: 'zbirnyk_15',
        confidence: Math.min(0.98, 0.7 + zbMatch.similarity * 0.28),
        rate: zbMatch.norm,
        notes: `Збірник 15, норма ${zbMatch.norm.code} (${zbMatch.norm.group}), match=${(zbMatch.similarity * 100).toFixed(0)}%`,
      };
    }
  }

  const searchTerm = workName.toLowerCase();

  // 2. Прайс KAPITEL (Львів/Івано-Франківськ)
  const kapitelRate = findLaborRate(workName);
  if (kapitelRate) {
    return {
      workName,
      quantity,
      unit,
      laborCost: quantity * kapitelRate.price,
      source: 'kapitel_2025',
      confidence: kapitelRate.priceFrom ? 0.85 : 0.95,
      rate: kapitelRate,
      notes: kapitelRate.priceFrom ? 'Ціна вказана як мінімальна ("від")' : undefined
    };
  }

  // 3. Загальна база робіт
  const dbWork = WORK_ITEMS_DATABASE.find(w =>
    w.name.toLowerCase().includes(searchTerm) ||
    searchTerm.includes(w.name.toLowerCase()) ||
    w.searchKeywords.some(k => searchTerm.includes(k.toLowerCase()))
  );

  if (dbWork) {
    return {
      workName,
      quantity,
      unit,
      laborCost: quantity * dbWork.laborRate,
      source: 'database',
      confidence: 0.8,
      rate: dbWork
    };
  }

  // 4. Оцінка на основі категорії
  const estimated = estimateLaborCost(workName, quantity, unit);
  return estimated;
}

/**
 * Оцінка вартості робіт коли немає в базі
 * Використовує середні ставки по категоріям
 */
function estimateLaborCost(
  workName: string,
  quantity: number,
  unit: string
): LaborCostResult {
  const searchTerm = workName.toLowerCase();

  // Середні ставки по типам робіт (грн за одиницю)
  const averageRates: Record<string, { rate: number; unit: string }> = {
    // З прайсу Kapitel
    'штукатурення': { rate: 295, unit: 'м²' },
    'шпаклювання': { rate: 325, unit: 'м²' },
    'фарбування': { rate: 135, unit: 'м²' },
    'стяжка': { rate: 290, unit: 'м²' },
    'плитка': { rate: 870, unit: 'м²' },
    'ламінат': { rate: 300, unit: 'м²' },
    'паркет': { rate: 310, unit: 'м²' },
    'електрика': { rate: 230, unit: 'т.' },
    'сантехніка': { rate: 1520, unit: 'т.' },
    'гіпсокартон': { rate: 470, unit: 'м²' },
    'перегородка': { rate: 500, unit: 'м²' },
    'демонтаж': { rate: 200, unit: 'м²' },
  };

  // Шукаємо схожу категорію
  for (const [category, data] of Object.entries(averageRates)) {
    if (searchTerm.includes(category)) {
      const rate = data.rate;
      return {
        workName,
        quantity,
        unit,
        laborCost: quantity * rate,
        source: 'estimated',
        confidence: 0.6,
        notes: `Оцінка на основі середньої ставки для категорії "${category}": ${rate} грн/${data.unit}`
      };
    }
  }

  // Якщо нічого не знайшли - базова оцінка 200 грн/м² або 500 грн/т.
  const defaultRate = unit.includes('м') ? 200 : 500;
  return {
    workName,
    quantity,
    unit,
    laborCost: quantity * defaultRate,
    source: 'estimated',
    confidence: 0.4,
    notes: `Використана базова оцінка: ${defaultRate} грн/${unit} (низька впевненість)`
  };
}

/**
 * Batch розрахунок для списку робіт
 */
export function calculateLaborCostsBatch(
  works: Array<{ name: string; quantity: number; unit: string }>
): LaborCostResult[] {
  return works.map(w => calculateLaborCost(w.name, w.quantity, w.unit));
}

/**
 * Отримати рекомендації для роботи
 */
export function getLaborCostRecommendations(workName: string): {
  kapitelRate?: LaborRate | null;
  similarWorks: Array<{ name: string; rate: number; source: string }>;
  avgRate: number;
} {
  const searchTerm = workName.toLowerCase();

  // Шукаємо в Kapitel
  const kapitelRate = findLaborRate(workName);

  // Шукаємо схожі роботи
  const similar = [
    ...LABOR_RATES_KAPITEL_2025.filter(r =>
      r.name.toLowerCase().includes(searchTerm.split(' ')[0])
    ).map(r => ({ name: r.name, rate: r.price, source: 'Kapitel 2025' })),
    ...WORK_ITEMS_DATABASE.filter(w =>
      w.searchKeywords.some(k => searchTerm.includes(k.toLowerCase()))
    ).map(w => ({ name: w.name, rate: w.laborRate, source: 'Database' }))
  ].slice(0, 5);

  const avgRate = similar.length > 0
    ? Math.round(similar.reduce((sum, s) => sum + s.rate, 0) / similar.length)
    : 0;

  return {
    kapitelRate,
    similarWorks: similar,
    avgRate
  };
}

/**
 * Статистика розцінок
 */
export function getLaborCostStatistics() {
  const kapitelStats = {
    total: LABOR_RATES_KAPITEL_2025.length,
    avgPrice: Math.round(
      LABOR_RATES_KAPITEL_2025.reduce((sum, r) => sum + r.price, 0) /
      LABOR_RATES_KAPITEL_2025.length
    ),
    minPrice: Math.min(...LABOR_RATES_KAPITEL_2025.map(r => r.price)),
    maxPrice: Math.max(...LABOR_RATES_KAPITEL_2025.map(r => r.price))
  };

  const dbStats = {
    total: WORK_ITEMS_DATABASE.length,
    avgRate: Math.round(
      WORK_ITEMS_DATABASE.reduce((sum, w) => sum + w.laborRate, 0) /
      WORK_ITEMS_DATABASE.length
    ),
    minRate: Math.min(...WORK_ITEMS_DATABASE.map(w => w.laborRate)),
    maxRate: Math.max(...WORK_ITEMS_DATABASE.map(w => w.laborRate))
  };

  return {
    kapitel: kapitelStats,
    database: dbStats,
    totalRates: kapitelStats.total + dbStats.total
  };
}

// Експорт для використання в агентах
export {
  LABOR_RATES_KAPITEL_2025,
  findLaborRate,
  type LaborRate
} from './labor-rates-kapitel-2025';
