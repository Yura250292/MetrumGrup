/**
 * Excel-експорт estimator-у. Використовує exceljs (вже в repo). Одна вкладка
 * "Кошторис" з угрупуванням по кімнатах + підсумкова вкладка.
 */

import { SURFACE_LABELS } from "@/lib/foreman/material-presets";
import { formatNum } from "@/lib/foreman/format";
import type { LineItem } from "./_results";
import type { FloorPlan } from "./_types";

interface ExportArgs {
  plan: FloorPlan;
  lines: LineItem[];
  grandTotal: number;
  grandMaterial: number;
  grandLabor: number;
  perRoomTotals: Record<string, { material: number; labor: number; total: number }>;
}

export async function exportEstimateXLSX(args: ExportArgs): Promise<void> {
  const { plan, lines, grandTotal, grandMaterial, grandLabor, perRoomTotals } = args;
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Metrum Foreman Estimator";
  wb.created = new Date();

  const ws = wb.addWorksheet("Кошторис");

  ws.columns = [
    { header: "Кімната", key: "room", width: 18 },
    { header: "Поверхня", key: "surface", width: 12 },
    { header: "Тип", key: "kind", width: 10 },
    { header: "Позиція", key: "name", width: 36 },
    { header: "Од.", key: "unit", width: 8 },
    { header: "К-сть", key: "qty", width: 10 },
    { header: "Ціна, ₴", key: "price", width: 12 },
    { header: "Сума, ₴", key: "total", width: 14 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF8B5CF6" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  // group lines by room
  const byRoom = new Map<string, LineItem[]>();
  for (const l of lines) {
    if (!byRoom.has(l.roomId)) byRoom.set(l.roomId, []);
    byRoom.get(l.roomId)!.push(l);
  }

  let rowIdx = 2;
  for (const [roomId, roomLines] of byRoom) {
    const room = plan.rooms.find((r) => r.id === roomId);
    if (!room) continue;

    for (const l of roomLines) {
      const r = ws.addRow({
        room: room.name,
        surface: SURFACE_LABELS[l.surface],
        kind: l.kind === "labor" ? "Робота" : "Матеріал",
        name: l.name,
        unit: l.unit,
        qty: Number(l.qty.toFixed(2)),
        price: l.unitPrice > 0 ? Number(l.unitPrice.toFixed(2)) : null,
        total: l.unitPrice > 0 ? Number(l.total.toFixed(2)) : null,
      });
      r.getCell("qty").numFmt = "#,##0.00";
      r.getCell("price").numFmt = "#,##0.00";
      r.getCell("total").numFmt = "#,##0.00";
      if (l.kind === "labor") {
        r.getCell("kind").font = { color: { argb: "FFC2410C" }, bold: true };
      }
      rowIdx++;
    }

    // room subtotal
    const tot = perRoomTotals[roomId] ?? { material: 0, labor: 0, total: 0 };
    const sub = ws.addRow({
      room: "",
      surface: "",
      kind: "",
      name: `Підсумок «${room.name}»`,
      unit: "",
      qty: null,
      price: null,
      total: Number(tot.total.toFixed(2)),
    });
    sub.font = { bold: true };
    sub.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5F5F5" },
    };
    sub.getCell("total").numFmt = "#,##0.00";
    rowIdx++;
  }

  // grand totals
  ws.addRow({});
  const matRow = ws.addRow({
    room: "",
    surface: "",
    kind: "",
    name: "Матеріали разом",
    unit: "",
    qty: null,
    price: null,
    total: Number(grandMaterial.toFixed(2)),
  });
  matRow.font = { bold: true };
  matRow.getCell("total").numFmt = "#,##0.00";

  const labRow = ws.addRow({
    room: "",
    surface: "",
    kind: "",
    name: "Робота разом",
    unit: "",
    qty: null,
    price: null,
    total: Number(grandLabor.toFixed(2)),
  });
  labRow.font = { bold: true };
  labRow.getCell("total").numFmt = "#,##0.00";

  const grand = ws.addRow({
    room: "",
    surface: "",
    kind: "",
    name: "РАЗОМ",
    unit: "",
    qty: null,
    price: null,
    total: Number(grandTotal.toFixed(2)),
  });
  grand.font = { bold: true, size: 13, color: { argb: "FF065F46" } };
  grand.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD1FAE5" },
  };
  grand.getCell("total").numFmt = "#,##0.00";

  // info sheet з характеристиками плану
  const info = wb.addWorksheet("План");
  info.columns = [
    { header: "Кімната", key: "name", width: 22 },
    { header: "Довжина, м", key: "w", width: 12 },
    { header: "Ширина, м", key: "h", width: 12 },
    { header: "Висота, м", key: "ch", width: 12 },
    { header: "Підлога, м²", key: "floor", width: 14 },
    { header: "Стіни, м²", key: "walls", width: 14 },
  ];
  const ih = info.getRow(1);
  ih.font = { bold: true, color: { argb: "FFFFFFFF" } };
  ih.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B5CF6" } };
  for (const room of plan.rooms) {
    const subtract = plan.openings
      .filter((o) => o.roomId === room.id)
      .reduce((s, o) => s + o.width * o.height, 0);
    const wallsArea = Math.max(0, 2 * (room.w + room.h) * room.ceilingHeight - subtract);
    info.addRow({
      name: room.name,
      w: room.w,
      h: room.h,
      ch: room.ceilingHeight,
      floor: Number((room.w * room.h).toFixed(2)),
      walls: Number(wallsArea.toFixed(2)),
    });
  }

  if (plan.openings.length > 0) {
    const ow = wb.addWorksheet("Прорізи");
    ow.columns = [
      { header: "Кімната", key: "room", width: 20 },
      { header: "Тип", key: "type", width: 10 },
      { header: "Сторона", key: "side", width: 10 },
      { header: "Зсув, м", key: "offset", width: 10 },
      { header: "Ширина, м", key: "w", width: 10 },
      { header: "Висота, м", key: "h", width: 10 },
      { header: "Площа, м²", key: "area", width: 12 },
    ];
    const oh = ow.getRow(1);
    oh.font = { bold: true, color: { argb: "FFFFFFFF" } };
    oh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B5CF6" } };
    for (const o of plan.openings) {
      const room = plan.rooms.find((r) => r.id === o.roomId);
      ow.addRow({
        room: room?.name ?? o.roomId,
        type: o.type === "door" ? "Двері" : "Вікно",
        side: o.side,
        offset: Number(o.offset.toFixed(2)),
        w: Number(o.width.toFixed(2)),
        h: Number(o.height.toFixed(2)),
        area: Number((o.width * o.height).toFixed(2)),
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `koshtoryss-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // formatNum imported in case future formatting tweaks are needed
  void formatNum;
}
