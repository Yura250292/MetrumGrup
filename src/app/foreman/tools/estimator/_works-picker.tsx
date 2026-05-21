"use client";

import { Check } from "lucide-react";
import {
  DEFAULT_TILE_SIZE,
  SURFACE_LABELS,
  WORK_TYPES_BY_SURFACE,
  WORK_TYPE_LABELS,
  isThicknessWork,
  isTileWork,
} from "@/lib/foreman/material-presets";
import type { Surface, WorkType } from "@/lib/foreman/material-presets";
import { parseNum } from "@/lib/foreman/format";
import type { FloorPlan, WorksConfig } from "./_types";

interface Props {
  plan: FloorPlan;
  works: WorksConfig;
  onToggle: (roomId: string, surface: Surface, workType: WorkType) => void;
  onSetTileSize: (roomId: string, surface: Surface, w: number, h: number) => void;
  onSetThickness: (roomId: string, workType: WorkType, cm: number) => void;
}

const SURFACES: Surface[] = ["floor", "walls", "ceiling"];

export function WorksPicker({
  plan,
  works,
  onToggle,
  onSetTileSize,
  onSetThickness,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400 leading-relaxed px-1">
        Оберіть види робіт для кожної кімнати. Для плитки задайте розмір, для
        штукатурки/стяжки — товщину.
      </p>

      {plan.rooms.map((room) => (
        <section
          key={room.id}
          className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 overflow-hidden"
        >
          <header className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{room.name}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                {room.w}×{room.h} м · h {room.ceilingHeight} м
              </div>
            </div>
          </header>

          <div className="divide-y divide-white/5">
            {SURFACES.map((surface) => {
              const enabled = works.rooms[room.id]?.[surface] ?? [];
              const tile = works.tileSizes[`${room.id}:${surface}`] ?? DEFAULT_TILE_SIZE;
              const hasTileWork = enabled.some(isTileWork);
              const thicknessWorks = enabled.filter(isThicknessWork);

              return (
                <div key={surface} className="px-4 py-3 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {SURFACE_LABELS[surface]}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {WORK_TYPES_BY_SURFACE[surface].map((wt) => {
                      const active = enabled.includes(wt);
                      return (
                        <button
                          key={wt}
                          type="button"
                          onClick={() => onToggle(room.id, surface, wt)}
                          className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border text-xs font-semibold transition active:scale-95 ${
                            active
                              ? "bg-violet-500/20 border-violet-500/50 text-violet-100"
                              : "bg-white/[0.03] border-white/10 text-zinc-300"
                          }`}
                        >
                          {active && <Check size={12} />}
                          {WORK_TYPE_LABELS[wt]}
                        </button>
                      );
                    })}
                  </div>

                  {hasTileWork && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                          Плитка ширина, м
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.,]*"
                          value={String(tile.w)}
                          onChange={(e) => {
                            const v = parseNum(e.target.value);
                            if (v > 0) onSetTileSize(room.id, surface, v, tile.h);
                          }}
                          className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-white text-sm text-center focus:border-violet-500/60 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                          Плитка висота, м
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.,]*"
                          value={String(tile.h)}
                          onChange={(e) => {
                            const v = parseNum(e.target.value);
                            if (v > 0) onSetTileSize(room.id, surface, tile.w, v);
                          }}
                          className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-white text-sm text-center focus:border-violet-500/60 focus:outline-none"
                        />
                      </label>
                    </div>
                  )}

                  {thicknessWorks.map((wt) => {
                    const cm = works.thicknessCm[`${room.id}:${wt}`] ?? 1;
                    return (
                      <label key={wt} className="block pt-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                          {WORK_TYPE_LABELS[wt]} — товщина, см
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.,]*"
                          value={String(cm)}
                          onChange={(e) => {
                            const v = parseNum(e.target.value);
                            if (v > 0) onSetThickness(room.id, wt, v);
                          }}
                          className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-white text-sm text-center focus:border-violet-500/60 focus:outline-none"
                        />
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
