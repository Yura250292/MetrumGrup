/**
 * Excel Estimate Parser
 * Парсинг кошторисів з Excel файлів (.xlsx, .xls)
 */

import * as XLSX from 'xlsx';

export interface ParsedEstimateItem {
  rowNumber: number;
  category?: string;
  code?: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

export interface ParseResult {
  success: boolean;
  items: ParsedEstimateItem[];
  totalAmount: number;
  errors: string[];
  metadata: {
    totalRows: number;
    parsedRows: number;
    skippedRows: number;
  };
}

/**
 * Парсинг Excel кошторису
 */
export async function parseExcelEstimate(
  fileBuffer: ArrayBuffer
): Promise<ParseResult> {
  const errors: string[] = [];
  const items: ParsedEstimateItem[] = [];

  try {
    // Прочитати Excel файл
    const workbook = XLSX.read(fileBuffer, { type: 'array' });

    // Взяти перший лист
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    if (!worksheet) {
      throw new Error('Не знайдено жодного листа в файлі');
    }

    // Конвертувати в JSON (масив масивів)
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    console.log(`📊 Excel: ${data.length} рядків, перші 3:`, data.slice(0, 3));

    // Знайти рядок з заголовками таблиці
    const headerRowIndex = findHeaderRow(data);

    if (headerRowIndex === -1) {
      throw new Error('Не знайдено заголовків таблиці кошторису');
    }

    console.log(`📋 Заголовки знайдено в рядку ${headerRowIndex + 1}`);

    // Визначити індекси колонок
    const columnMapping = mapColumns(data[headerRowIndex]);

    if (!columnMapping.description || !columnMapping.unit || !columnMapping.quantity || !columnMapping.unitPrice) {
      throw new Error('Не вдалося знайти всі необхідні колонки');
    }

    console.log('🗺️ Маппінг колонок:', columnMapping);

    // Парсити рядки даних
    let currentCategory: string | undefined;

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];

      if (!row || row.length === 0) continue;

      // Перевірити чи це заголовок категорії
      const categoryCheck = detectCategory(row, columnMapping);
      if (categoryCheck) {
        currentCategory = categoryCheck;
        console.log(`📂 Категорія: ${currentCategory}`);
        continue;
      }

      // Парсити рядок позиції
      const item = parseRow(row, i + 1, columnMapping, currentCategory);

      if (item) {
        items.push(item);
      } else {
        // Якщо не вдалося розпарсити - можливо порожній рядок або підсумок
        const firstCell = String(row[0] || '').toLowerCase();
        if (firstCell.includes('всього') || firstCell.includes('разом') || firstCell.includes('total')) {
          console.log(`💰 Підсумок в рядку ${i + 1}: ${row.join(', ')}`);
        }
      }
    }

    // Розрахувати загальну суму
    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    console.log(`✅ Розпарсено ${items.length} позицій, загальна сума: ${totalAmount.toFixed(2)} ₴`);

    return {
      success: true,
      items,
      totalAmount,
      errors,
      metadata: {
        totalRows: data.length,
        parsedRows: items.length,
        skippedRows: data.length - items.length - headerRowIndex - 1,
      },
    };
  } catch (error) {
    console.error('❌ Помилка парсингу Excel:', error);

    return {
      success: false,
      items,
      totalAmount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      metadata: {
        totalRows: 0,
        parsedRows: 0,
        skippedRows: 0,
      },
    };
  }
}

/**
 * Знайти рядок з заголовками таблиці
 */
function findHeaderRow(data: any[][]): number {
  const headerKeywords = [
    ['назва', 'найменування', 'опис', 'робота', 'роботи', 'позиція'],
    ['од', 'одиниця', 'од.вим', 'unit'],
    ['кільк', 'обсяг', 'quantity'],
    ['ціна', 'price', 'вартість'],
  ];

  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const rowStr = row.map(cell => String(cell || '').toLowerCase()).join(' ');

    // Перевірити чи є всі ключові слова
    const matchCount = headerKeywords.filter(keywords =>
      keywords.some(kw => rowStr.includes(kw))
    ).length;

    if (matchCount >= 3) {
      return i;
    }
  }

  return -1;
}

/**
 * Визначити маппінг колонок
 */
function mapColumns(headerRow: any[]): {
  code?: number;
  description?: number;
  unit?: number;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
} {
  const mapping: any = {};

  headerRow.forEach((cell, index) => {
    const cellStr = String(cell || '').toLowerCase().trim();

    // Код/номер позиції
    if (cellStr.match(/^(№|#|код|code|п\/п|п\.п)/)) {
      mapping.code = index;
    }
    // Назва/опис
    else if (cellStr.match(/(назва|найменування|опис|робот|позиція|description|name)/)) {
      mapping.description = index;
    }
    // Одиниця виміру
    else if (cellStr.match(/(од\.?|одиниц|од\.?\s*вим|unit)/)) {
      mapping.unit = index;
    }
    // Кількість
    else if (cellStr.match(/(кільк|обсяг|quantity|qty)/)) {
      mapping.quantity = index;
    }
    // Ціна за одиницю
    else if (cellStr.match(/(ціна|price|вартість)/) && cellStr.match(/(одиниц|unit|од)/)) {
      mapping.unitPrice = index;
    }
    // Загальна вартість
    else if (cellStr.match(/(сума|всього|total|загальн)/)) {
      mapping.totalPrice = index;
    }
  });

  return mapping;
}

/**
 * Детектувати чи рядок є заголовком категорії
 */
function detectCategory(row: any[], mapping: any): string | null {
  // Якщо перша колонка містить текст, а інші порожні - це категорія
  const firstCell = String(row[mapping.description] || row[0] || '').trim();

  if (!firstCell) return null;

  // Перевірити чи решта колонок порожні
  const otherCells = [
    row[mapping.quantity],
    row[mapping.unitPrice],
    row[mapping.totalPrice],
  ].filter(cell => cell !== undefined && cell !== null && cell !== '');

  if (otherCells.length === 0 && firstCell.length > 3) {
    return firstCell;
  }

  return null;
}

/**
 * Розпарсити рядок позиції
 */
function parseRow(
  row: any[],
  rowNumber: number,
  mapping: any,
  category?: string
): ParsedEstimateItem | null {
  try {
    const description = String(row[mapping.description] || '').trim();
    const unit = String(row[mapping.unit] || '').trim();
    const quantity = parseFloat(row[mapping.quantity]) || 0;
    const unitPrice = parseFloat(row[mapping.unitPrice]) || 0;

    // Загальна ціна: або з колонки, або розрахувати
    let totalPrice = mapping.totalPrice !== undefined
      ? parseFloat(row[mapping.totalPrice]) || 0
      : 0;

    if (totalPrice === 0) {
      totalPrice = quantity * unitPrice;
    }

    // Валідація
    if (!description || description.length < 3) return null;
    if (!unit) return null;
    if (quantity <= 0) return null;
    if (unitPrice < 0) return null;

    // Код позиції (якщо є)
    const code = mapping.code !== undefined
      ? String(row[mapping.code] || '').trim()
      : undefined;

    return {
      rowNumber,
      category,
      code: code || undefined,
      description,
      unit,
      quantity,
      unitPrice,
      totalPrice,
    };
  } catch (error) {
    console.warn(`⚠️ Помилка парсингу рядку ${rowNumber}:`, error);
    return null;
  }
}
