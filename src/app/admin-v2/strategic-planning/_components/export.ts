"use client";

import { format } from "date-fns";
import { uk } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { ForecastResult, Period } from "@/lib/strategic-planning/types";

function buildFilename(period: Period, ext: string): string {
  const start = new Date(period.startMonth);
  return `strategic-planning-${format(start, "yyyy-MM")}-${period.durationMonths}m.${ext}`;
}

function fmt(value: number) {
  return Math.round(value);
}

export function exportToExcel(forecast: ForecastResult, period: Period) {
  const wb = XLSX.utils.book_new();
  const monthLabels = forecast.months.map((m) =>
    format(m, "LLL yyyy", { locale: uk }),
  );

  const header = ["Стаття", "Тип", ...monthLabels, "Усього"];
  const body: (string | number)[][] = forecast.rows.map((r) => [
    r.label,
    r.type === "INCOME" ? "Дохід" : "Витрата",
    ...r.monthly.map(fmt),
    fmt(r.total),
  ]);

  const totalsRows: (string | number)[][] = [
    [
      "Σ Дохід",
      "",
      ...forecast.totals.incomeByMonth.map(fmt),
      fmt(forecast.summary.totalIncome),
    ],
    [
      "Σ Витрати",
      "",
      ...forecast.totals.expenseByMonth.map(fmt),
      fmt(forecast.summary.totalExpense),
    ],
    [
      "Net",
      "",
      ...forecast.totals.netByMonth.map(fmt),
      fmt(forecast.summary.netPL),
    ],
    [
      "Накопич. баланс",
      "",
      ...forecast.totals.runningBalance.map(fmt),
      "",
    ],
  ];

  const detailsSheet = XLSX.utils.aoa_to_sheet([header, ...body, [], ...totalsRows]);
  XLSX.utils.book_append_sheet(wb, detailsSheet, "Прогноз");

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Показник", "Значення"],
    ["Початок горизонту", monthLabels[0] ?? "—"],
    [
      "Кінець горизонту",
      monthLabels[monthLabels.length - 1] ?? "—",
    ],
    ["Місяців у горизонті", forecast.months.length],
    ["Загальний дохід, ₴", fmt(forecast.summary.totalIncome)],
    ["Загальні витрати, ₴", fmt(forecast.summary.totalExpense)],
    ["Net P&L, ₴", fmt(forecast.summary.netPL)],
    ["Мінімальний баланс, ₴", fmt(forecast.summary.minBalance)],
    [
      "Місяць мін. балансу",
      monthLabels[forecast.summary.minBalanceMonthIndex] ?? "—",
    ],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Зведення");

  XLSX.writeFile(wb, buildFilename(period, "xlsx"));
}

export function exportToPdf(forecast: ForecastResult, period: Period) {
  const monthLabels = forecast.months.map((m) =>
    format(m, "LLL ’yy", { locale: uk }),
  );
  const start = new Date(period.startMonth);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.text("Strategic Planning — Forecast", 40, 40);
  doc.setFontSize(10);
  doc.text(
    `${format(start, "LLL yyyy", { locale: uk })} (${period.durationMonths} mo)`,
    40,
    58,
  );

  const head = [["Item", "Type", ...monthLabels, "Total"]];
  const body = forecast.rows.map((r) => [
    r.label,
    r.type === "INCOME" ? "Income" : "Expense",
    ...r.monthly.map((v) => (v === 0 ? "—" : fmt(v).toLocaleString("uk-UA"))),
    fmt(r.total).toLocaleString("uk-UA"),
  ]);

  const foot = [
    [
      "Σ Income",
      "",
      ...forecast.totals.incomeByMonth.map((v) =>
        fmt(v).toLocaleString("uk-UA"),
      ),
      fmt(forecast.summary.totalIncome).toLocaleString("uk-UA"),
    ],
    [
      "Σ Expense",
      "",
      ...forecast.totals.expenseByMonth.map((v) =>
        fmt(v).toLocaleString("uk-UA"),
      ),
      fmt(forecast.summary.totalExpense).toLocaleString("uk-UA"),
    ],
    [
      "Net",
      "",
      ...forecast.totals.netByMonth.map((v) =>
        fmt(v).toLocaleString("uk-UA"),
      ),
      fmt(forecast.summary.netPL).toLocaleString("uk-UA"),
    ],
    [
      "Running balance",
      "",
      ...forecast.totals.runningBalance.map((v) =>
        fmt(v).toLocaleString("uk-UA"),
      ),
      "—",
    ],
  ];

  autoTable(doc, {
    head,
    body,
    foot,
    startY: 80,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [59, 91, 255], textColor: 255 },
    footStyles: { fillColor: [240, 240, 245], textColor: 20, fontStyle: "bold" },
  });

  doc.save(buildFilename(period, "pdf"));
}
