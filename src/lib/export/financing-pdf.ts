/**
 * PDF export of the Фінансування ledger — same data shape as
 * generateFinancingExcel so route handlers can switch between formats with
 * the same prep work.
 *
 * Layout:
 *   - Title block with period + generation timestamp
 *   - Applied filters table (chips list)
 *   - 2×2 summary matrix (Plan/Fact × Income/Expense)
 *   - Operations table — full rows
 *   - Footer with totals
 */

import pdfMake from "pdfmake/build/pdfmake";
import {
  FINANCE_CATEGORY_LABELS,
  FINANCE_ENTRY_TYPE_LABELS,
} from "@/lib/constants";
import type { FinancingExportInput } from "./financing-export";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfFonts = require("pdfmake/build/vfs_fonts");
(pdfMake as unknown as { vfs: unknown }).vfs = pdfFonts;

const KIND_LABELS: Record<"PLAN" | "FACT", string> = {
  PLAN: "План",
  FACT: "Факт",
};

function fmtDate(v: Date | string): string {
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(v: Date | string): string {
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtMoney(v: number | string, currency = "UAH"): string {
  const n = typeof v === "string" ? Number(v) : v;
  const formatted = n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency === "UAH" ? "₴" : currency}`;
}

function compactMoney(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)} млн`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000)} тис`;
  return n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateFinancingPdf(
  input: FinancingExportInput,
  opts?: { reportTitle?: string },
): Promise<Buffer> {
  const title = opts?.reportTitle ?? "Фінансовий звіт";
  const { entries, summary, appliedFilters, generatedAt } = input;

  // Summary matrix rows.
  const planBalance = summary.plan.income.sum - summary.plan.expense.sum;
  const factBalance = summary.fact.income.sum - summary.fact.expense.sum;
  const totalBalance = factBalance; // same as summary.balance

  // Operations table — preview at most 500 rows for sane pagination; if more,
  // tell the user to use Excel for the full dump.
  const operationLimit = 500;
  const opsRows = entries.slice(0, operationLimit);
  const tableBody: unknown[][] = [
    [
      { text: "Дата", bold: true, fontSize: 8 },
      { text: "Вид", bold: true, fontSize: 8 },
      { text: "Тип", bold: true, fontSize: 8 },
      { text: "Категорія", bold: true, fontSize: 8 },
      { text: "Назва", bold: true, fontSize: 8 },
      { text: "Контрагент", bold: true, fontSize: 8 },
      { text: "Проєкт", bold: true, fontSize: 8 },
      { text: "Сума", bold: true, alignment: "right", fontSize: 8 },
    ],
    ...opsRows.map((e) => [
      { text: fmtDate(e.occurredAt), fontSize: 8 },
      {
        text: KIND_LABELS[e.kind],
        fontSize: 8,
        color: e.kind === "PLAN" ? "#a36a16" : "#15803d",
      },
      {
        text: FINANCE_ENTRY_TYPE_LABELS[e.type] ?? e.type,
        fontSize: 8,
        color: e.type === "INCOME" ? "#15803d" : "#b91c1c",
      },
      { text: FINANCE_CATEGORY_LABELS[e.category] ?? e.category, fontSize: 8 },
      { text: e.title, fontSize: 8 },
      { text: e.counterparty ?? "—", fontSize: 8 },
      { text: e.projectTitle ?? "—", fontSize: 8 },
      {
        text: fmtMoney(e.amount, e.currency),
        alignment: "right",
        fontSize: 8,
        bold: true,
      },
    ]),
  ];

  const trimmed = entries.length > operationLimit;

  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "landscape" as const,
    pageMargins: [30, 30, 30, 50] as [number, number, number, number],
    info: { title, author: "METRUM GROUP" },
    content: [
      // Title block
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: title, fontSize: 16, bold: true },
              {
                text: `Згенеровано: ${fmtDateTime(generatedAt)}`,
                fontSize: 9,
                color: "#666",
                margin: [0, 2, 0, 0] as [number, number, number, number],
              },
              {
                text: `Записів у звіті: ${entries.length}${trimmed ? ` (показано перші ${operationLimit}, для повного списку — Excel-експорт)` : ""}`,
                fontSize: 9,
                color: "#666",
              },
            ],
          },
          {
            width: 130,
            text: "METRUM GROUP",
            alignment: "right",
            fontSize: 11,
            bold: true,
            color: "#3B5BFF",
          },
        ],
        margin: [0, 0, 0, 14] as [number, number, number, number],
      },

      // Applied filters
      appliedFilters.length > 0
        ? {
            stack: [
              {
                text: "Застосовані фільтри",
                fontSize: 9,
                bold: true,
                color: "#666",
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              {
                table: {
                  widths: [120, "*"],
                  body: appliedFilters.map((f) => [
                    { text: f.label, fontSize: 9, color: "#666" },
                    { text: f.value, fontSize: 9 },
                  ]),
                },
                layout: "noBorders",
              },
            ],
            margin: [0, 0, 0, 14] as [number, number, number, number],
          }
        : { text: "" },

      // 2x2 summary matrix
      {
        text: "Зведення",
        fontSize: 10,
        bold: true,
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },
      {
        table: {
          headerRows: 1,
          widths: ["*", "*", "*", "*"],
          body: [
            [
              { text: "", fillColor: "#2D2D2D" },
              {
                text: "ВИТРАТИ",
                bold: true,
                color: "#fff",
                fillColor: "#2D2D2D",
                alignment: "center",
                fontSize: 9,
              },
              {
                text: "ДОХОДИ",
                bold: true,
                color: "#fff",
                fillColor: "#2D2D2D",
                alignment: "center",
                fontSize: 9,
              },
              {
                text: "БАЛАНС",
                bold: true,
                color: "#fff",
                fillColor: "#2D2D2D",
                alignment: "center",
                fontSize: 9,
              },
            ],
            [
              {
                text: "ПЛАН",
                bold: true,
                color: "#3B5BFF",
                fillColor: "#F9FAFB",
                fontSize: 10,
              },
              {
                text: fmtMoney(summary.plan.expense.sum),
                alignment: "right",
                color: "#b91c1c",
                fontSize: 10,
              },
              {
                text: fmtMoney(summary.plan.income.sum),
                alignment: "right",
                color: "#15803d",
                fontSize: 10,
              },
              {
                text: fmtMoney(planBalance),
                alignment: "right",
                bold: true,
                color: planBalance >= 0 ? "#15803d" : "#b91c1c",
                fontSize: 10,
              },
            ],
            [
              {
                text: "ФАКТ",
                bold: true,
                color: "#15803d",
                fillColor: "#F9FAFB",
                fontSize: 10,
              },
              {
                text: fmtMoney(summary.fact.expense.sum),
                alignment: "right",
                color: "#b91c1c",
                fontSize: 10,
              },
              {
                text: fmtMoney(summary.fact.income.sum),
                alignment: "right",
                color: "#15803d",
                fontSize: 10,
              },
              {
                text: fmtMoney(factBalance),
                alignment: "right",
                bold: true,
                color: factBalance >= 0 ? "#15803d" : "#b91c1c",
                fontSize: 10,
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#E5E7EB",
          vLineColor: () => "#E5E7EB",
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },

      // Total balance highlight
      {
        margin: [0, 8, 0, 16] as [number, number, number, number],
        columns: [
          { width: "*", text: "" },
          {
            width: 220,
            stack: [
              {
                columns: [
                  { text: "Загальний баланс (Факт):", fontSize: 11, color: "#666" },
                  {
                    text: fmtMoney(totalBalance),
                    fontSize: 13,
                    bold: true,
                    alignment: "right",
                    color: totalBalance >= 0 ? "#15803d" : "#b91c1c",
                  },
                ],
              },
              {
                columns: [
                  { text: "Записів усього:", fontSize: 9, color: "#888" },
                  {
                    text: String(summary.count),
                    fontSize: 9,
                    alignment: "right",
                    color: "#888",
                  },
                ],
                margin: [0, 2, 0, 0] as [number, number, number, number],
              },
            ],
          },
        ],
      },

      // Operations table
      entries.length > 0
        ? {
            text: `Операції (${entries.length})`,
            fontSize: 10,
            bold: true,
            margin: [0, 0, 0, 6] as [number, number, number, number],
          }
        : { text: "" },
      entries.length > 0
        ? {
            table: {
              headerRows: 1,
              widths: [44, 28, 30, 60, "*", 70, 70, 60],
              body: tableBody,
            },
            layout: {
              hLineWidth: (i: number) => (i === 0 || i === 1 ? 0.7 : 0.3),
              vLineWidth: () => 0.3,
              hLineColor: () => "#bbb",
              vLineColor: () => "#ddd",
              paddingTop: () => 3,
              paddingBottom: () => 3,
              fillColor: (rowIndex: number) =>
                rowIndex === 0 ? "#F3F4F6" : rowIndex % 2 === 0 ? "#FAFAFA" : null,
            },
          }
        : {
            text: "Жодної операції за обраними фільтрами.",
            italics: true,
            color: "#888",
            fontSize: 10,
          },

      trimmed
        ? {
            text: `… показано перші ${operationLimit} з ${entries.length} рядків. Для повного списку завантажте Excel.`,
            italics: true,
            color: "#888",
            fontSize: 8,
            margin: [0, 8, 0, 0] as [number, number, number, number],
          }
        : { text: "" },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: "METRUM GROUP",
          alignment: "left",
          fontSize: 8,
          color: "#888",
          margin: [30, 18, 0, 0] as [number, number, number, number],
        },
        {
          text: `Сторінка ${currentPage} з ${pageCount}`,
          alignment: "right",
          fontSize: 8,
          color: "#888",
          margin: [0, 18, 30, 0] as [number, number, number, number],
        },
      ],
    }),
    defaultStyle: { fontSize: 9 },
  };

  return new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("PDF timeout after 30s")), 30_000);
    try {
      const doc = pdfMake.createPdf(docDefinition as Parameters<typeof pdfMake.createPdf>[0]);
      // getBase64 is more reliable on Node server-side than getBuffer.
      (doc as unknown as {
        getBase64: (cb: (data: string) => void, errCb: (err: unknown) => void) => void;
      }).getBase64(
        (data: string) => {
          clearTimeout(timeout);
          resolve(Buffer.from(data, "base64"));
        },
        (err: unknown) => {
          clearTimeout(timeout);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

// Re-export so tests / route handlers can pull this from one path.
export { compactMoney };
