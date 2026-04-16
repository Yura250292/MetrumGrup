/**
 * Excel export for Фінансування (FinanceEntry ledger).
 *
 * Returns a Uint8Array buffer — route handler wraps it in NextResponse
 * with Content-Disposition headers.
 */

import { FINANCE_CATEGORY_LABELS, FINANCE_ENTRY_TYPE_LABELS } from "@/lib/constants";

export interface FinancingExportEntry {
  occurredAt: Date | string;
  type: "INCOME" | "EXPENSE";
  amount: number | string;
  currency: string;
  projectTitle: string | null;
  category: string;
  subcategory: string | null;
  title: string;
  description: string | null;
  counterparty: string | null;
  createdByName: string;
  createdAt: Date | string;
  updatedByName: string | null;
  updatedAt: Date | string;
}

export interface FinancingExportSummary {
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export interface FinancingExportAppliedFilter {
  label: string;
  value: string;
}

export interface FinancingExportInput {
  entries: FinancingExportEntry[];
  summary: FinancingExportSummary;
  appliedFilters: FinancingExportAppliedFilter[];
  generatedAt: Date;
}

function asNum(v: number | string): number {
  return typeof v === "string" ? Number(v) : v;
}

function fmtDate(v: Date | string): string {
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function fmtDateTime(v: Date | string): string {
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  const date = fmtDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mi}`;
}

export async function generateFinancingExcel(input: FinancingExportInput): Promise<Uint8Array> {
  const ExcelJSModule: any = await import("exceljs");
  const Workbook =
    (typeof ExcelJSModule.Workbook === "function" && ExcelJSModule.Workbook) ||
    (typeof ExcelJSModule.default?.Workbook === "function" && ExcelJSModule.default.Workbook);
  if (!Workbook) {
    throw new Error("ExcelJS.Workbook constructor not found");
  }

  const workbook = new Workbook();
  workbook.creator = "METRUM GROUP";
  workbook.created = new Date();

  const orange = "FFD97706";
  const darkBg = "FF2D2D2D";
  const lightGray = "FFF9FAFB";
  const successGreen = "FF15803D";
  const dangerRed = "FFB91C1C";
  const borderThin = { style: "thin" as const, color: { argb: "FFE5E7EB" } };
  const borders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };

  // ══════════ SHEET 1: ПІДСУМОК ══════════
  const summary = workbook.addWorksheet("Підсумок", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
    properties: { defaultRowHeight: 18 },
  });
  summary.columns = [{ width: 32 }, { width: 26 }];

  const sH = summary.addRow(["ФІНАНСУВАННЯ — ПІДСУМОК"]);
  summary.mergeCells("A1:B1");
  sH.height = 28;
  sH.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sH.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  sH.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  sH.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };

  const genRow = summary.addRow(["Сформовано", fmtDateTime(input.generatedAt)]);
  genRow.getCell(1).font = { color: { argb: "FF666666" } };
  genRow.getCell(2).font = { color: { argb: "FF666666" } };

  summary.addRow([]);

  const kpiHeader = summary.addRow(["ПОКАЗНИК", "ЗНАЧЕННЯ"]);
  kpiHeader.height = 22;
  for (let c = 1; c <= 2; c++) {
    const cell = kpiHeader.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borders;
  }

  const kpiRows: Array<[string, number | string, string]> = [
    ["Доходи", input.summary.income, successGreen],
    ["Витрати", input.summary.expense, dangerRed],
    ["Баланс", input.summary.balance, input.summary.balance >= 0 ? successGreen : dangerRed],
    ["Кількість операцій", input.summary.count, "FF111111"],
  ];

  for (const [label, value, color] of kpiRows) {
    const row = summary.addRow([label, value]);
    row.height = 22;
    row.getCell(1).font = { bold: true };
    row.getCell(1).border = borders;
    row.getCell(1).alignment = { vertical: "middle", indent: 1 };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightGray } };
    row.getCell(2).font = { bold: true, size: 12, color: { argb: color } };
    row.getCell(2).numFmt = typeof value === "number" && label !== "Кількість операцій" ? "#,##0.00" : "#,##0";
    row.getCell(2).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    row.getCell(2).border = borders;
  }

  summary.addRow([]);

  if (input.appliedFilters.length > 0) {
    const fH = summary.addRow(["ЗАСТОСОВАНІ ФІЛЬТРИ"]);
    summary.mergeCells(`A${fH.number}:B${fH.number}`);
    fH.height = 22;
    fH.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    fH.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
    fH.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    fH.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };

    for (const f of input.appliedFilters) {
      const row = summary.addRow([f.label, f.value]);
      row.getCell(1).border = borders;
      row.getCell(1).alignment = { indent: 1 };
      row.getCell(2).border = borders;
    }
  }

  // ══════════ SHEET 2: ОПЕРАЦІЇ ══════════
  const ws = workbook.addWorksheet("Операції", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Дата",
    "Проєкт",
    "Тип",
    "Категорія",
    "Підкатегорія",
    "Назва",
    "Коментар",
    "Контрагент",
    "Відповідальний",
    "Сума",
    "Валюта",
    "Дата створення",
    "Автор",
    "Дата оновлення",
  ];

  ws.columns = [
    { width: 12 }, { width: 24 }, { width: 10 }, { width: 22 },
    { width: 18 }, { width: 30 }, { width: 40 }, { width: 22 },
    { width: 20 }, { width: 14 }, { width: 10 }, { width: 18 },
    { width: 20 }, { width: 18 },
  ];

  const hRow = ws.addRow(headers);
  hRow.height = 24;
  for (let c = 1; c <= headers.length; c++) {
    const cell = hRow.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = borders;
  }

  for (const e of input.entries) {
    const signed = e.type === "EXPENSE" ? -Math.abs(asNum(e.amount)) : Math.abs(asNum(e.amount));
    const row = ws.addRow([
      fmtDate(e.occurredAt),
      e.projectTitle ?? "Постійна витрата",
      FINANCE_ENTRY_TYPE_LABELS[e.type] ?? e.type,
      FINANCE_CATEGORY_LABELS[e.category] ?? e.category,
      e.subcategory ?? "",
      e.title,
      e.description ?? "",
      e.counterparty ?? "",
      e.createdByName,
      signed,
      e.currency,
      fmtDateTime(e.createdAt),
      e.createdByName,
      e.updatedByName ? fmtDateTime(e.updatedAt) : "",
    ]);

    for (let c = 1; c <= headers.length; c++) {
      const cell = row.getCell(c);
      cell.border = borders;
      cell.alignment = { vertical: "middle", wrapText: c === 7 };
    }
    row.getCell(10).numFmt = "#,##0.00";
    row.getCell(10).alignment = { vertical: "middle", horizontal: "right" };
    row.getCell(10).font = {
      bold: true,
      color: { argb: e.type === "EXPENSE" ? dangerRed : successGreen },
    };
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
