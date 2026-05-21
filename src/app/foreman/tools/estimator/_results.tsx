"use client";

import { useMemo, useState } from "react";
import { Download, Info, Trash2 } from "lucide-react";
import {
  DEFAULT_TILE_SIZE,
  SURFACE_LABELS,
  UNIT_LABELS,
  calcQty,
  presetsForWorkType,
} from "@/lib/foreman/material-presets";
import type { MaterialPreset, Surface, WorkType } from "@/lib/foreman/material-presets";
import type { Room } from "@/lib/foreman/geometry";
import { formatMoney, formatNum } from "@/lib/foreman/format";
import type { FloorPlan, PricesConfig, WorksConfig } from "./_types";
import { PriceAutocomplete } from "./_price-autocomplete";
import { PlanSvg } from "./_plan-svg";

interface Props {
  plan: FloorPlan;
  works: WorksConfig;
  prices: PricesConfig;
  firmId: string | null;
  onSetPrice: (roomId: string, presetId: string, value: number) => void;
  onReset: () => void;
}

export interface ComputedLine {
  roomId: string;
  roomName: string;
  surface: Surface;
  workType: WorkType;
  preset: MaterialPreset;
  qty: number;
  unitPrice: number;
  total: number;
}

function surfaceArea(
  room: Room,
  surface: Surface,
  openings: { roomId: string; width: number; height: number }[],
): number {
  if (surface === "floor" || surface === "ceiling") return room.w * room.h;
  const base = 2 * (room.w + room.h) * room.ceilingHeight;
  const subtract = openings
    .filter((o) => o.roomId === room.id)
    .reduce((s, o) => s + o.width * o.height, 0);
  return Math.max(0, base - subtract);
}

export function Results({
  plan,
  works,
  prices,
  firmId,
  onSetPrice,
  onReset,
}: Props) {
  const [exporting, setExporting] = useState(false);

  const lines = useMemo<ComputedLine[]>(() => {
    void firmId;
    const out: ComputedLine[] = [];
    for (const room of plan.rooms) {
      const rCfg = works.rooms[room.id] ?? {};
      for (const surface of ["floor", "walls", "ceiling"] as Surface[]) {
        const wts = rCfg[surface] ?? [];
        const area = surfaceArea(room, surface, plan.openings);
        for (const wt of wts) {
          const presets = presetsForWorkType(wt);
          for (const preset of presets) {
            const tile =
              works.tileSizes[`${room.id}:${surface}`] ?? DEFAULT_TILE_SIZE;
            const thicknessCm = works.thicknessCm[`${room.id}:${wt}`] ?? 1;
            const qty = calcQty(preset, area, {
              tileW: tile.w,
              tileH: tile.h,
              thicknessCm,
            });
            const unitPrice = prices.unitPrices[`${room.id}:${preset.id}`] ?? 0;
            out.push({
              roomId: room.id,
              roomName: room.name,
              surface,
              workType: wt,
              preset,
              qty,
              unitPrice,
              total: qty * unitPrice,
            });
          }
        }
      }
    }
    return out;
  }, [plan.rooms, works, prices, firmId]);

  const grandTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (l.unitPrice > 0 ? l.total : 0), 0),
    [lines],
  );

  const perSurface = useMemo(() => {
    const acc: Record<Surface, number> = { floor: 0, walls: 0, ceiling: 0 };
    for (const l of lines) {
      if (l.unitPrice > 0) acc[l.surface] += l.total;
    }
    return acc;
  }, [lines]);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportEstimatePDF } = await import("./_pdf");
      const svgEl = document.querySelector<SVGSVGElement>("svg[data-estimator-plan]");
      await exportEstimatePDF({ plan, lines, grandTotal, perSurface, svgEl });
    } catch (e) {
      console.error("[estimator] export failed", e);
      alert("Не вдалося згенерувати PDF");
    } finally {
      setExporting(false);
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

  // group lines by room
  const byRoom = new Map<string, ComputedLine[]>();
  for (const l of lines) {
    if (!byRoom.has(l.roomId)) byRoom.set(l.roomId, []);
    byRoom.get(l.roomId)!.push(l);
  }

  return (
    <div className="space-y-4">
      {/* Hidden snapshot SVG so PDF export can capture the plan when on results step. */}
      <div
        aria-hidden
        className="absolute -left-[9999px] top-0 w-[800px] h-[600px] pointer-events-none"
      >
        <PlanSvg plan={plan} snapshot className="w-full h-full" />
      </div>

      {Array.from(byRoom.entries()).map(([roomId, roomLines]) => {
        const room = plan.rooms.find((r) => r.id === roomId);
        if (!room) return null;
        const bySurface = new Map<Surface, ComputedLine[]>();
        for (const l of roomLines) {
          if (!bySurface.has(l.surface)) bySurface.set(l.surface, []);
          bySurface.get(l.surface)!.push(l);
        }
        return (
          <section
            key={roomId}
            className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 overflow-hidden"
          >
            <header className="px-4 py-3 border-b border-white/5">
              <div className="text-sm font-semibold text-white">{room.name}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                {room.w}×{room.h} м · h {room.ceilingHeight} м · підлога{" "}
                {formatNum(room.w * room.h)} м² · стіни{" "}
                {formatNum(surfaceArea(room, "walls", plan.openings))} м²
                {plan.openings.some((o) => o.roomId === room.id) && (
                  <span className="text-amber-300/80"> (−прорізи)</span>
                )}
              </div>
            </header>
            {Array.from(bySurface.entries()).map(([surface, surfaceLines]) => (
              <div key={surface}>
                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-white/[0.02] border-b border-white/5">
                  {SURFACE_LABELS[surface]}
                </div>
                <ul className="divide-y divide-white/5">
                  {surfaceLines.map((l) => (
                    <li key={`${roomId}:${l.preset.id}`} className="px-4 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white">{l.preset.name}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                            {l.preset.qtyMode === "tile"
                              ? `плитка ${works.tileSizes[`${l.roomId}:${l.surface}`]?.w ?? DEFAULT_TILE_SIZE.w}×${works.tileSizes[`${l.roomId}:${l.surface}`]?.h ?? DEFAULT_TILE_SIZE.h} м`
                              : l.preset.qtyMode === "thicknessCm"
                                ? `${l.preset.consumptionPerSqm} ${UNIT_LABELS[l.preset.unit]}/м²/см × ${works.thicknessCm[`${l.roomId}:${l.workType}`] ?? 1} см`
                                : l.preset.qtyMode === "drywall"
                                  ? "лист 1.2×2.5 м (3 м²)"
                                  : `${l.preset.consumptionPerSqm} ${UNIT_LABELS[l.preset.unit]}/м²`}
                            {" · "}+{l.preset.reservePercent}% запас
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-bold text-violet-300 tabular-nums">
                            {l.preset.qtyMode === "tile" || l.preset.qtyMode === "drywall"
                              ? Math.ceil(l.qty)
                              : formatNum(l.qty)}
                            <span className="text-[11px] text-violet-400/70 ml-1 font-normal">
                              {UNIT_LABELS[l.preset.unit]}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <PriceAutocomplete
                          presetName={l.preset.name}
                          value={l.unitPrice}
                          onChange={(v) => onSetPrice(l.roomId, l.preset.id, v)}
                        />
                        <div className="shrink-0 min-w-[80px] text-right tabular-nums">
                          {l.unitPrice > 0 ? (
                            <span className="text-sm font-bold text-emerald-300">
                              ₴ {formatMoney(l.total)}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
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
        <SurfaceRow label="Підлога" value={perSurface.floor} />
        <SurfaceRow label="Стіни" value={perSurface.walls} />
        <SurfaceRow label="Стеля" value={perSurface.ceiling} />
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
          Спільні стіни рахуються з обох сторін — обидві поверхні все одно
          потребують фінішних робіт (шпаклівка, фарба, плитка). Це попередній
          кошторис; перед закупівлею звіряйте з упаковкою бренду.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || grandTotal === 0}
          className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40"
        >
          <Download size={16} />
          {exporting ? "Готую PDF…" : "Експорт PDF"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 active:scale-95 transition"
          aria-label="Скинути кошторис"
          title="Скинути все"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function SurfaceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="tabular-nums font-semibold text-zinc-100">
        {value > 0 ? `₴ ${formatMoney(value)}` : "—"}
      </span>
    </div>
  );
}
