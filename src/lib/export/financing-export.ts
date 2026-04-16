/**
 * Excel export for Фінансування (FinanceEntry ledger).
 *
 * Produces 2 sheets:
 *   "Підсумок"  — 4-quadrant matrix (plan/fact × income/expense) + balance
 *   "Операції"  — full list with "Вид" and "Тип" columns
 *
 * Returns a Uint8Array buffer — route handler wraps it in NextResponse
 * with Content-Disposition headers.
 */

import { FINANCE_CATEGORY_LABELS, FINANCE_ENTRY_TYPE_LABELS } from "@/lib/constants";

const KIND_LABELS: Record<"PLAN" | "FACT", string> = {
  PLAN: "План",
  FACT: "Факт",
};

export interface FinancingExportEntry {
  occurredAt: Date | string;
  kind: "PLAN" | "FACT";
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

export interface FinancingExportQuadrantStats {
  sum: number;
  count: number;
}

export interface FinancingExportSummary {
  plan: {
    income: FinancingExportQuadrantStats;
    expense: FinancingExportQuadrantStats;
  };
  fact: {
    income: FinancingExportQuadrantStats;
    expense: FinancingExportQuadrantStats;
  };
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
  const blueAccent = "FF3B5BFF";
  const successGreen = "FF15803D";
  const dangerRed = "FFB91C1C";
  const warnAmber = "FFB45309";
  const borderThin = { style: "thin" as const, color: { argb: "FFE5E7EB" } };
  const borders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };

  // ══════════ SHEET 1: ПІДСУМОК ══════════
  const summary = workbook.addWorksheet("Підсумок", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
    properties: { defaultRowHeight: 18 },
  });
  summary.columns = [{ width: 28 }, { width: 22 }, { width: 22 }, { width: 22 }];

  const sH = summary.addRow(["ФІНАНСУВАННЯ — ПІДСУМОК"]);
  summary.mergeCells("A1:D1");
  sH.height = 28;
  sH.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sH.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  sH.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  for (let c = 2; c <= 4; c++) {
    sH.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  }

  const genRow = summary.addRow(["Сформовано", fmtDateTime(input.generatedAt)]);
  genRow.getCell(1).font = { color: { argb: "FF666666" } };
  genRow.getCell(2).font = { color: { argb: "FF666666" } };
  summary.mergeCells(`B${genRow.number}:D${genRow.number}`);

  summary.addRow([]);

  // 2x2 matrix header
  const matrixHeader = summary.addRow(["", "ВИТРАТИ", "ДОХОДИ", "БАЛАНС"]);
  matrixHeader.height = 24;
  for (let c = 1; c <= 4; c++) {
    const cell = matrixHeader.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borders;
  }

  // Plan row
  const planBalance = input.summary.plan.income.sum - input.summary.plan.expense.sum;
  const planRow = summary.addRow([
    "ПЛАН",
    input.summary.plan.expense.sum,
    input.summary.plan.income.sum,
    planBalance,
  ]);
  planRow.height = 28;
  planRow.getCell(1).font = { bold: true, color: { argb: blueAccent } };
  planRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightGray } };
  planRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
  planRow.getCell(1).border = borders;

  for (let c = 2; c <= 4; c++) {
    const cell = planRow.getCell(c);
    cell.numFmt = "#,##0.00";
    cell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    cell.border = borders;
    cell.font = { bold: true, color: { argb: c === 2 ? warnAmber : c === 3 ? blueAccent : blueAccent } };
  }

  // Fact row
  const factRow = summary.addRow([
    "ФАКТ",
    input.summary.fact.expense.sum,
    input.summary.fact.income.sum,
    input.summary.balance,
  ]);
  factRow.height = 28;
  factRow.getCell(1).font = { bold: true, color: { argb: successGreen } };
  factRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightGray } };
  factRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
  factRow.getCell(1).border = borders;

  for (let c = 2; c <= 4; c++) {
    const cell = factRow.getCell(c);
    cell.numFmt = "#,##0.00";
    cell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    cell.border = borders;
    cell.font = {
      bold: true,
      color: {
        argb:
          c === 2
            ? dangerRed
            : c === 3
              ? successGreen
              : input.summary.balance >= 0
                ? successGreen
                : dangerRed,
      },
    };
  }

  // Diff row (fact vs plan)
  const diffExpense = input.summary.fact.expense.sum - input.summary.plan.expense.sum;
  const diffIncome = input.summary.fact.income.sum - input.summary.plan.income.sum;
  const diffBalance = input.summary.balance - planBalance;
  const diffRow = summary.addRow([
    "Δ (ФАКТ − ПЛАН)",
    diffExpense,
    diffIncome,
    diffBalance,
  ]);
  diffRow.height = 24;
  diffRow.getCell(1).font = { bold: true, color: { argb: "FF666666" } };
  diffRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
  diffRow.getCell(1).border = borders;
  for (let c = 2; c <= 4; c++) {
    const cell = diffRow.getCell(c);
    cell.numFmt = "+#,##0.00;-#,##0.00;0";
    cell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    cell.border = borders;
    cell.font = { italic: true, color: { argb: "FF666666" } };
  }

  summary.addRow([]);

  // Counts row
  const countsHeader = summary.addRow(["КІЛЬКІСТЬ ЗАПИСІВ"]);
  summary.mergeCells(`A${countsHeader.number}:D${countsHeader.number}`);
  countsHeader.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  countsHeader.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
  countsHeader.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  countsHeader.height = 22;
  for (let c = 2; c <= 4; c++) {
    countsHeader.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
  }

  const countPlan = summary.addRow([
    "План",
    input.summary.plan.expense.count,
    input.summary.plan.income.count,
    input.summary.plan.expense.count + input.summary.plan.income.count,
  ]);
  const countFact = summary.addRow([
    "Факт",
    input.summary.fact.expense.count,
    input.summary.fact.income.count,
    input.summary.fact.expense.count + input.summary.fact.income.count,
  ]);

  for (const row of [countPlan, countFact]) {
    for (let c = 1; c <= 4; c++) {
      const cell = row.getCell(c);
      cell.border = borders;
      cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right", indent: 1 };
      if (c === 1) cell.font = { bold: true };
    }
  }

  summary.addRow([]);

  if (input.appliedFilters.length > 0) {
    const fH = summary.addRow(["ЗАСТОСОВАНІ ФІЛЬТРИ"]);
    summary.mergeCells(`A${fH.number}:D${fH.number}`);
    fH.height = 22;
    fH.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    fH.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
    fH.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    for (let c = 2; c <= 4; c++) {
      fH.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
    }

    for (const f of input.appliedFilters) {
      const row = summary.addRow([f.label, f.value]);
      summary.mergeCells(`B${row.number}:D${row.number}`);
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
    "Вид",
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
    { width: 12 }, { width: 9 }, { width: 24 }, { width: 10 }, { width: 22 },
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
      KIND_LABELS[e.kind] ?? e.kind,
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
      cell.alignment = { vertical: "middle", wrapText: c === 8 };
    }
    // Kind cell color
    row.getCell(2).font = {
      bold: true,
      color: { argb: e.kind === "PLAN" ? blueAccent : "FF111111" },
    };
    // Amount column
    row.getCell(11).numFmt = "#,##0.00";
    row.getCell(11).alignment = { vertical: "middle", horizontal: "right" };
    row.getCell(11).font = {
      bold: true,
      color: {
        argb:
          e.kind === "PLAN"
            ? e.type === "EXPENSE"
              ? warnAmber
              : blueAccent
            : e.type === "EXPENSE"
              ? dangerRed
              : successGreen,
      },
    };
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
