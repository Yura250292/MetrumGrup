/**
 * Parser for reference (ground-truth) estimate XLSX files.
 *
 * The reference files in `teach/{1,2,3}/*.xlsx` come in two distinct formats:
 *
 *   FORMAT A — single column (Sky Bank, Охматдит):
 *     header at row [10]: № Код | Найменування робіт | Один. | К-сть | Вартість | Сума,грн
 *     rows below are work items, with section headers in the first column
 *     ("Малярні роботи", "Плиточні роботи", ...).
 *     Totals at the bottom: "Вартість без ПДВ", "ПДВ 20%", "Загальна сума"
 *     OR a single "Всього вартість, грн" line.
 *
 *   FORMAT B — two columns side-by-side (ARMET):
 *     header at row [11]: № п/п | Найменівання робіт | Од. вим. | Кількість |
 *                         Ціна | Вартість | Матеріали | Од. вим. | Кількість |
 *                         Ціна | Вартість
 *     left side: works with prices, right side: materials with prices.
 *     Per-section totals: "Разом за розділом РОБОТИ" / "Разом за розділом МАТЕРІАЛИ"
 *     Bottom: "Загалом РОБОТИ", "Загалом МАТЕРІАЛИ+ОРГАНІЗАЦІЙНІ ВИТРАТИ", "Загалом"
 *
 * Both formats normalise to the same `ReferenceEstimate` shape so downstream
 * benchmark metrics don't have to know which one they're looking at.
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';

export type ReferenceItemKind = 'work' | 'material';

export interface ReferenceItem {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  kind: ReferenceItemKind;
  /** Section title from the XLSX (e.g. "Стіни, стеля", "Електромонтажні роботи"). */
  section: string;
}

export interface ReferenceSection {
  title: string;
  items: ReferenceItem[];
  worksTotal: number;
  materialsTotal: number;
  sectionTotal: number;
}

export interface ReferenceEstimate {
  /** Source file path. */
  sourcePath: string;
  format: 'single-column' | 'two-column';
  sections: ReferenceSection[];
  totals: {
    worksTotal: number;
    materialsTotal: number;
    grandTotal: number;
    /** VAT amount if found in the file. */
    vatAmount?: number;
  };
  itemCount: number;
}

const SECTION_TOTAL_TOKENS = [
  'разом за розділом',
  'всього',
  'загалом',
  'загальна сума',
  'вартість без пдв',
  'пдв 20',
];

function isSectionTotalRow(text: string): boolean {
  const lower = text.toLowerCase();
  return SECTION_TOTAL_TOKENS.some((t) => lower.includes(t));
}

function num(cell: unknown): number {
  if (cell === null || cell === undefined || cell === '') return 0;
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : 0;
  // Comma-decimal handling: "34,7" → 34.7
  const cleaned = String(cell).replace(/\s+/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function trimText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  return String(cell).replace(/\s+/g, ' ').trim();
}

function isHeaderRow(row: any[]): boolean {
  const text = row.map(trimText).join(' ').toLowerCase();
  // "Найменування" (Sky Bank, Охматдит) or "Найменівання" (ARMET, з рос. "ё").
  const hasName = text.includes('найменув') || text.includes('найменів');
  // "Кількість" (ARMET) or "К-сть" (Sky Bank, Охматдит) or "К сть".
  const hasQty = text.includes('кільк') || text.includes('к-сть') || text.includes('к сть');
  return hasName && hasQty;
}

/** A row is "section header" if column B has text and other numeric columns are blank. */
function isSectionHeaderRow(row: any[]): boolean {
  const second = trimText(row[1]);
  if (!second) return false;
  // Section headers are typically short text in column B with no numbers in C-F.
  const hasNumericData = [2, 3, 4, 5].some((idx) => {
    const cell = row[idx];
    return typeof cell === 'number' && cell > 0;
  });
  return !hasNumericData && second.length > 3 && second.length < 80;
}

/** Detect the workbook format and dispatch to the right reader. */
export function parseReferenceEstimate(filePath: string): ReferenceEstimate {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Reference file not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: null });

  // Look at the header row to figure out the format.
  const headerIdx = rows.findIndex(isHeaderRow);
  if (headerIdx === -1) {
    throw new Error(`Cannot find header row in ${filePath}`);
  }
  const header = rows[headerIdx].map(trimText).join(' ').toLowerCase();
  const isTwoColumn = header.includes('матеріал');

  if (isTwoColumn) {
    return parseTwoColumn(filePath, rows, headerIdx);
  }
  return parseSingleColumn(filePath, rows, headerIdx);
}

/**
 * Format A (single column): Sky Bank / Охматдит.
 *
 * Layout:
 *   col 0 = number ("1", "2", ...)
 *   col 1 = description (or section title)
 *   col 2 = unit
 *   col 3 = quantity
 *   col 4 = unitPrice
 *   col 5 = totalCost
 */
function parseSingleColumn(
  filePath: string,
  rows: any[][],
  headerIdx: number
): ReferenceEstimate {
  const sections: ReferenceSection[] = [];
  let currentSection: ReferenceSection | null = null;
  let grandTotal = 0;
  let vatAmount: number | undefined;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    // Footer rows can put their label in column A (e.g. Sky Bank) OR
    // column B. Check both before deciding the row is empty.
    const desc = trimText(row[1]) || trimText(row[0]);
    if (!desc) continue;

    // Footer: "Вартість без ПДВ", "ПДВ 20%", "Загальна сума", "Всього вартість".
    if (isSectionTotalRow(desc)) {
      const total = num(row[5]);
      const lower = desc.toLowerCase();
      if (lower.includes('пдв 20')) {
        vatAmount = total;
      } else if (lower.includes('загальна сума') || lower.includes('всього')) {
        // Always overwrite with the most complete (post-VAT) total.
        grandTotal = total;
      } else if (lower.includes('вартість без пдв')) {
        // Only set this as grand total if we haven't seen a "Загальна сума" yet.
        if (grandTotal === 0) grandTotal = total;
      }
      continue;
    }

    // Section header: text only, no numeric data.
    if (isSectionHeaderRow(row)) {
      currentSection = {
        title: desc,
        items: [],
        worksTotal: 0,
        materialsTotal: 0,
        sectionTotal: 0,
      };
      sections.push(currentSection);
      continue;
    }

    // Regular item row.
    const quantity = num(row[3]);
    const unitPrice = num(row[4]);
    const totalCost = num(row[5]);
    if (quantity === 0 && totalCost === 0) continue;
    if (!currentSection) {
      currentSection = {
        title: 'Без секції',
        items: [],
        worksTotal: 0,
        materialsTotal: 0,
        sectionTotal: 0,
      };
      sections.push(currentSection);
    }
    const item: ReferenceItem = {
      description: desc,
      unit: trimText(row[2]),
      quantity,
      unitPrice,
      totalCost,
      kind: 'work',
      section: currentSection.title,
    };
    currentSection.items.push(item);
    currentSection.worksTotal += totalCost;
    currentSection.sectionTotal += totalCost;
  }

  if (grandTotal === 0) {
    grandTotal = sections.reduce((s, sec) => s + sec.sectionTotal, 0);
  }

  return {
    sourcePath: filePath,
    format: 'single-column',
    sections,
    totals: {
      worksTotal: sections.reduce((s, sec) => s + sec.worksTotal, 0),
      materialsTotal: 0,
      grandTotal,
      vatAmount,
    },
    itemCount: sections.reduce((s, sec) => s + sec.items.length, 0),
  };
}

/**
 * Format B (two columns side-by-side): ARMET.
 *
 * Layout:
 *   col 0 = work number, col 1 = work description, col 2 = unit, col 3 = qty,
 *   col 4 = unitPrice, col 5 = totalCost
 *   col 6 = material description, col 7 = material unit, col 8 = qty,
 *   col 9 = unitPrice, col 10 = totalCost
 *
 * Section headers occupy the full row in column 0; per-section totals appear
 * as "Разом за розділом РОБОТИ" / "Разом за розділом МАТЕРІАЛИ".
 */
function parseTwoColumn(
  filePath: string,
  rows: any[][],
  headerIdx: number
): ReferenceEstimate {
  const sections: ReferenceSection[] = [];
  let totalsWorks = 0;
  let totalsMaterials = 0;
  let grandTotal = 0;

  function getCurrentSection(): ReferenceSection {
    if (sections.length === 0) {
      sections.push({
        title: 'Без секції',
        items: [],
        worksTotal: 0,
        materialsTotal: 0,
        sectionTotal: 0,
      });
    }
    return sections[sections.length - 1];
  }

  function startSection(title: string): void {
    const last = sections[sections.length - 1];
    if (!last || last.title !== title) {
      sections.push({
        title,
        items: [],
        worksTotal: 0,
        materialsTotal: 0,
        sectionTotal: 0,
      });
    }
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const colA = trimText(row[0]);
    const colB = trimText(row[1]);
    const colG = trimText(row[6]);

    // Section header lives in column A only.
    if (colA && !colB && !colG && !isSectionTotalRow(colA)) {
      startSection(colA);
      continue;
    }

    // Per-section totals.
    if (colB && colB.toLowerCase().includes('разом за розділом')) {
      const works = num(row[5]);
      const mats = num(row[10]);
      const sec = sections[sections.length - 1];
      if (sec) {
        if (works > 0) sec.worksTotal = works;
        if (mats > 0) sec.materialsTotal = mats;
        sec.sectionTotal = sec.worksTotal + sec.materialsTotal;
      }
      continue;
    }

    // Bottom totals.
    const colGLower = colG.toLowerCase();
    if (colGLower.includes('загалом роботи')) {
      totalsWorks = num(row[10]);
      continue;
    }
    if (colGLower.includes('загалом матеріали') || colGLower.includes('загалом матеріали+')) {
      totalsMaterials = num(row[10]);
      continue;
    }
    if (colGLower === 'загалом' || colGLower.includes('разом до сплати')) {
      const t = num(row[10]);
      if (t > grandTotal) grandTotal = t;
      continue;
    }

    // Otherwise, parse work + material item from the same row.
    const sec = getCurrentSection();

    // Work item (left side).
    if (colB && !isSectionTotalRow(colB)) {
      const qty = num(row[3]);
      const price = num(row[4]);
      const total = num(row[5]);
      if (qty > 0 || total > 0) {
        sec.items.push({
          description: colB,
          unit: trimText(row[2]),
          quantity: qty,
          unitPrice: price,
          totalCost: total,
          kind: 'work',
          section: sec.title,
        });
        sec.worksTotal += total;
      }
    }

    // Material item (right side).
    if (colG && !isSectionTotalRow(colG)) {
      const qty = num(row[8]);
      const price = num(row[9]);
      const total = num(row[10]);
      if (qty > 0 || total > 0) {
        sec.items.push({
          description: colG,
          unit: trimText(row[7]),
          quantity: qty,
          unitPrice: price,
          totalCost: total,
          kind: 'material',
          section: sec.title,
        });
        sec.materialsTotal += total;
      }
    }
  }

  // Recompute section totals from items if explicit totals were missed.
  for (const sec of sections) {
    if (sec.sectionTotal === 0) {
      sec.sectionTotal = sec.worksTotal + sec.materialsTotal;
    }
  }
  if (grandTotal === 0) {
    grandTotal = totalsWorks + totalsMaterials;
  }

  return {
    sourcePath: filePath,
    format: 'two-column',
    sections,
    totals: {
      worksTotal: totalsWorks || sections.reduce((s, sec) => s + sec.worksTotal, 0),
      materialsTotal: totalsMaterials || sections.reduce((s, sec) => s + sec.materialsTotal, 0),
      grandTotal,
    },
    itemCount: sections.reduce((s, sec) => s + sec.items.length, 0),
  };
}
