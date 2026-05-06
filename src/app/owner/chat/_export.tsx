"use client";

/**
 * Експорт повідомлень AI чату як PDF (через html2canvas + jsPDF) і
 * текстовий файл (markdown). Шукай dynamic import щоб не роздувати
 * первинний бандл — pdf libs використовуються рідко.
 */

export async function exportMessageToPdf(
  element: HTMLElement | null,
  filename: string,
): Promise<void> {
  if (!element) return;

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Render element to canvas. Use white bg для PDF читабельності.
  const canvas = await html2canvas(element, {
    backgroundColor: "#fafafa",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  const imgWidth = pageWidth - 40;
  const imgHeight = imgWidth / ratio;

  if (imgHeight <= pageHeight - 40) {
    pdf.addImage(imgData, "PNG", 20, 20, imgWidth, imgHeight);
  } else {
    // Багатосторінкова: ріжемо на висоту сторінки
    let y = 0;
    const sliceHeightPx = ((pageHeight - 40) * canvas.width) / imgWidth;
    while (y < canvas.height) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(sliceHeightPx, canvas.height - y);
      const ctx = slice.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(canvas, 0, -y);
      const sliceData = slice.toDataURL("image/png");
      pdf.addImage(
        sliceData,
        "PNG",
        20,
        20,
        imgWidth,
        (slice.height * imgWidth) / slice.width,
      );
      y += slice.height;
      if (y < canvas.height) pdf.addPage();
    }
  }
  pdf.save(`${filename}.pdf`);
}

export function exportMessageToText(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTableToCsv(
  rows: Array<Record<string, string | number | null | undefined>>,
  filename: string,
): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          // Escape quotes / commas
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    ),
  ].join("\n");

  // BOM для коректного відображення кирилиці у Excel
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportTableToXlsx(
  rows: Array<Record<string, string | number | null | undefined>>,
  filename: string,
  sheetName = "Дані",
): Promise<void> {
  if (rows.length === 0) return;
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
