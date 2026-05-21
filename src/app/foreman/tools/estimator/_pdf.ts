/**
 * PDF-експорт estimator-у. Динамічний імпорт jspdf + jspdf-autotable + Roboto
 * (для кирилиці). SVG плану конвертується в PNG dataURL через canvas.
 */

import { SURFACE_LABELS } from "@/lib/foreman/material-presets";
import type { Surface } from "@/lib/foreman/material-presets";
import { formatMoney, formatNum } from "@/lib/foreman/format";
import type { LineItem } from "./_results";
import type { FloorPlan } from "./_types";

async function svgToPngDataUrl(svg: SVGSVGElement, maxWidth = 1200): Promise<string | null> {
  try {
    const cloned = svg.cloneNode(true) as SVGSVGElement;
    if (!cloned.getAttribute("xmlns")) {
      cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    const serialized = new XMLSerializer().serializeToString(cloned);
    const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
      const vb = svg.viewBox.baseVal;
      const aspect = vb && vb.width > 0 ? vb.height / vb.width : (svg.clientHeight || 600) / (svg.clientWidth || 800);
      const w = maxWidth;
      const h = Math.round(w * aspect);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.warn("[estimator] SVG snapshot failed", e);
    return null;
  }
}

interface ExportArgs {
  plan: FloorPlan;
  lines: LineItem[];
  grandTotal: number;
  grandMaterial: number;
  grandLabor: number;
  perRoomTotals: Record<string, { material: number; labor: number; total: number }>;
  svgEl: SVGSVGElement | null;
}

export async function exportEstimatePDF(args: ExportArgs): Promise<void> {
  const { plan, lines, grandTotal, grandMaterial, grandLabor, perRoomTotals, svgEl } = args;
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const { ROBOTO_BASE64 } = await import("@/lib/fonts/roboto-base64");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addFileToVFS("Roboto.ttf", ROBOTO_BASE64);
  doc.addFont("Roboto.ttf", "Roboto", "normal");
  doc.setFont("Roboto");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  doc.setFillColor(139, 92, 246);
  doc.rect(0, 0, pageW, 4, "F");

  doc.setFontSize(18);
  doc.setTextColor(17, 17, 17);
  doc.text("Попередній кошторис", margin, 18);

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const today = new Date().toLocaleDateString("uk-UA");
  doc.text(`Дата: ${today}`, margin, 25);

  const totalArea = plan.rooms.reduce((s, r) => s + r.w * r.h, 0);
  doc.text(
    `Кімнат: ${plan.rooms.length}  ·  Загальна підлога: ${formatNum(totalArea)} м²`,
    margin,
    30,
  );

  let y = 36;

  if (svgEl) {
    const png = await svgToPngDataUrl(svgEl, 1400);
    if (png) {
      const imgW = contentW;
      const im = await new Promise<HTMLImageElement | null>((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => resolve(null);
        i.src = png;
      });
      if (im) {
        const aspect = im.naturalHeight / im.naturalWidth;
        const imgH = Math.min(imgW * aspect, 110);
        doc.addImage(png, "PNG", margin, y, imgW, imgH);
        y += imgH + 6;
      }
    }
  }

  const byRoom = new Map<string, LineItem[]>();
  for (const l of lines) {
    if (!byRoom.has(l.roomId)) byRoom.set(l.roomId, []);
    byRoom.get(l.roomId)!.push(l);
  }

  for (const [roomId, roomLines] of byRoom) {
    const room = plan.rooms.find((r) => r.id === roomId);
    if (!room) continue;

    if (y > pageH - 60) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(12);
    doc.setTextColor(17, 17, 17);
    doc.text(room.name, margin, y);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    const tot = perRoomTotals[roomId] ?? { material: 0, labor: 0, total: 0 };
    doc.text(
      `${room.w}×${room.h} м · h ${room.ceilingHeight} м · підлога ${formatNum(room.w * room.h)} м²  |  Р ${formatMoney(tot.labor)} · М ${formatMoney(tot.material)} · ₴ ${formatMoney(tot.total)}`,
      margin,
      y + 4,
    );
    y += 7;

    const rows = roomLines.map((l) => [
      `${l.kind === "labor" ? "Р" : "М"} · ${SURFACE_LABELS[l.surface]}: ${l.name}`,
      l.unit,
      l.qty < 10 && l.kind === "material" && l.material?.qtyMode !== "tile" && l.material?.qtyMode !== "drywall"
        ? formatNum(l.qty)
        : l.kind === "material" && (l.material?.qtyMode === "tile" || l.material?.qtyMode === "drywall")
          ? String(Math.ceil(l.qty))
          : formatNum(l.qty),
      l.unitPrice > 0 ? formatMoney(l.unitPrice) : "—",
      l.unitPrice > 0 ? formatMoney(l.total) : "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Позиція", "Од.", "К-сть", "Ціна, ₴", "Сума, ₴"]],
      body: rows,
      styles: { font: "Roboto", fontSize: 9, cellPadding: 1.6 },
      headStyles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: "normal" },
      columnStyles: {
        1: { halign: "center", cellWidth: 14 },
        2: { halign: "right", cellWidth: 22 },
        3: { halign: "right", cellWidth: 26 },
        4: { halign: "right", cellWidth: 28 },
      },
      margin: { left: margin, right: margin },
    });
    const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y = lastY + 8;
  }

  if (y > pageH - 50) {
    doc.addPage();
    y = margin;
  }
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentW, 38, 3, 3, "F");

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("Підсумок", margin + 4, y + 7);

  const summaryRows: [string, number][] = [
    ["Матеріали", grandMaterial],
    ["Робота", grandLabor],
  ];
  let sy = y + 13;
  for (const [label, v] of summaryRows) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin + 4, sy);
    doc.setTextColor(17, 17, 17);
    doc.text(v > 0 ? `${formatMoney(v)} ₴` : "—", pageW - margin - 4, sy, { align: "right" });
    sy += 5;
  }

  doc.setFontSize(12);
  doc.setTextColor(16, 185, 129);
  doc.text("Разом", margin + 4, y + 34);
  doc.text(`${formatMoney(grandTotal)} ₴`, pageW - margin - 4, y + 34, { align: "right" });

  const fileName = `koshtoryss-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
