/**
 * Парсер `Рахунки.xlsx` (формат кошторисниці).
 *
 * Колонки (рядок 4 — заголовок, дані з рядка 5+):
 *   A "Постачальник" | B "Рахунок" | C "Куди везли" | D "Сума" |
 *   E "Дата поставки" | F "Дата оплати рахунку"
 *
 * Статус оплати — за **кольором заливки рядка** (cell A):
 *   - зелений (theme=9) → PAID
 *   - білий/немає заливки → DEBT
 *
 * Парсер толерантний: рядки з порожньою назвою постачальника пропускаються
 * (це або порожні рядки в кінці, або сепаратори).
 */
import ExcelJS from "exceljs";

export type RawInvoiceRow = {
  rowNumber: number;
  supplier: string;
  invoiceNumber: string | null;
  destination: string | null;
  amount: number | null;
  deliveryDate: Date | null;
  paymentDate: Date | null;
  isPaid: boolean;
  /// Накопичується для diagnostics: чого не вистачає / що було порожнє.
  issues: string[];
};

export type ParseExcelResult = {
  rows: RawInvoiceRow[];
  /// Скільки рядків було пропущено (порожня назва постачальника, тощо).
  skippedRows: number;
};

function toString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text ?? "").join("").trim();
    }
  }
  return String(value).trim();
}

function toNumber(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = toString(value).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: ExcelJS.CellValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value && value.result instanceof Date) return value.result;
  }
  const s = toString(value);
  if (!s || s === "-") return null;
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

/**
 * Чи має cell зелену заливку (theme=9 у файлі кошторисниці).
 * Толерантно: будь-який solid green pattern. Якщо немає fill — DEBT.
 */
function isPaidByFill(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (!fill || fill.type !== "pattern") return false;
  if (fill.pattern !== "solid") return false;
  const fg = fill.fgColor;
  if (!fg) return false;
  // Theme green (Accent 6 у стандартній темі Office) — як у нашому файлі.
  if (fg.theme === 9) return true;
  // Або явно зелений RGB.
  if (fg.argb && /^[Ff][Ff].{0,2}[7-9A-F].{0,2}[0-3].{2}$/i.test(fg.argb)) {
    return true;
  }
  return false;
}

/**
 * Знаходить рядок заголовка автоматично — шукає "Постачальник" в перших 10 рядках.
 * У файлі кошторисниці це рядок 4.
 */
function findHeaderRow(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(10, row.cellCount || 10); c++) {
      const v = toString(row.getCell(c).value).toLowerCase();
      if (v.includes("постачальник")) return r;
    }
  }
  return 4; // fallback на формат кошторисниці
}

export async function parseInvoicesExcel(buffer: Buffer): Promise<ParseExcelResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const ws = workbook.worksheets[0];
  if (!ws) return { rows: [], skippedRows: 0 };

  const headerRow = findHeaderRow(ws);
  const dataStart = headerRow + 1;

  const rows: RawInvoiceRow[] = [];
  let skipped = 0;

  for (let r = dataStart; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cellSupplier = row.getCell(1);
    const supplier = toString(cellSupplier.value);
    if (!supplier) {
      skipped++;
      continue;
    }
    const invoiceNumber = toString(row.getCell(2).value) || null;
    const destination = toString(row.getCell(3).value) || null;
    const amount = toNumber(row.getCell(4).value);
    const deliveryDate = toDate(row.getCell(5).value);
    const paymentDate = toDate(row.getCell(6).value);

    const issues: string[] = [];
    if (amount === null) issues.push("missing-amount");
    if (!invoiceNumber) issues.push("missing-invoice-number");
    if (!deliveryDate && !paymentDate) issues.push("missing-dates");

    rows.push({
      rowNumber: r,
      supplier,
      invoiceNumber,
      destination,
      amount,
      deliveryDate,
      paymentDate,
      isPaid: isPaidByFill(cellSupplier),
      issues,
    });
  }

  return { rows, skippedRows: skipped };
}
