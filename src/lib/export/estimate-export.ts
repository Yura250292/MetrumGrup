import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";

type EstimateWithDetails = Prisma.EstimateGetPayload<{
  include: {
    project: {
      include: {
        client: { select: { name: true; email: true; phone: true } };
      };
    };
    items: true;
    createdBy: { select: { name: true } };
  };
}>;

/**
 * Генерує PDF кошторису для клієнта
 */
export async function generateEstimatePDF(estimate: EstimateWithDetails): Promise<Buffer> {
  const doc = new jsPDF();

  // Заголовок
  doc.setFontSize(18);
  doc.text("КОШТОРИС", 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.text(`№ ${estimate.number}`, 105, 28, { align: "center" });
  doc.text(`від ${new Date(estimate.createdAt).toLocaleDateString("uk-UA")}`, 105, 34, { align: "center" });

  // Інформація про проєкт
  doc.setFontSize(11);
  doc.text("Інформація про проєкт:", 14, 45);
  doc.setFontSize(9);
  doc.text(`Назва: ${estimate.project.title}`, 14, 52);
  doc.text(`Клієнт: ${estimate.project.client.name}`, 14, 58);
  if (estimate.project.client.phone) {
    doc.text(`Телефон: ${estimate.project.client.phone}`, 14, 64);
  }

  // Опис кошторису
  let currentY = estimate.project.client.phone ? 72 : 66;
  doc.setFontSize(11);
  doc.text(`Кошторис: ${estimate.title}`, 14, currentY);

  if (estimate.description) {
    currentY += 6;
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(estimate.description, 180);
    doc.text(descLines, 14, currentY);
    currentY += descLines.length * 5;
  }

  currentY += 10;

  // Таблиця позицій
  const tableData = estimate.items.map((item, idx) => [
    String(idx + 1),
    item.description,
    item.unit,
    Number(item.quantity).toFixed(2),
    Number(item.priceWithMargin).toFixed(2),
    Number(item.amount).toFixed(2),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [["№", "Найменування робіт", "Од.", "Кільк.", "Ціна, грн", "Сума, грн"]],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [255, 132, 0], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 80 },
      2: { cellWidth: 15 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 30, halign: "right" },
    },
    theme: "grid",
  });

  // Підсумки
  const finalY = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(10);
  doc.text("Підсумок:", 130, finalY);
  doc.text(`Матеріали: ${Number(estimate.totalMaterials).toFixed(2)} грн`, 130, finalY + 6);
  doc.text(`Роботи: ${Number(estimate.totalLabor).toFixed(2)} грн`, 130, finalY + 12);
  doc.text(`Накладні: ${Number(estimate.totalOverhead).toFixed(2)} грн`, 130, finalY + 18);

  if (Number(estimate.discount) > 0) {
    doc.text(`Знижка (${Number(estimate.discount)}%): -${(Number(estimate.totalAmount) * Number(estimate.discount) / 100).toFixed(2)} грн`, 130, finalY + 24);
  }

  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text(
    `Разом до сплати: ${Number(estimate.finalAmount).toFixed(2)} грн`,
    130,
    finalY + (Number(estimate.discount) > 0 ? 32 : 26)
  );

  // Примітки
  if (estimate.notes) {
    const notesY = finalY + (Number(estimate.discount) > 0 ? 42 : 36);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text("Примітки:", 14, notesY);
    const notesLines = doc.splitTextToSize(estimate.notes, 180);
    doc.text(notesLines, 14, notesY + 5);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Генерує Excel кошторису для клієнта
 */
export async function generateEstimateExcel(estimate: EstimateWithDetails): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Кошторис");

  // Заголовок
  worksheet.mergeCells("A1:F1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "КОШТОРИС";
  titleCell.font = { size: 18, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.mergeCells("A2:F2");
  const numberCell = worksheet.getCell("A2");
  numberCell.value = `№ ${estimate.number} від ${new Date(estimate.createdAt).toLocaleDateString("uk-UA")}`;
  numberCell.font = { size: 11 };
  numberCell.alignment = { horizontal: "center" };

  // Інформація про проєкт
  worksheet.addRow([]);
  worksheet.addRow(["Інформація про проєкт:"]);
  worksheet.getCell("A4").font = { bold: true };

  worksheet.addRow(["Назва:", estimate.project.title]);
  worksheet.addRow(["Клієнт:", estimate.project.client.name]);
  if (estimate.project.client.phone) {
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
  const headerRow = worksheet.addRow(["№", "Найменування робіт", "Од. виміру", "Кількість", "Ціна, грн", "Сума, грн"]);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF8400" },
  };
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
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
  worksheet.addRow(["", "", "", "", "Матеріали:", Number(estimate.totalMaterials)]);
  worksheet.addRow(["", "", "", "", "Роботи:", Number(estimate.totalLabor)]);
  worksheet.addRow(["", "", "", "", "Накладні:", Number(estimate.totalOverhead)]);

  if (Number(estimate.discount) > 0) {
    worksheet.addRow([
      "",
      "",
      "",
      "",
      `Знижка (${Number(estimate.discount)}%):`,
      -(Number(estimate.totalAmount) * Number(estimate.discount)) / 100,
    ]);
  }

  const totalRow = worksheet.addRow(["", "", "", "", "РАЗОМ ДО СПЛАТИ:", Number(estimate.finalAmount)]);
  totalRow.font = { bold: true, size: 12 };
  totalRow.getCell(6).numFmt = "#,##0.00";

  // Ширина колонок
  worksheet.getColumn(1).width = 8;
  worksheet.getColumn(2).width = 50;
  worksheet.getColumn(3).width = 15;
  worksheet.getColumn(4).width = 12;
  worksheet.getColumn(5).width = 15;
  worksheet.getColumn(6).width = 15;

  // Генерація buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
