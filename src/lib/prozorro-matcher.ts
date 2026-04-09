/**
 * Prozorro Tender Matching Algorithm
 * Знаходить схожі тендери для кошторису на основі multiple факторів
 */

import { Prisma } from '@prisma/client';
import { ProzorroTender } from './prozorro-client';
import { WizardData, ObjectType } from './wizard-types';

type EstimateWithRelations = {
  id: string;
  title: string;
  description: string | null;
  totalAmount: Prisma.Decimal;
  totalMaterials: Prisma.Decimal;
  totalLabor: Prisma.Decimal;
  sections: Array<{
    title: string;
    items: Array<{
      description: string;
    }>;
  }>;
};

export interface SearchAttributes {
  budgetMin: number;
  budgetMax: number;
  budgetCenter: number;
  area: number | null;
  objectType: ObjectType | null;
  cpvCode: string;
  keywords: string[];
}

export interface TenderMatch {
  score: number;
  reasons: string[];
}

/**
 * CPV код маппінг (класифікатор будівельних робіт Prozorro)
 * https://prozorro.gov.ua/cpv-classifier
 */
const CPV_CODE_MAPPING: Record<ObjectType, string> = {
  commercial: '45200000',   // Будівельні роботи для будівель
  apartment: '45210000',    // Будівництво житлових будинків
  house: '45210000',        // Будівництво житлових будинків
  townhouse: '45210000',    // Будівництво житлових будинків
  office: '45214000',       // Будівництво офісних будівель
};

/**
 * Витягти атрибути для пошуку з кошторису
 */
export function extractSearchAttributes(
  estimate: EstimateWithRelations,
  wizardData?: WizardData,
  searchQuery?: string
): SearchAttributes {
  const totalAmount = typeof estimate.totalAmount === 'number'
    ? estimate.totalAmount
    : parseFloat(estimate.totalAmount.toString());

  // Бюджет ±30% для пошуку
  const budgetMin = totalAmount * 0.7;
  const budgetMax = totalAmount * 1.3;
  const budgetCenter = totalAmount;

  // Площа з wizard data
  const area = wizardData?.totalArea ? parseFloat(wizardData.totalArea) : null;

  // Тип об'єкту
  const objectType = wizardData?.objectType || null;

  // CPV код на основі типу об'єкту
  const cpvCode = objectType ? mapObjectTypeToCPV(objectType) : '45000000'; // Generic construction

  // Ключові слова для пошуку
  const keywords = buildKeywords(estimate, wizardData, searchQuery);

  return {
    budgetMin,
    budgetMax,
    budgetCenter,
    area,
    objectType,
    cpvCode,
    keywords,
  };
}

/**
 * Маппінг типу об'єкту на CPV код
 */
export function mapObjectTypeToCPV(objectType: ObjectType): string {
  return CPV_CODE_MAPPING[objectType] || '45000000';
}

/**
 * Побудувати ключові слова для пошуку
 */
export function buildKeywords(
  estimate: EstimateWithRelations,
  wizardData?: WizardData,
  searchQuery?: string
): string[] {
  const keywords: string[] = [];

  // 🔥 ПРІОРИТЕТ: Якщо користувач вказав опис пошуку - використовуємо його в першу чергу
  if (searchQuery && searchQuery.trim().length > 0) {
    // Розбити на слова і додати як пріоритетні ключові слова
    const queryWords = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2);

    keywords.push(...queryWords);

    console.log(`🔍 Користувач вказав пошук: "${searchQuery}" → ${queryWords.length} ключових слів`);
  }

  // З назви кошторису
  if (estimate.title) {
    keywords.push(...estimate.title.toLowerCase().split(/\s+/));
  }

  // З опису
  if (estimate.description) {
    keywords.push(...estimate.description.toLowerCase().split(/\s+/));
  }

  // З wizard data для комерційних об'єктів
  if (wizardData?.objectType === 'commercial' && wizardData.commercialData) {
    const { purpose, hvac } = wizardData.commercialData;

    if (purpose === 'shop') {
      keywords.push('супермаркет', 'магазин', 'торгівля');
    }

    if (hvac) {
      keywords.push('холодильна', 'рефрижератор', 'вентиляція', 'кондиціонування');
    }
  }

  // З секцій кошторису
  estimate.sections.forEach(section => {
    keywords.push(...section.title.toLowerCase().split(/\s+/));
  });

  // Унікальні, без стоп-слів
  const stopWords = ['та', 'і', 'на', 'з', 'для', 'по', 'в', 'у'];
  const uniqueKeywords = [...new Set(keywords)]
    .filter(kw => kw.length > 2 && !stopWords.includes(kw));

  return uniqueKeywords.slice(0, 30); // Збільшено до 30 для searchQuery
}

/**
 * Розрахувати схожість між кошторисом та тендером
 */
export function calculateSimilarity(
  searchAttrs: SearchAttributes,
  tender: ProzorroTender
): TenderMatch {
  let score = 0;
  const reasons: string[] = [];

  // 1. Бюджет (40 балів) - найважливіший критерій
  const budgetScore = calculateBudgetScore(searchAttrs, tender);
  score += budgetScore;

  if (budgetScore > 20) {
    const percentage = Math.round((budgetScore / 40) * 100);
    reasons.push(`Бюджет: ${formatCurrency(tender.value.amount)} (${percentage}% схожість)`);
  }

  // 2. Площа (20 балів) - якщо є в описі тендера
  if (searchAttrs.area) {
    const areaScore = calculateAreaScore(searchAttrs.area, tender);
    score += areaScore;

    if (areaScore > 10) {
      const extractedArea = extractAreaFromDescription(tender.description);
      if (extractedArea) {
        const percentage = Math.round((areaScore / 20) * 100);
        reasons.push(`Площа: ~${extractedArea}м² (${percentage}% схожість)`);
      }
    }
  }

  // 3. CPV код (20 балів) - перші 4 цифри повинні співпадати
  const cpvScore = calculateCPVScore(searchAttrs.cpvCode, tender.classification.id);
  score += cpvScore;

  if (cpvScore > 10) {
    reasons.push(`Категорія: ${tender.classification.description}`);
  }

  // 4. Ключові слова (20 балів) - overlap в title/description
  const keywordScore = calculateKeywordScore(searchAttrs.keywords, tender);
  score += keywordScore;

  if (keywordScore > 10) {
    reasons.push('Схожий опис робіт');
  }

  return {
    score: Math.round(score),
    reasons,
  };
}

/**
 * Розрахувати score за бюджетом (0-40 балів)
 */
function calculateBudgetScore(searchAttrs: SearchAttributes, tender: ProzorroTender): number {
  const tenderAmount = tender.value.amount;
  const budgetCenter = searchAttrs.budgetCenter;

  // Якщо тендер в межах ±30% від бюджету - високий score
  if (tenderAmount >= searchAttrs.budgetMin && tenderAmount <= searchAttrs.budgetMax) {
    // Чим ближче до центру, тим вище score
    const diff = Math.abs(tenderAmount - budgetCenter) / budgetCenter;
    return Math.max(0, 40 * (1 - diff));
  }

  // Якщо за межами - нижчий score
  const diff = Math.abs(tenderAmount - budgetCenter) / budgetCenter;
  return Math.max(0, 40 * (1 - diff * 2)); // Штраф x2 для виходу за межі
}

/**
 * Розрахувати score за площею (0-20 балів)
 */
function calculateAreaScore(estimateArea: number, tender: ProzorroTender): number {
  const tenderArea = extractAreaFromDescription(tender.description);

  if (!tenderArea) {
    return 0; // Немає інформації про площу
  }

  // Якщо площа схожа (±30%)
  const diff = Math.abs(tenderArea - estimateArea) / estimateArea;

  if (diff <= 0.3) {
    return Math.max(0, 20 * (1 - diff));
  }

  // Якщо різниця більша - нижчий score
  return Math.max(0, 20 * (1 - diff * 2));
}

/**
 * Розрахувати score за CPV кодом (0-20 балів)
 */
function calculateCPVScore(estimateCPV: string, tenderCPV: string): number {
  // Повне співпадіння - 20 балів
  if (estimateCPV === tenderCPV) {
    return 20;
  }

  // Перші 4 цифри співпадають (категорія) - 15 балів
  if (estimateCPV.slice(0, 4) === tenderCPV.slice(0, 4)) {
    return 15;
  }

  // Перші 2 цифри співпадають (група) - 10 балів
  if (estimateCPV.slice(0, 2) === tenderCPV.slice(0, 2)) {
    return 10;
  }

  return 0;
}

/**
 * Розрахувати score за ключовими словами (0-20 балів)
 */
function calculateKeywordScore(keywords: string[], tender: ProzorroTender): number {
  const tenderText = `${tender.title} ${tender.description}`.toLowerCase();

  // Порахувати скільки ключових слів знайдено в тексті тендера
  const matchedKeywords = keywords.filter(kw => tenderText.includes(kw));
  const matchRatio = matchedKeywords.length / keywords.length;

  return Math.round(matchRatio * 20);
}

/**
 * Витягти площу з опису тендера (шукає патерни типу "1400 м²", "1,400 кв.м")
 */
export function extractAreaFromDescription(description: string): number | null {
  if (!description) {
    return null;
  }

  // Паттерни для пошуку площі
  const patterns = [
    /(\d+[\s,]?\d*)\s*м[²2]/i,           // "1400 м²", "1,400 м2"
    /(\d+[\s,]?\d*)\s*кв\.?\s*м/i,       // "1400 кв.м", "1,400 кв. м"
    /площа[:\s]+(\d+[\s,]?\d*)/i,        // "площа: 1400", "площа 1400"
    /(\d+[\s,]?\d*)\s*квадратн/i,        // "1400 квадратних метрів"
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      // Прибрати пробіли та коми з числа
      const areaStr = match[1].replace(/[\s,]/g, '');
      const area = parseFloat(areaStr);

      // Валідація: площа повинна бути реалістичною (10-100,000 м²)
      if (area >= 10 && area <= 100000) {
        return area;
      }
    }
  }

  return null;
}

/**
 * Форматування валюти
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Генерувати date string для Prozorro API (для фільтру dateModified)
 */
export function getDateForProzorroFilter(monthsAgo: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  return date.toISOString();
}

/**
 * Генерувати текстовий звіт про знайдені Prozorro тендери для звіту інженера
 */
export function generateProzorroReport(
  matches: Array<{
    tender: ProzorroTender;
    score: number;
    reasons: string[];
  }>
): string {
  if (matches.length === 0) {
    return '';
  }

  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════',
    '📊 АНАЛІЗ КОНКУРЕНТНИХ ТЕНДЕРІВ PROZORRO',
    '═══════════════════════════════════════════════════════',
    '',
    `Знайдено ${matches.length} схожих тендерів на платформі публічних закупівель Prozorro.`,
    'Нижче наведено порівняльний аналіз цін та умов виконання аналогічних проектів:',
    '',
  ];

  matches.forEach((match, index) => {
    const { tender, score, reasons } = match;
    const awardedAmount = tender.awards?.find(a => a.status === 'active')?.value.amount;
    const datePublished = new Date(tender.datePublished).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    lines.push(`${index + 1}. ${tender.title}`);
    lines.push(`   ${'─'.repeat(60)}`);
    lines.push(`   • Замовник: ${tender.procuringEntity.name}`);
    lines.push(`   • Код ЄДРПОУ: ${tender.procuringEntity.identifier.id}`);
    lines.push(`   • Дата оголошення: ${datePublished}`);
    lines.push(`   • Статус: ${getTenderStatusLabel(tender.status)}`);
    lines.push('');

    // Бюджет
    if (awardedAmount) {
      lines.push(`   💰 ЦІНА ПЕРЕМОЖЦЯ: ${formatCurrency(awardedAmount)}`);
      lines.push(`      (початковий бюджет: ${formatCurrency(tender.value.amount)})`);
      const saving = tender.value.amount - awardedAmount;
      if (saving > 0) {
        const savingPercent = (saving / tender.value.amount) * 100;
        lines.push(`      Економія: ${formatCurrency(saving)} (-${savingPercent.toFixed(1)}%)`);
      }
    } else {
      lines.push(`   💰 Бюджет: ${formatCurrency(tender.value.amount)}`);
    }
    lines.push('');

    // Категорія
    lines.push(`   • Категорія (CPV): ${tender.classification.id} - ${tender.classification.description}`);

    // Схожість
    lines.push(`   • Схожість з поточним проектом: ${score}%`);
    if (reasons.length > 0) {
      lines.push(`   • Фактори схожості:`);
      reasons.forEach(reason => {
        lines.push(`     - ${reason}`);
      });
    }
    lines.push('');

    // Опис (якщо є)
    if (tender.description && tender.description.length > 0) {
      const shortDescription = tender.description.slice(0, 200);
      lines.push(`   📝 Опис: ${shortDescription}${tender.description.length > 200 ? '...' : ''}`);
      lines.push('');
    }

    // Посилання
    lines.push(`   🔗 Детальна інформація: https://prozorro.gov.ua/tender/${tender.id}`);
    lines.push('');
  });

  // Підсумок
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('📈 ВИСНОВКИ ТА РЕКОМЕНДАЦІЇ');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');

  // Статистика цін
  const prices = matches
    .map(m => m.tender.awards?.find(a => a.status === 'active')?.value.amount || m.tender.value.amount)
    .filter(p => p > 0);

  if (prices.length > 0) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    lines.push('Порівняльний аналіз цін:');
    lines.push(`• Мінімальна ціна: ${formatCurrency(minPrice)}`);
    lines.push(`• Максимальна ціна: ${formatCurrency(maxPrice)}`);
    lines.push(`• Середня ціна: ${formatCurrency(avgPrice)}`);
    lines.push(`• Діапазон цін: ${formatCurrency(maxPrice - minPrice)} (±${(((maxPrice - minPrice) / avgPrice) * 50).toFixed(1)}%)`);
    lines.push('');
  }

  lines.push('Рекомендації:');
  lines.push('1. Використовуйте наведені дані для валідації вашого кошторису');
  lines.push('2. Перевірте детальні специфікації тендерів-переможців для оптимізації позицій');
  lines.push('3. Зверніть увагу на фактори економії у завершених тендерах');
  lines.push('4. Врахуйте регіональні та часові відмінності при порівнянні цін');
  lines.push('');

  return lines.join('\n');
}

/**
 * Отримати читабельний статус тендера
 */
function getTenderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'active': '🟢 Активний',
    'complete': '✅ Завершений',
    'cancelled': '🔴 Скасований',
    'unsuccessful': '⚠️ Неуспішний',
  };
  return labels[status] || status;
}
