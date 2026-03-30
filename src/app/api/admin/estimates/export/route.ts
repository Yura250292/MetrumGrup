import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { format, estimate } = await request.json();

  if (format === "excel") {
    return generateExcel(estimate);
  } else if (format === "pdf") {
    return generatePDF(estimate);
  }

  return NextResponse.json({ error: "Невідомий формат" }, { status: 400 });
}

async function generateExcel(estimate: EstimateData) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "METRUM GROUP";
  workbook.created = new Date();

  const summary = estimate.summary || {};

  // Colors
  const orange = "FFD97706";
  const darkBg = "FF2D2D2D";
  const lightOrange = "FFFFF8F0";
  const lightGray = "FFF9FAFB";
  const white = "FFFFFFFF";
  const borderThin = { style: "thin" as const, color: { argb: "FFE5E7EB" } };
  const borders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };

  // ════════ MAIN SHEET ════════
  const ws = workbook.addWorksheet("Кошторис", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    properties: { defaultRowHeight: 18 },
  });

  // Column widths
  ws.columns = [
    { width: 6 },   // A: №
    { width: 52 },  // B: Опис
    { width: 10 },  // C: Од. вим.
    { width: 12 },  // D: Кількість
    { width: 18 },  // E: Ціна матеріалу
    { width: 20 },  // F: Вартість роботи
    { width: 18 },  // G: Разом
  ];

  // ─── ROW 1: Company name ───
  const r1 = ws.addRow(["METRUM GROUP"]);
  ws.mergeCells("A1:G1");
  r1.height = 32;
  r1.getCell(1).font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  r1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  r1.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  // Fill all merged cells with orange
  for (let c = 2; c <= 7; c++) {
    r1.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  }

  // ─── ROW 2: Contact info ───
  const r2 = ws.addRow(["м. Львів, вул. Антоновича, 120  |  067 743 01 01  |  contact@metrum.com.ua"]);
  ws.mergeCells("A2:G2");
  r2.height = 18;
  r2.getCell(1).font = { name: "Calibri", size: 9, color: { argb: "FF888888" } };
  r2.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  // ─── ROW 3: Spacer ───
  ws.addRow([]);

  // ─── ROW 4: Title ───
  const r4 = ws.addRow([estimate.title || "Кошторис"]);
  ws.mergeCells(`A${r4.number}:G${r4.number}`);
  r4.height = 28;
  r4.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF111111" } };
  r4.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

  // ─── ROW 5: Description ───
  if (estimate.description) {
    const r5 = ws.addRow([estimate.description]);
    ws.mergeCells(`A${r5.number}:G${r5.number}`);
    r5.getCell(1).font = { name: "Calibri", size: 10, color: { argb: "FF666666" } };
    r5.getCell(1).alignment = { vertical: "middle", wrapText: true };
  } else {
    ws.addRow([]);
  }

  // ─── ROW 6: Area ───
  if (estimate.area) {
    const r6 = ws.addRow([`Площа: ${estimate.area}`]);
    ws.mergeCells(`A${r6.number}:G${r6.number}`);
    r6.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF555555" } };
  } else {
    ws.addRow([]);
  }

  // Spacer
  ws.addRow([]);

  // ─── SUMMARY HEADER ───
  const summaryHeaderRow = ws.addRow(["ПІДСУМКИ КОШТОРИСУ"]);
  ws.mergeCells(`A${summaryHeaderRow.number}:G${summaryHeaderRow.number}`);
  summaryHeaderRow.height = 24;
  summaryHeaderRow.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  summaryHeaderRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
  summaryHeaderRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (let c = 2; c <= 7; c++) {
    summaryHeaderRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
  }

  // Summary labels
  const summaryLabels = ws.addRow(["", "Матеріали", "Роботи", `Накладні (${summary.overheadPercent || 15}%)`, "ВСЬОГО"]);
  summaryLabels.height = 22;
  for (let c = 2; c <= 5; c++) {
    const cell = summaryLabels.getCell(c);
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: orange.replace("FF", "") === "D97706" ? "FFD97706" : orange } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightOrange } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borders;
  }

  // Summary values
  const summaryValues = ws.addRow(["", summary.materialsCost || 0, summary.laborCost || 0, summary.overheadCost || 0, summary.totalBeforeDiscount || 0]);
  summaryValues.height = 28;
  const summaryColors = ["FF3B82F6", "FF22C55E", "FFF97316", orange]; // blue, green, light-orange, orange
  for (let c = 2; c <= 5; c++) {
    const cell = summaryValues.getCell(c);
    cell.numFmt = "#,##0";
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borders;
    if (c === 5) {
      // ВСЬОГО - orange background
      cell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
    } else {
      cell.font = { name: "Calibri", size: 13, bold: true, color: { argb: summaryColors[c - 2] } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };
    }
  }

  // Spacer
  ws.addRow([]);

  // ─── SECTIONS WITH ITEMS ───
  let globalItemNum = 0;
  for (const section of estimate.sections || []) {
    // Section header
    const sectionRow = ws.addRow([section.title]);
    ws.mergeCells(`A${sectionRow.number}:G${sectionRow.number}`);
    sectionRow.height = 26;
    sectionRow.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    sectionRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
    sectionRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    for (let c = 2; c <= 7; c++) {
      sectionRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
    }

    // Column headers
    const headerTexts = ["№", "Опис матеріалу / роботи", "Од. вим.", "Кількість", "Ціна матеріалу, ₴", "Вартість роботи, ₴", "Разом, ₴"];
    const headerRow = ws.addRow(headerTexts);
    headerRow.height = 22;
    for (let c = 1; c <= 7; c++) {
      const cell = headerRow.getCell(c);
      cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = borders;
    }

    // Items
    for (let ii = 0; ii < (section.items || []).length; ii++) {
      const item = section.items[ii];
      globalItemNum++;
      const isEven = ii % 2 === 0;
      const bg = isEven ? white : lightGray;

      const itemRow = ws.addRow([
        globalItemNum,
        item.description,
        item.unit,
        item.quantity,
        item.unitPrice,
        item.laborCost,
        item.totalCost,
      ]);
      itemRow.height = 20;

      // Style each cell
      // №
      itemRow.getCell(1).font = { name: "Calibri", size: 9, color: { argb: "FF666666" } };
      itemRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      itemRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      itemRow.getCell(1).border = borders;

      // Опис
      itemRow.getCell(2).font = { name: "Calibri", size: 9, color: { argb: "FF333333" } };
      itemRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      itemRow.getCell(2).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      itemRow.getCell(2).border = borders;

      // Од. вим.
      itemRow.getCell(3).font = { name: "Calibri", size: 9, color: { argb: "FF666666" } };
      itemRow.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      itemRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      itemRow.getCell(3).border = borders;

      // Кількість
      itemRow.getCell(4).font = { name: "Calibri", size: 9, color: { argb: "FF333333" } };
      itemRow.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      itemRow.getCell(4).alignment = { vertical: "middle", horizontal: "right" };
      itemRow.getCell(4).numFmt = "#,##0.00";
      itemRow.getCell(4).border = borders;

      // Ціна матеріалу
      itemRow.getCell(5).font = { name: "Calibri", size: 9, color: { argb: "FF333333" } };
      itemRow.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      itemRow.getCell(5).alignment = { vertical: "middle", horizontal: "right" };
      itemRow.getCell(5).numFmt = "#,##0";
      itemRow.getCell(5).border = borders;

      // Вартість роботи
      itemRow.getCell(6).font = { name: "Calibri", size: 9, color: { argb: "FF666666" } };
      itemRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      itemRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
      itemRow.getCell(6).numFmt = "#,##0";
      itemRow.getCell(6).border = borders;

      // Разом
      itemRow.getCell(7).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF111111" } };
      itemRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      itemRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
      itemRow.getCell(7).numFmt = "#,##0";
      itemRow.getCell(7).border = borders;
    }

    // Section total row
    const totalRow = ws.addRow([null, null, null, null, null, "Всього по секції:", section.sectionTotal || 0]);
    totalRow.height = 24;
    totalRow.getCell(6).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFD97706" } };
    totalRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightOrange } };
    totalRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
    totalRow.getCell(6).border = borders;
    totalRow.getCell(7).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFD97706" } };
    totalRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightOrange } };
    totalRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
    totalRow.getCell(7).numFmt = "#,##0";
    totalRow.getCell(7).border = borders;

    // Spacer
    ws.addRow([]);
  }

  // ─── GRAND TOTAL ───
  const grandTotalRow = ws.addRow([null, null, null, null, null, "ЗАГАЛЬНА ВАРТІСТЬ:", summary.totalBeforeDiscount || 0]);
  grandTotalRow.height = 32;
  for (let c = 1; c <= 7; c++) {
    grandTotalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  }
  grandTotalRow.getCell(6).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  grandTotalRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
  grandTotalRow.getCell(7).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  grandTotalRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
  grandTotalRow.getCell(7).numFmt = "#,##0";

  // ─── RECOMMENDATIONS ───
  if (summary.recommendations) {
    ws.addRow([]);
    const recHeader = ws.addRow(["Рекомендації"]);
    ws.mergeCells(`A${recHeader.number}:G${recHeader.number}`);
    recHeader.height = 22;
    recHeader.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFD97706" } };
    recHeader.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightOrange } };
    recHeader.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    for (let c = 2; c <= 7; c++) {
      recHeader.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightOrange } };
    }

    const recText = ws.addRow([summary.recommendations]);
    ws.mergeCells(`A${recText.number}:G${recText.number}`);
    recText.getCell(1).font = { name: "Calibri", size: 9, color: { argb: "FF555555" } };
    recText.getCell(1).alignment = { vertical: "top", wrapText: true };
    recText.height = 40;
  }

  // ════════ SECTION SHEETS ════════
  for (const section of estimate.sections || []) {
    // Sanitize sheet name
    let sheetName = section.title.replace(/[\\/*?[\]:]/g, "").substring(0, 31);
    if (!sheetName) sheetName = "Секція";
    let suffix = 1;
    let finalName = sheetName;
    while (workbook.getWorksheet(finalName)) {
      finalName = sheetName.substring(0, 28) + ` (${suffix})`;
      suffix++;
    }

    const sws = workbook.addWorksheet(finalName, {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    sws.columns = [
      { width: 6 }, { width: 52 }, { width: 10 }, { width: 12 },
      { width: 18 }, { width: 20 }, { width: 18 },
    ];

    // Headers
    const headerTexts = ["№", "Опис матеріалу / роботи", "Од. вим.", "Кількість", "Ціна матеріалу, ₴", "Вартість роботи, ₴", "Разом, ₴"];
    const hRow = sws.addRow(headerTexts);
    hRow.height = 22;
    for (let c = 1; c <= 7; c++) {
      const cell = hRow.getCell(c);
      cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBg } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = borders;
    }

    // Items
    for (let ii = 0; ii < (section.items || []).length; ii++) {
      const item = section.items[ii];
      const bg = ii % 2 === 0 ? white : lightGray;
      const row = sws.addRow([ii + 1, item.description, item.unit, item.quantity, item.unitPrice, item.laborCost, item.totalCost]);
      row.height = 20;

      const configs: { color: string; halign: "left" | "center" | "right"; fmt?: string; bold?: boolean }[] = [
        { color: "FF666666", halign: "center" },
        { color: "FF333333", halign: "left" },
        { color: "FF666666", halign: "center" },
        { color: "FF333333", halign: "right", fmt: "#,##0.00" },
        { color: "FF333333", halign: "right", fmt: "#,##0" },
        { color: "FF666666", halign: "right", fmt: "#,##0" },
        { color: "FF111111", halign: "right", fmt: "#,##0", bold: true },
      ];

      for (let c = 1; c <= 7; c++) {
        const cfg = configs[c - 1];
        const cell = row.getCell(c);
        cell.font = { name: "Calibri", size: 9, bold: cfg.bold, color: { argb: cfg.color } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.alignment = { vertical: "middle", horizontal: cfg.halign, wrapText: c === 2 };
        if (cfg.fmt) cell.numFmt = cfg.fmt;
        cell.border = borders;
      }
    }

    // Total
    const tRow = sws.addRow(["", "", "", "", "", "Всього по секції:", section.sectionTotal || 0]);
    tRow.height = 24;
    tRow.getCell(6).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFD97706" } };
    tRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightOrange } };
    tRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
    tRow.getCell(6).border = borders;
    tRow.getCell(7).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFD97706" } };
    tRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightOrange } };
    tRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
    tRow.getCell(7).numFmt = "#,##0";
    tRow.getCell(7).border = borders;
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="koshtorys-${Date.now()}.xlsx"`,
    },
  });
}

async function generatePDF(estimate: EstimateData) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const { ROBOTO_BASE64 } = await import("@/lib/fonts/roboto-base64");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Register Cyrillic font
  doc.addFileToVFS("Roboto.ttf", ROBOTO_BASE64);
  doc.addFont("Roboto.ttf", "Roboto", "normal");
  doc.setFont("Roboto");

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;

  // ─── PAGE 1: COVER ───
  // Orange accent bar at top
  doc.setFillColor(217, 119, 6);
  doc.rect(0, 0, pageW, 4, "F");

  // Logo area
  doc.setFillColor(217, 119, 6);
  doc.roundedRect(margin, 15, 12, 12, 2, 2, "F");
  doc.setFont("Roboto");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("M", margin + 3.5, 23.5);

  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text("METRUM GROUP", margin + 16, 22);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("м. Львів, вул. Антоновича, 120 | 067 743 01 01 | contact@metrum.com.ua", margin + 16, 27);

  // Divider
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, 33, pageW - margin, 33);

  // Title
  doc.setFontSize(22);
  doc.setTextColor(17, 17, 17);
  const titleLines = doc.splitTextToSize(estimate.title || "Кошторис", contentW);
  doc.text(titleLines, margin, 48);

  let y = 48 + titleLines.length * 9;

  // Description & Area
  if (estimate.description) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const descLines = doc.splitTextToSize(estimate.description, contentW);
    doc.text(descLines, margin, y + 3);
    y += descLines.length * 5 + 5;
  }

  if (estimate.area) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Площа: ${estimate.area}`, margin, y + 2);
    y += 8;
  }

  // Summary box
  y += 5;
  const summary = estimate.summary || {};
  const boxH = 38;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y, contentW, boxH, 3, 3, "F");
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(margin, y, contentW, boxH, 3, 3, "S");

  const cols = 4;
  const colW = contentW / cols;
  const summaryItems = [
    { label: "Матеріали", value: fNum(summary.materialsCost || 0), color: [59, 130, 246] },
    { label: "Роботи", value: fNum(summary.laborCost || 0), color: [34, 197, 94] },
    { label: `Накладні (${summary.overheadPercent || 15}%)`, value: fNum(summary.overheadCost || 0), color: [249, 115, 22] },
    { label: "ВСЬОГО", value: fNum(summary.totalBeforeDiscount || 0), color: [217, 119, 6] },
  ];

  summaryItems.forEach((item, i) => {
    const cx = margin + colW * i + colW / 2;
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(item.label, cx, y + 12, { align: "center" });

    doc.setFontSize(13);
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.value + " ₴", cx, y + 22, { align: "center" });
  });

  y += boxH + 12;

  // ─── SECTIONS ───
  for (const section of estimate.sections || []) {
    // Check if we need a new page
    if (y > 240) {
      doc.addPage();
      // Top bar on new pages
      doc.setFillColor(217, 119, 6);
      doc.rect(0, 0, pageW, 2, "F");
      y = 15;
    }

    // Section header
    doc.setFillColor(217, 119, 6);
    doc.roundedRect(margin, y, contentW, 8, 1.5, 1.5, "F");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(section.title, margin + 4, y + 5.5);

    y += 12;

    // Table
    const tableBody = (section.items || []).map((item: EstimateItem, i: number) => [
      String(i + 1),
      item.description,
      item.unit,
      String(item.quantity),
      fNum(item.unitPrice),
      fNum(item.laborCost),
      fNum(item.totalCost),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["#", "Опис", "Од.", "К-ть", "Матеріал, ₴", "Робота, ₴", "Разом, ₴"]],
      body: tableBody,
      foot: [["", "", "", "", "", "Усього:", fNum(section.sectionTotal || 0)]],
      styles: {
        font: "Roboto",
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [50, 50, 50],
        lineColor: [230, 230, 230],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [45, 45, 45],
        textColor: [255, 255, 255],
        fontStyle: "normal",
        fontSize: 7,
      },
      footStyles: {
        fillColor: [255, 248, 240],
        textColor: [217, 119, 6],
        fontStyle: "normal",
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [252, 252, 252],
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 12, halign: "center" },
        3: { cellWidth: 14, halign: "right" },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 24, halign: "right" },
      },
      theme: "grid",
      margin: { left: margin, right: margin },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ─── FINAL TOTAL ───
  if (y > 250) {
    doc.addPage();
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, pageW, 2, "F");
    y = 15;
  }

  // Grand total box
  doc.setFillColor(217, 119, 6);
  doc.roundedRect(margin, y, contentW, 16, 3, 3, "F");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("ЗАГАЛЬНА ВАРТІСТЬ ПРОЄКТУ:", margin + 5, y + 10.5);
  doc.setFontSize(16);
  doc.text(fNum(summary.totalBeforeDiscount || 0) + " ₴", pageW - margin - 5, y + 10.5, { align: "right" });

  y += 24;

  // Recommendations
  if (summary.recommendations) {
    if (y > 260) {
      doc.addPage();
      y = 15;
    }
    doc.setFillColor(255, 251, 245);
    const recLines = doc.splitTextToSize(summary.recommendations, contentW - 10);
    const recH = recLines.length * 4.5 + 14;
    doc.roundedRect(margin, y, contentW, recH, 2, 2, "F");
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, recH, 2, 2, "S");

    doc.setFontSize(8);
    doc.setTextColor(217, 119, 6);
    doc.text("Рекомендації", margin + 5, y + 7);

    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(recLines, margin + 5, y + 14);
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(
      `METRUM GROUP | Кошторис | Сторінка ${i} з ${totalPages}`,
      pageW / 2, 290,
      { align: "center" }
    );
    // Bottom accent line
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.5);
    doc.line(margin, 286, pageW - margin, 286);
  }

  const pdfBuffer = doc.output("arraybuffer");

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="koshtorys-metrum-${Date.now()}.pdf"`,
    },
  });
}

function fNum(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "0";
  return num.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

type EstimateItem = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  laborCost: number;
  totalCost: number;
};

type EstimateData = {
  title: string;
  description?: string;
  area?: string;
  sections: {
    title: string;
    items: EstimateItem[];
    sectionTotal: number;
  }[];
  summary?: {
    materialsCost?: number;
    laborCost?: number;
    overheadPercent?: number;
    overheadCost?: number;
    totalBeforeDiscount?: number;
    recommendations?: string;
  };
};
