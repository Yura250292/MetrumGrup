/**
 * Excel Estimate Parser
 * Парсинг кошторисів з Excel файлів (.xlsx, .xls)
 */

import * as XLSX from 'xlsx';

export interface ParsedEstimateItem {
  rowNumber: number;
  /** Категорія верхнього рівня з кошторису (напр. «Демонтажні роботи»). */
  category?: string;
  /** Назва робочого пункту, до якого належить матеріал (напр. «Монтаж бордюрів»). */
  parentWork?: string;
  /** LABOR — рядок з кодом/№ і ціною; MATERIAL — підрядки «Матеріали по пункту». */
  costType: "LABOR" | "MATERIAL";
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
    const workbook = XLSX.read(fileBuffer, { type: 'array' });

    if (workbook.SheetNames.length === 0) {
      throw new Error('Не знайдено жодного листа в файлі');
    }

    let totalRows = 0;
    let totalHeaderOffset = 0;

    // Парсимо КОЖЕН лист (часто кошторис розбитий на Table 1/Table 2).
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      console.log(`📊 Лист "${sheetName}": ${data.length} рядків`);

      const headerRowIndex = findHeaderRow(data);
      if (headerRowIndex === -1) {
        errors.push(`Лист "${sheetName}": заголовків таблиці не знайдено`);
        continue;
      }
      const columnMapping = mapColumns(data[headerRowIndex]);
      if (
        columnMapping.description === undefined ||
        columnMapping.unit === undefined ||
        columnMapping.quantity === undefined ||
        columnMapping.unitPrice === undefined
      ) {
        errors.push(
          `Лист "${sheetName}": не знайдено колонок ` +
            `(description=${columnMapping.description}, unit=${columnMapping.unit}, ` +
            `quantity=${columnMapping.quantity}, unitPrice=${columnMapping.unitPrice})`,
        );
        continue;
      }
      console.log(`📋 "${sheetName}" заголовки рядок ${headerRowIndex + 1}, мапінг:`, columnMapping);

      // Парсимо рядки. category — верхній блок (Демонтажні / Монтажні),
      // parentWork — остання LABOR-позиція; «Матеріали по пункту» —
      // службовий маркер, переключає всі наступні рядки на MATERIAL під
      // тим самим parentWork доки не зустрінемо новий LABOR.
      let currentCategory: string | undefined;
      let currentParentWork: string | undefined;
      let materialsSection = false;

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const firstNonEmpty = String(
          row[columnMapping.description] ?? row[0] ?? '',
        )
          .trim()
          .toLowerCase();

        // Маркер службового підпункту «Матеріали по пункту:» — наступні
        // рядки до нового LABOR будуть MATERIAL.
        if (
          firstNonEmpty.startsWith('матеріал') &&
          firstNonEmpty.includes('пункт')
        ) {
          materialsSection = true;
          continue;
        }

        // Категорія: текст є тільки в description-колонці, інші порожні.
        const categoryCheck = detectCategory(row, columnMapping);
        if (categoryCheck) {
          currentCategory = categoryCheck;
          currentParentWork = undefined;
          materialsSection = false;
          console.log(`📂 Категорія: ${currentCategory}`);
          continue;
        }

        const item = parseRow(row, i + 1, columnMapping, currentCategory);
        if (!item) {
          if (
            firstNonEmpty.includes('всього') ||
            firstNonEmpty.includes('разом') ||
            firstNonEmpty.includes('total')
          ) {
            console.log(`💰 Підсумок: ${row.join(', ')}`);
          }
          continue;
        }

        // Класифікуємо: LABOR — має код/№ і ціну за од; MATERIAL — без
        // ціни і всередині блоку «Матеріали по пункту».
        const hasCodeOrPrice =
          (item.code && item.code.length > 0) || item.unitPrice > 0;
        if (materialsSection && !hasCodeOrPrice) {
          item.costType = 'MATERIAL';
          item.parentWork = currentParentWork;
        } else {
          item.costType = 'LABOR';
          currentParentWork = item.description;
          materialsSection = false;
        }
        items.push(item);
      }

      totalRows += data.length;
      totalHeaderOffset += headerRowIndex + 1;
    }

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
    console.log(
      `✅ Розпарсено ${items.length} позицій з ${workbook.SheetNames.length} листів, сума: ${totalAmount.toFixed(2)} ₴`,
    );

    return {
      success: items.length > 0,
      items,
      totalAmount,
      errors,
      metadata: {
        totalRows,
        parsedRows: items.length,
        skippedRows: Math.max(0, totalRows - items.length - totalHeaderOffset),
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
    // Загальна вартість (Сума/Total) — перевіряємо першою щоб не злити з «ціна»
    else if (cellStr.match(/(сума|всього|total|загальн)/) && mapping.totalPrice === undefined) {
      mapping.totalPrice = index;
    }
    // Ціна за одиницю — український кошторис часто пише просто «Ціна» або
    // «Вартість» без слова «одиниці». Не вимагаємо обох слів.
    else if (
      cellStr.match(/(ціна|price|вартість)/) &&
      mapping.unitPrice === undefined
    ) {
      mapping.unitPrice = index;
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

    // Валідація. Дозволяємо MATERIAL-підрядки без ціни (їх лиш помітимо).
    if (!description || description.length < 3) return null;
    if (!unit) return null;
    if (quantity <= 0) return null;
    if (unitPrice < 0) return null;

    const code = mapping.code !== undefined
      ? String(row[mapping.code] || '').trim()
      : undefined;

    return {
      rowNumber,
      category,
      costType: 'LABOR',
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
