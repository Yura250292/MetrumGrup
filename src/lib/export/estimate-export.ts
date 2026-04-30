import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import pdfMake from "pdfmake/build/pdfmake";

// Налаштування шрифтів для pdfMake (підтримка кирилиці)
const pdfFonts = require("pdfmake/build/vfs_fonts");
(pdfMake as any).vfs = pdfFonts;

type EstimateWithDetails = Prisma.EstimateGetPayload<{
  include: {
    project: {
      include: {
        client: { select: { name: true; email: true; phone: true } };
        clientCounterparty: { select: { name: true } };
      };
    };
    items: true;
    createdBy: { select: { name: true } };
  };
}>;

/** Display-name з пріоритетом: clientName → counterparty → client.name. */
function clientDisplayName(p: EstimateWithDetails["project"]): string {
  return p.clientName ?? p.clientCounterparty?.name ?? p.client?.name ?? "—";
}

/**
 * Генерує PDF кошторису для клієнта з підтримкою кирилиці
 */
export async function generateEstimatePDF(estimate: EstimateWithDetails): Promise<Buffer> {
  const tableData = estimate.items.map((item, idx) => [
    String(idx + 1),
    item.description,
    item.unit,
    Number(item.quantity).toFixed(2),
    Number(item.priceWithMargin).toFixed(2) + " грн",
    Number(item.amount).toFixed(2) + " грн",
  ]);

  const docDefinition: any = {
    content: [
      // Заголовок
      {
        text: "КОШТОРИС",
        style: "header",
        alignment: "center",
        margin: [0, 0, 0, 10],
      },
      {
        text: `№ ${estimate.number}`,
        alignment: "center",
        fontSize: 10,
        margin: [0, 0, 0, 5],
      },
      {
        text: `від ${new Date(estimate.createdAt).toLocaleDateString("uk-UA")}`,
        alignment: "center",
        fontSize: 10,
        margin: [0, 0, 0, 20],
      },

      // Інформація про проєкт
      {
        text: "Інформація про проєкт:",
        style: "subheader",
        margin: [0, 0, 0, 5],
      },
      {
        text: `Назва: ${estimate.project.title}`,
        fontSize: 9,
        margin: [0, 0, 0, 3],
      },
      {
        text: `Клієнт: ${clientDisplayName(estimate.project)}`,
        fontSize: 9,
        margin: [0, 0, 0, 3],
      },
      ...(estimate.project.client?.phone
        ? [
            {
              text: `Телефон: ${estimate.project.client.phone}`,
              fontSize: 9,
              margin: [0, 0, 0, 3],
            },
          ]
        : []),

      // Опис кошторису
      {
        text: `Кошторис: ${estimate.title}`,
        style: "subheader",
        margin: [0, 10, 0, 5],
      },
      ...(estimate.description
        ? [
            {
              text: estimate.description,
              fontSize: 9,
              margin: [0, 0, 0, 10],
            },
          ]
        : []),

      // Таблиця позицій
      {
        table: {
          headerRows: 1,
          widths: [30, "*", 50, 50, 70, 80],
          body: [
            [
              { text: "№", style: "tableHeader" },
              { text: "Найменування робіт", style: "tableHeader" },
              { text: "Од.", style: "tableHeader" },
              { text: "Кільк.", style: "tableHeader" },
              { text: "Ціна, грн", style: "tableHeader" },
              { text: "Сума, грн", style: "tableHeader" },
            ],
            ...tableData,
          ],
        },
        layout: {
          fillColor: function (rowIndex: number) {
            return rowIndex === 0 ? "#FF8400" : null;
          },
          hLineWidth: function () {
            return 0.5;
          },
          vLineWidth: function () {
            return 0.5;
          },
        },
        margin: [0, 10, 0, 20],
      },

      // Підсумки
      {
        columns: [
          { width: "*", text: "" },
          {
            width: 200,
            stack: [
              {
                text: "Підсумок:",
                bold: true,
                fontSize: 10,
                margin: [0, 0, 0, 5],
              },
              {
                text: `Матеріали: ${Number(estimate.totalMaterials).toFixed(2)} грн`,
                fontSize: 9,
                margin: [0, 0, 0, 3],
              },
              {
                text: `Роботи: ${Number(estimate.totalLabor).toFixed(2)} грн`,
                fontSize: 9,
                margin: [0, 0, 0, 3],
              },
              {
                text: `Накладні: ${Number(estimate.totalOverhead).toFixed(2)} грн`,
                fontSize: 9,
                margin: [0, 0, 0, 3],
              },
              ...(Number(estimate.discount) > 0
                ? [
                    {
                      text: `Знижка (${Number(estimate.discount)}%): -${(
                        (Number(estimate.totalAmount) * Number(estimate.discount)) /
                        100
                      ).toFixed(2)} грн`,
                      fontSize: 9,
                      margin: [0, 0, 0, 3],
                    },
                  ]
                : []),
              {
                text: `РАЗОМ ДО СПЛАТИ: ${Number(estimate.finalAmount).toFixed(2)} грн`,
                bold: true,
                fontSize: 12,
                color: "#2d5a3d",
                margin: [0, 10, 0, 0],
              },
            ],
          },
        ],
      },

      // Примітки
      ...(estimate.notes
        ? [
            {
              text: "Примітки:",
              bold: true,
              fontSize: 9,
              margin: [0, 20, 0, 5],
            },
            {
              text: estimate.notes,
              fontSize: 9,
            },
          ]
        : []),
    ],
    styles: {
      header: {
        fontSize: 18,
        bold: true,
      },
      subheader: {
        fontSize: 11,
        bold: true,
      },
      tableHeader: {
        bold: true,
        fontSize: 9,
        color: "white",
        fillColor: "#FF8400",
      },
    },
    defaultStyle: {
      font: "Roboto",
    },
  };

  return new Promise<Buffer>((resolve, reject) => {
    // Timeout для дебагу (30 секунд)
    const timeout = setTimeout(() => {
      reject(new Error('PDF generation timeout after 30 seconds'));
    }, 30000);

    try {
      console.log('[PDF] Creating pdfMake document...');
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);

      console.log('[PDF] Calling getBase64...');
      // Використовуємо getBase64 замість getBuffer (більш надійно для серверного рендерингу)
      (pdfDocGenerator as any).getBase64((data: string) => {
        try {
          clearTimeout(timeout);
          console.log('[PDF] Got base64 data, length:', data.length);
          const buffer = Buffer.from(data, 'base64');
          console.log('[PDF] Converted to buffer, size:', buffer.length);
          resolve(buffer);
        } catch (error) {
          clearTimeout(timeout);
          console.error('[PDF] Error converting base64 to buffer:', error);
          reject(error);
        }
      }, (error: any) => {
        clearTimeout(timeout);
        console.error('[PDF] Error from pdfMake:', error);
        reject(error);
      });
    } catch (error) {
      clearTimeout(timeout);
      console.error('[PDF] Error creating PDF:', error);
      reject(error);
    }
  });
}

/**
 * Генерує Excel кошторису для клієнта з підтримкою кирилиці
 */
export async function generateEstimateExcel(estimate: EstimateWithDetails): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Metrum Group";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Кошторис", {
    properties: { defaultColWidth: 15 },
  });

  // Заголовок
  worksheet.mergeCells("A1:F1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "КОШТОРИС";
  titleCell.font = { size: 18, bold: true, name: "Arial" };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells("A2:F2");
  const numberCell = worksheet.getCell("A2");
  numberCell.value = `№ ${estimate.number} від ${new Date(estimate.createdAt).toLocaleDateString("uk-UA")}`;
  numberCell.font = { size: 11, name: "Arial" };
  numberCell.alignment = { horizontal: "center" };

  // Інформація про проєкт
  worksheet.addRow([]);
  const projectInfoRow = worksheet.addRow(["Інформація про проєкт:"]);
  projectInfoRow.getCell(1).font = { bold: true, name: "Arial" };

  worksheet.addRow(["Назва:", estimate.project.title]);
  worksheet.addRow(["Клієнт:", clientDisplayName(estimate.project)]);
  if (estimate.project.client?.phone) {
    worksheet.addRow(["Телефон:", estimate.project.client.phone]);
  }

  // Опис
  worksheet.addRow([]);
  worksheet.addRow(["Кошторис:", estimate.title]);
  if (estimate.description) {
    worksheet.addRow(["Опис:", estimate.description]);
  }

  // Таблиця заголовків
  worksheet.addRow([]);
  const headerRow = worksheet.addRow([
    "№",
    "Найменування робіт",
    "Од. виміру",
    "Кількість",
    "Ціна, грн",
    "Сума, грн",
  ]);

  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF8400" },
  };
  headerRow.height = 20;
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Дані
  estimate.items.forEach((item, idx) => {
    const row = worksheet.addRow([
      idx + 1,
      item.description,
      item.unit,
      Number(item.quantity),
      Number(item.priceWithMargin),
      Number(item.amount),
    ]);

    row.font = { name: "Arial" };
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      if (colNumber >= 4) {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
    });
  });

  // Підсумки
  worksheet.addRow([]);
  const summaryStartRow = worksheet.addRow([
    "",
    "",
    "",
    "",
    "Матеріали:",
    Number(estimate.totalMaterials),
  ]);
  summaryStartRow.getCell(5).font = { bold: true, name: "Arial" };
  summaryStartRow.getCell(6).numFmt = "#,##0.00";

  const laborRow = worksheet.addRow(["", "", "", "", "Роботи:", Number(estimate.totalLabor)]);
  laborRow.getCell(5).font = { bold: true, name: "Arial" };
  laborRow.getCell(6).numFmt = "#,##0.00";

  const overheadRow = worksheet.addRow([
    "",
    "",
    "",
    "",
    "Накладні:",
    Number(estimate.totalOverhead),
  ]);
  overheadRow.getCell(5).font = { bold: true, name: "Arial" };
  overheadRow.getCell(6).numFmt = "#,##0.00";

  if (Number(estimate.discount) > 0) {
    const discountRow = worksheet.addRow([
      "",
      "",
      "",
      "",
      `Знижка (${Number(estimate.discount)}%):`,
      -((Number(estimate.totalAmount) * Number(estimate.discount)) / 100),
    ]);
    discountRow.getCell(5).font = { bold: true, name: "Arial" };
    discountRow.getCell(6).numFmt = "#,##0.00";
  }

  const totalRow = worksheet.addRow([
    "",
    "",
    "",
    "",
    "РАЗОМ ДО СПЛАТИ:",
    Number(estimate.finalAmount),
  ]);
  totalRow.font = { bold: true, size: 12, name: "Arial" };
  totalRow.getCell(5).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  totalRow.getCell(6).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  totalRow.getCell(6).numFmt = "#,##0.00";
  totalRow.getCell(6).font = { bold: true, size: 12, color: { argb: "FF2d5a3d" }, name: "Arial" };

  // Ширина колонок
  worksheet.getColumn(1).width = 8;
  worksheet.getColumn(2).width = 50;
  worksheet.getColumn(3).width = 15;
  worksheet.getColumn(4).width = 12;
  worksheet.getColumn(5).width = 20;
  worksheet.getColumn(6).width = 18;

  // Примітки
  if (estimate.notes) {
    worksheet.addRow([]);
    const notesHeaderRow = worksheet.addRow(["Примітки:"]);
    notesHeaderRow.getCell(1).font = { bold: true, name: "Arial" };

    const notesRow = worksheet.addRow([estimate.notes]);
    worksheet.mergeCells(`A${notesRow.number}:F${notesRow.number}`);
    notesRow.getCell(1).font = { name: "Arial" };
    notesRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  }

  // Генерація buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
