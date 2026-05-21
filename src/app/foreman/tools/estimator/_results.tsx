"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Info, Loader2, Sparkles, Trash2, Wrench } from "lucide-react";
import {
  DEFAULT_TILE_SIZE,
  LABOR_PRESETS,
  SURFACE_LABELS,
  UNIT_LABELS,
  calcQty,
  presetsForWorkType,
} from "@/lib/foreman/material-presets";
import type { LaborPreset, MaterialPreset, Surface, WorkType } from "@/lib/foreman/material-presets";
import type { Room } from "@/lib/foreman/geometry";
import { formatMoney, formatNum } from "@/lib/foreman/format";
import type { FloorPlan, Opening, PricesConfig, WorksConfig } from "./_types";
import { PlanSvg } from "./_plan-svg";

interface Props {
  plan: FloorPlan;
  works: WorksConfig;
  prices: PricesConfig;
  firmId: string | null;
  onSetPrice: (roomId: string, presetId: string, value: number) => void;
  onReset: () => void;
}

export type LineKind = "material" | "labor";

export interface LineItem {
  id: string;            // унікальний клієнтський ключ
  priceKey: string;      // `${roomId}:${presetId}` — для prices state
  roomId: string;
  roomName: string;
  surface: Surface;
  workType: WorkType;
  kind: LineKind;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
  /** Для матеріалу. */
  material?: MaterialPreset;
  /** Для роботи. */
  labor?: LaborPreset;
  /** Назва для запиту в quote API. */
  quoteName: string;
}

interface Quote {
  source: "supplier" | "market" | "none";
  price: number | null;
  unit: string | null;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceDate?: string | null;
  supplierName?: string;
  lastSeenAt?: string;
  note?: string;
}

function wallArea(room: Room, openings: Opening[]): number {
  const base = 2 * (room.w + room.h) * room.ceilingHeight;
  const subtract = openings
    .filter((o) => o.roomId === room.id)
    .reduce((s, o) => s + o.width * o.height, 0);
  return Math.max(0, base - subtract);
}

function areaFor(room: Room, surface: Surface, openings: Opening[]): number {
  if (surface === "floor" || surface === "ceiling") return room.w * room.h;
  return wallArea(room, openings);
}

export function Results({ plan, works, prices, firmId, onSetPrice, onReset }: Props) {
  const [exporting, setExporting] = useState<null | "pdf" | "xlsx">(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const lines = useMemo<LineItem[]>(() => {
    const out: LineItem[] = [];
    for (const room of plan.rooms) {
      const rCfg = works.rooms[room.id] ?? {};
      for (const surface of ["floor", "walls", "ceiling"] as Surface[]) {
        const wts = rCfg[surface] ?? [];
        const area = areaFor(room, surface, plan.openings);
        for (const wt of wts) {
          // 1) labor line per worktype
          const labor = LABOR_PRESETS[wt];
          const laborPriceKey = `${room.id}:labor-${wt}`;
          const laborUnitPrice = prices.unitPrices[laborPriceKey] ?? 0;
          out.push({
            id: `${room.id}:labor:${wt}`,
            priceKey: laborPriceKey,
            roomId: room.id,
            roomName: room.name,
            surface,
            workType: wt,
            kind: "labor",
            name: labor.name,
            unit: "м²",
            qty: area,
            unitPrice: laborUnitPrice,
            total: area * laborUnitPrice,
            labor,
            quoteName: labor.marketQuery,
          });

          // 2) material lines
          for (const preset of presetsForWorkType(wt)) {
            const tile = works.tileSizes[`${room.id}:${surface}`] ?? DEFAULT_TILE_SIZE;
            const thicknessCm = works.thicknessCm[`${room.id}:${wt}`] ?? 1;
            const qty = calcQty(preset, area, { tileW: tile.w, tileH: tile.h, thicknessCm });
            const priceKey = `${room.id}:${preset.id}`;
            const unitPrice = prices.unitPrices[priceKey] ?? 0;
            out.push({
              id: `${room.id}:mat:${preset.id}`,
              priceKey,
              roomId: room.id,
              roomName: room.name,
              surface,
              workType: wt,
              kind: "material",
              name: preset.name,
              unit: UNIT_LABELS[preset.unit],
              qty,
              unitPrice,
              total: qty * unitPrice,
              material: preset,
              quoteName: preset.name,
            });
          }
        }
      }
    }
    return out;
  }, [plan.rooms, plan.openings, works, prices.unitPrices]);

  // Auto-quote on mount / when set of unique items changes.
  const uniqueQuoteRequests = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; unit?: string; kind: LineKind }>();
    for (const l of lines) {
      const key = `${l.kind}:${l.quoteName}`;
      if (!seen.has(key)) {
        seen.set(key, { id: key, name: l.quoteName, unit: l.unit, kind: l.kind });
      }
    }
    return Array.from(seen.values());
  }, [lines]);

  useEffect(() => {
    void firmId;
    const todo = uniqueQuoteRequests.filter((q) => !quotes[q.id]);
    if (todo.length === 0) return;
    let aborted = false;
    setQuoteLoading(true);
    setQuoteError(null);
    (async () => {
      try {
        const res = await fetch("/api/foreman/material-quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: todo }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { quotes: Record<string, Quote> };
        if (aborted) return;
        setQuotes((prev) => ({ ...prev, ...json.quotes }));
        // Auto-fill: для кожного line, якщо ціна ще не задана — підставити з quote.
        for (const line of lines) {
          if (line.unitPrice > 0) continue;
          const key = `${line.kind}:${line.quoteName}`;
          const q = json.quotes[key];
          if (q && q.price != null && q.price > 0) {
            onSetPrice(
              line.roomId,
              line.kind === "labor" ? `labor-${line.workType}` : (line.material?.id ?? line.id),
              q.price,
            );
          }
        }
      } catch (e) {
        if (!aborted) setQuoteError(e instanceof Error ? e.message : "Не вдалося отримати ціни");
      } finally {
        if (!aborted) setQuoteLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueQuoteRequests]);

  // group lines by room → workType → (labor + materials)
  const byRoom = useMemo(() => {
    const m = new Map<string, LineItem[]>();
    for (const l of lines) {
      if (!m.has(l.roomId)) m.set(l.roomId, []);
      m.get(l.roomId)!.push(l);
    }
    return m;
  }, [lines]);

  const perRoomTotals = useMemo(() => {
    const m: Record<string, { material: number; labor: number; total: number }> = {};
    for (const l of lines) {
      if (!m[l.roomId]) m[l.roomId] = { material: 0, labor: 0, total: 0 };
      const isCounted = l.unitPrice > 0;
      if (!isCounted) continue;
      if (l.kind === "labor") m[l.roomId].labor += l.total;
      else m[l.roomId].material += l.total;
      m[l.roomId].total += l.total;
    }
    return m;
  }, [lines]);

  const grandTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (l.unitPrice > 0 ? l.total : 0), 0),
    [lines],
  );
  const grandMaterial = useMemo(
    () =>
      lines
        .filter((l) => l.kind === "material" && l.unitPrice > 0)
        .reduce((s, l) => s + l.total, 0),
    [lines],
  );
  const grandLabor = useMemo(
    () =>
      lines
        .filter((l) => l.kind === "labor" && l.unitPrice > 0)
        .reduce((s, l) => s + l.total, 0),
    [lines],
  );

  const handleExportPDF = async () => {
    if (exporting) return;
    setExporting("pdf");
    try {
      const { exportEstimatePDF } = await import("./_pdf");
      const svgEl = document.querySelector<SVGSVGElement>("svg[data-estimator-plan]");
      await exportEstimatePDF({
        plan,
        lines,
        grandTotal,
        grandMaterial,
        grandLabor,
        perRoomTotals,
        svgEl,
      });
    } catch (e) {
      console.error("[estimator] PDF export failed", e);
      alert("Не вдалося згенерувати PDF");
    } finally {
      setExporting(null);
    }
  };

  const handleExportXLSX = async () => {
    if (exporting) return;
    setExporting("xlsx");
    try {
      const { exportEstimateXLSX } = await import("./_excel");
      await exportEstimateXLSX({ plan, lines, grandTotal, grandMaterial, grandLabor, perRoomTotals });
    } catch (e) {
      console.error("[estimator] XLSX export failed", e);
      alert("Не вдалося згенерувати Excel");
    } finally {
      setExporting(null);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 text-center">
        <p className="text-sm text-zinc-400">
          Поверніться назад і виберіть хоча б один вид робіт.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        aria-hidden
        className="absolute -left-[9999px] top-0 w-[800px] h-[600px] pointer-events-none"
      >
        <PlanSvg plan={plan} snapshot className="w-full h-full" />
      </div>

      {quoteLoading && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-200 text-xs">
          <Loader2 size={14} className="animate-spin" />
          AI шукає актуальні ціни у довіднику та в інтернеті…
        </div>
      )}
      {quoteError && (
        <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          {quoteError} — ціни можна ввести вручну.
        </div>
      )}

      {Array.from(byRoom.entries()).map(([roomId, roomLines]) => {
        const room = plan.rooms.find((r) => r.id === roomId);
        if (!room) return null;
        const bySurface = new Map<Surface, LineItem[]>();
        for (const l of roomLines) {
          if (!bySurface.has(l.surface)) bySurface.set(l.surface, []);
          bySurface.get(l.surface)!.push(l);
        }
        const tot = perRoomTotals[roomId] ?? { material: 0, labor: 0, total: 0 };
        return (
          <section
            key={roomId}
            className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 overflow-hidden"
          >
            <header className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{room.name}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                    {room.w}×{room.h} м · h {room.ceilingHeight} м · підлога{" "}
                    {formatNum(room.w * room.h)} м² · стіни{" "}
                    {formatNum(wallArea(room, plan.openings))} м²
                    {plan.openings.some((o) => o.roomId === room.id) && (
                      <span className="text-amber-300/80"> (−прорізи)</span>
                    )}
                  </div>
                </div>
                {tot.total > 0 && (
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-emerald-300 tabular-nums">
                      ₴ {formatMoney(tot.total)}
                    </div>
                    <div className="text-[10px] text-zinc-500 tabular-nums">
                      М {formatMoney(tot.material)} · Р {formatMoney(tot.labor)}
                    </div>
                  </div>
                )}
              </div>
            </header>
            {Array.from(bySurface.entries()).map(([surface, surfaceLines]) => (
              <div key={surface}>
                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-white/[0.02] border-b border-white/5">
                  {SURFACE_LABELS[surface]}
                </div>
                <ul className="divide-y divide-white/5">
                  {surfaceLines.map((l) => {
                    const quoteKey = `${l.kind}:${l.quoteName}`;
                    const quote = quotes[quoteKey];
                    return (
                      <LineRow
                        key={l.id}
                        line={l}
                        quote={quote}
                        works={works}
                        onSetPrice={(value) => {
                          const presetId =
                            l.kind === "labor" ? `labor-${l.workType}` : l.material?.id ?? l.id;
                          onSetPrice(l.roomId, presetId, value);
                        }}
                      />
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 p-4 space-y-2.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">
          Підсумок
        </div>
        <Row label="Матеріали" value={grandMaterial} />
        <Row label="Робота" value={grandLabor} />
        <div className="border-t border-emerald-500/20 pt-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-emerald-200">Разом</span>
          <span className="text-xl font-black text-emerald-200 tabular-nums">
            ₴ {formatMoney(grandTotal)}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 flex gap-2.5">
        <Info size={14} className="text-zinc-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Ціни автоматично підтягуються з довідника постачальників і з інтернету
          (з перевіркою дат). Можна редагувати вручну. Спільні стіни рахуються з
          обох сторін; прорізи віднімаються від площі стін.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExportPDF}
          disabled={!!exporting || grandTotal === 0}
          className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40"
        >
          {exporting === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          PDF
        </button>
        <button
          type="button"
          onClick={handleExportXLSX}
          disabled={!!exporting || grandTotal === 0}
          className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40"
        >
          {exporting === "xlsx" ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
          Excel
        </button>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-semibold active:scale-95 transition"
      >
        <Trash2 size={14} />
        Скинути все
      </button>
    </div>
  );
}

function LineRow({
  line,
  quote,
  works,
  onSetPrice,
}: {
  line: LineItem;
  quote: Quote | undefined;
  works: WorksConfig;
  onSetPrice: (value: number) => void;
}) {
  const isLabor = line.kind === "labor";
  const tile = line.material
    ? works.tileSizes[`${line.roomId}:${line.surface}`] ?? DEFAULT_TILE_SIZE
    : null;
  const thicknessCm = line.material
    ? works.thicknessCm[`${line.roomId}:${line.workType}`] ?? 1
    : null;

  return (
    <li className="px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isLabor ? (
              <Wrench size={11} className="text-amber-300 shrink-0" />
            ) : null}
            <span className="text-sm text-white truncate">{line.name}</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
            {isLabor
              ? "Робота · ₴/м²"
              : line.material?.qtyMode === "tile"
                ? `плитка ${tile?.w ?? 0.6}×${tile?.h ?? 0.6} м`
                : line.material?.qtyMode === "thicknessCm"
                  ? `${line.material.consumptionPerSqm} ${UNIT_LABELS[line.material.unit]}/м²/см × ${thicknessCm} см`
                  : line.material?.qtyMode === "drywall"
                    ? "лист 1.2×2.5 м"
                    : line.material
                      ? `${line.material.consumptionPerSqm} ${UNIT_LABELS[line.material.unit]}/м²`
                      : ""}
            {!isLabor && line.material && ` · +${line.material.reservePercent}% запас`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold text-violet-300 tabular-nums">
            {line.material?.qtyMode === "tile" || line.material?.qtyMode === "drywall"
              ? Math.ceil(line.qty)
              : formatNum(line.qty)}
            <span className="text-[11px] text-violet-400/70 ml-1 font-normal">{line.unit}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PriceInput
          value={line.unitPrice}
          onChange={onSetPrice}
          quote={quote}
        />
        <div className="shrink-0 min-w-[80px] text-right tabular-nums">
          {line.unitPrice > 0 ? (
            <span className="text-sm font-bold text-emerald-300">
              ₴ {formatMoney(line.total)}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>
      </div>
      {quote && (
        <SourceBadge
          quote={quote}
          onApply={() => {
            if (quote.price != null && quote.price > 0) onSetPrice(quote.price);
          }}
        />
      )}
    </li>
  );
}

function PriceInput({
  value,
  onChange,
  quote,
}: {
  value: number;
  onChange: (n: number) => void;
  quote?: Quote;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : "");
  useEffect(() => {
    setText(value > 0 ? String(value) : "");
  }, [value]);
  return (
    <div className="relative flex-1">
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9.,]*"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const n = parseFloat(v.replace(",", "."));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        placeholder={quote?.price ? String(quote.price) : "Ціна, ₴"}
        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-white text-sm focus:border-violet-500/60 focus:outline-none"
      />
    </div>
  );
}

function SourceBadge({ quote, onApply }: { quote: Quote; onApply: () => void }) {
  if (quote.source === "none") {
    return (
      <div className="text-[10px] text-zinc-600 px-1">
        {quote.note ? `Ціну не знайдено: ${quote.note}` : "Ціну не знайдено в довіднику та інтернеті"}
      </div>
    );
  }
  const isSupplier = quote.source === "supplier";
  const Icon = Sparkles;
  return (
    <button
      type="button"
      onClick={onApply}
      className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border active:scale-95 transition ${
        isSupplier
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          : "bg-sky-500/10 border-sky-500/30 text-sky-300"
      }`}
    >
      <Icon size={10} />
      <span className="font-semibold">
        {isSupplier ? "Довідник" : "Ринок"}: ₴{quote.price != null ? formatMoney(quote.price) : "—"}
      </span>
      {isSupplier && quote.supplierName && (
        <span className="opacity-80 truncate max-w-[100px]">· {quote.supplierName}</span>
      )}
      {!isSupplier && quote.sourceTitle && (
        <span className="opacity-80 truncate max-w-[120px]">· {quote.sourceTitle}</span>
      )}
      {!isSupplier && quote.sourceDate && (
        <span className="opacity-60">· {quote.sourceDate}</span>
      )}
    </button>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="tabular-nums font-semibold text-zinc-100">
        {value > 0 ? `₴ ${formatMoney(value)}` : "—"}
      </span>
    </div>
  );
}
