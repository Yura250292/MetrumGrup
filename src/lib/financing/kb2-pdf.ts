/**
 * Generate a KB-2в PDF (Акт виконаних будівельних робіт).
 *
 * Layout follows ДБН Д.1.1-1:2013 conventions: title block, parties,
 * period, line-item table (description / unit / qty / price / amount),
 * subtotal + retention + net payable, signature block.
 *
 * Uses pdfmake (already set up for Estimate export with Cyrillic support).
 */
import { Prisma } from "@prisma/client";
import pdfMake from "pdfmake/build/pdfmake";

// Cyrillic-capable fonts (same setup as estimate-export.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfFonts = require("pdfmake/build/vfs_fonts");
(pdfMake as unknown as { vfs: unknown }).vfs = pdfFonts;

type KB2WithDetails = Prisma.KB2FormGetPayload<{
  include: {
    project: { include: { client: { select: { name: true; email: true; phone: true } } } };
    counterparty: true;
    estimate: { select: { number: true; title: true } };
    items: { orderBy: { sortOrder: "asc" } };
    createdBy: { select: { name: true } };
  };
}>;

function fmtUah(n: Prisma.Decimal | number | string): string {
  return `${Number(n).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtQty(n: Prisma.Decimal | number | string): string {
  return Number(n).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export async function generateKB2Pdf(form: KB2WithDetails): Promise<Buffer> {
  const customerName = form.counterparty?.name ?? form.project.client?.name ?? "—";
  const customerEdrpou = form.counterparty?.edrpou ?? "—";

  const tableBody: unknown[][] = [
    [
      { text: "№", bold: true, alignment: "center" },
      { text: "Найменування робіт", bold: true },
      { text: "Од.", bold: true, alignment: "center" },
      { text: "За кошторисом", bold: true, alignment: "center" },
      { text: "Виконано", bold: true, alignment: "center" },
      { text: "%", bold: true, alignment: "center" },
      { text: "Ціна, грн", bold: true, alignment: "right" },
      { text: "Сума, грн", bold: true, alignment: "right" },
    ],
    ...form.items.map((it, idx) => [
      { text: String(idx + 1), alignment: "center" },
      { text: it.description },
      { text: it.unit, alignment: "center" },
      { text: fmtQty(it.totalQty), alignment: "right" },
      { text: fmtQty(it.completedQty), alignment: "right" },
      {
        text: it.completionPercent ? `${Number(it.completionPercent).toFixed(0)}%` : "—",
        alignment: "center",
      },
      { text: fmtQty(it.unitPrice), alignment: "right" },
      { text: fmtQty(it.amount), alignment: "right" },
    ]),
    [
      { text: "ВСЬОГО", bold: true, colSpan: 7, alignment: "right" },
      {},
      {},
      {},
      {},
      {},
      {},
      { text: fmtUah(form.totalAmount), bold: true, alignment: "right" },
    ],
  ];

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 60] as [number, number, number, number],
    info: { title: form.number, author: "Metrum" },
    content: [
      { text: "АКТ", style: "header", alignment: "center" },
      {
        text: "приймання виконаних будівельних робіт",
        alignment: "center",
        fontSize: 11,
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },
      {
        text: `Форма КБ-2в    №  ${form.number}`,
        alignment: "center",
        fontSize: 10,
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        text: `за період ${fmtDate(form.periodFrom)} – ${fmtDate(form.periodTo)}`,
        alignment: "center",
        fontSize: 10,
        margin: [0, 0, 0, 16] as [number, number, number, number],
      },
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: "Замовник:", bold: true, fontSize: 9 },
              { text: customerName, fontSize: 10, margin: [0, 1, 0, 2] as [number, number, number, number] },
              {
                text: customerEdrpou !== "—" ? `ЄДРПОУ/РНОКПП: ${customerEdrpou}` : "",
                fontSize: 9,
              },
            ],
          },
          {
            width: "*",
            stack: [
              { text: "Підрядник:", bold: true, fontSize: 9 },
              { text: "Метрум груп", fontSize: 10, margin: [0, 1, 0, 2] as [number, number, number, number] },
            ],
          },
        ],
        margin: [0, 0, 0, 12] as [number, number, number, number],
      },
      {
        text: `Об'єкт будівництва: ${form.project.title}`,
        fontSize: 10,
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      form.estimate
        ? {
            text: `Кошторис: ${form.estimate.number}${form.estimate.title ? ` — ${form.estimate.title}` : ""}`,
            fontSize: 9,
            italics: true,
            margin: [0, 0, 0, 12] as [number, number, number, number],
          }
        : { text: "", margin: [0, 0, 0, 8] as [number, number, number, number] },

      // Items table
      {
        table: {
          headerRows: 1,
          widths: [18, "*", 30, 50, 50, 30, 60, 75],
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#888",
          vLineColor: () => "#888",
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        fontSize: 9,
      },

      // Totals block
      {
        margin: [0, 14, 0, 0] as [number, number, number, number],
        columns: [
          { width: "*", text: "" },
          {
            width: 280,
            stack: [
              {
                columns: [
                  { text: "Загальна сума:", fontSize: 10 },
                  { text: fmtUah(form.totalAmount), alignment: "right", fontSize: 10 },
                ],
              },
              ...(Number(form.retentionAmount) > 0
                ? [
                    {
                      columns: [
                        {
                          text: `Гарантійне утримання ${Number(form.retentionPercent).toFixed(2)}%:`,
                          fontSize: 10,
                          color: "#a36a16",
                        },
                        {
                          text: `−${fmtUah(form.retentionAmount)}`,
                          alignment: "right",
                          fontSize: 10,
                          color: "#a36a16",
                        },
                      ],
                    },
                  ]
                : []),
              {
                columns: [
                  { text: "До сплати:", bold: true, fontSize: 12 },
                  {
                    text: fmtUah(form.netPayable),
                    alignment: "right",
                    bold: true,
                    fontSize: 12,
                  },
                ],
                margin: [0, 4, 0, 0] as [number, number, number, number],
              },
            ],
          },
        ],
      },

      // Signatures
      {
        margin: [0, 30, 0, 0] as [number, number, number, number],
        columns: [
          {
            width: "*",
            stack: [
              { text: "Здав (Підрядник):", fontSize: 10 },
              { text: "_____________________________", margin: [0, 16, 0, 2] as [number, number, number, number] },
              { text: "(підпис, ПІБ, посада, печатка)", fontSize: 8, italics: true },
              { text: `Дата: ${fmtDate(new Date())}`, fontSize: 8, margin: [0, 6, 0, 0] as [number, number, number, number] },
            ],
          },
          {
            width: "*",
            stack: [
              { text: "Прийняв (Замовник):", fontSize: 10 },
              { text: "_____________________________", margin: [0, 16, 0, 2] as [number, number, number, number] },
              { text: "(підпис, ПІБ, посада, печатка)", fontSize: 8, italics: true },
              { text: "Дата: ____________", fontSize: 8, margin: [0, 6, 0, 0] as [number, number, number, number] },
            ],
          },
        ],
      },

      form.notes
        ? {
            text: `Примітки: ${form.notes}`,
            fontSize: 9,
            italics: true,
            margin: [0, 24, 0, 0] as [number, number, number, number],
            color: "#555",
          }
        : { text: "" },
    ],
    styles: {
      header: { fontSize: 18, bold: true },
    },
    defaultStyle: {
      fontSize: 10,
    },
  };

  return new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("PDF timeout after 30s")), 30_000);
    try {
      const doc = pdfMake.createPdf(docDefinition as Parameters<typeof pdfMake.createPdf>[0]);
      // Use getBase64 (more reliable on Node server-side than getBuffer in pdfmake).
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
