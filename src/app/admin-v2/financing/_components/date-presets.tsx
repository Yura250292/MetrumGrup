"use client";

import { useEffect, useRef, useState } from "react";
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";
import { CalendarRange } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FinancingFilters } from "./types";

const DATE_FMT = "yyyy-MM-dd";

const PRESETS = [
  {
    label: "Сьогодні",
    getRange: () => {
      const now = new Date();
      return { from: format(startOfDay(now), DATE_FMT), to: format(endOfDay(now), DATE_FMT) };
    },
  },
  {
    label: "7 днів",
    getRange: () => {
      const now = new Date();
      return { from: format(subDays(now, 7), DATE_FMT), to: format(now, DATE_FMT) };
    },
  },
  {
    label: "30 днів",
    getRange: () => {
      const now = new Date();
      return { from: format(subDays(now, 30), DATE_FMT), to: format(now, DATE_FMT) };
    },
  },
  {
    label: "Цей місяць",
    getRange: () => {
      const now = new Date();
      return { from: format(startOfMonth(now), DATE_FMT), to: format(endOfMonth(now), DATE_FMT) };
    },
  },
  {
    label: "Наст. місяць",
    getRange: () => {
      const next = addMonths(new Date(), 1);
      return { from: format(startOfMonth(next), DATE_FMT), to: format(endOfMonth(next), DATE_FMT) };
    },
  },
  {
    label: "Квартал",
    getRange: () => {
      const now = new Date();
      return { from: format(startOfQuarter(now), DATE_FMT), to: format(endOfQuarter(now), DATE_FMT) };
    },
  },
  {
    label: "Рік",
    getRange: () => {
      const now = new Date();
      return { from: format(startOfYear(now), DATE_FMT), to: format(endOfYear(now), DATE_FMT) };
    },
  },
];

export function DatePresets({
  filters,
  setFilters,
}: {
  filters: FinancingFilters;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const customRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customOpen) return;
    const onClick = (e: MouseEvent) => {
      if (customRef.current && !customRef.current.contains(e.target as Node)) {
        setCustomOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCustomOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [customOpen]);

  // «Власний» активний коли дата задана але не співпадає з жодним preset.
  const matchesPreset = PRESETS.some((p) => {
    const r = p.getRange();
    return r.from === filters.from && r.to === filters.to;
  });
  const customActive = !matchesPreset && (filters.from || filters.to);

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {PRESETS.map((preset) => {
        const range = preset.getRange();
        const isActive = filters.from === range.from && filters.to === range.to;
        return (
          <button
            key={preset.label}
            onClick={() => {
              if (isActive) {
                setFilters((p) => ({ ...p, from: "", to: "" }));
              } else {
                setFilters((p) => ({ ...p, from: range.from, to: range.to }));
              }
            }}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition whitespace-nowrap"
            style={{
              backgroundColor: isActive ? T.accentPrimary : "transparent",
              color: isActive ? "#fff" : T.textSecondary,
              border: `1px solid ${isActive ? T.accentPrimary : T.borderSoft}`,
              boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.10)" : "none",
            }}
          >
            {preset.label}
          </button>
        );
      })}

      {/* Custom date range — popover */}
      <div className="relative" ref={customRef}>
        <button
          onClick={() => setCustomOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={customOpen}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition whitespace-nowrap"
          style={{
            backgroundColor: customActive ? T.accentPrimary : "transparent",
            color: customActive ? "#fff" : T.textSecondary,
            border: `1px solid ${customActive ? T.accentPrimary : T.borderSoft}`,
            boxShadow: customActive ? "0 1px 2px rgba(0,0,0,0.10)" : "none",
          }}
        >
          <CalendarRange size={12} />
          Власний
        </button>
        {customOpen && (
          <div
            role="dialog"
            aria-label="Власний діапазон дат"
            className="absolute left-0 top-full z-40 mt-1.5 w-[260px] rounded-xl border p-3 shadow-lg"
            style={{
              backgroundColor: T.panelElevated,
              borderColor: T.borderStrong,
              boxShadow: "0 12px 32px -8px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.08)",
            }}
          >
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: T.textMuted, letterSpacing: "0.06em" }}
                >
                  Від
                </span>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, from: e.target.value }))
                  }
                  className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                  style={{
                    borderColor: T.borderSoft,
                    background: T.panel,
                    color: T.textPrimary,
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: T.textMuted, letterSpacing: "0.06em" }}
                >
                  До
                </span>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, to: e.target.value }))
                  }
                  className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                  style={{
                    borderColor: T.borderSoft,
                    background: T.panel,
                    color: T.textPrimary,
                  }}
                />
              </label>
              {(filters.from || filters.to) && (
                <button
                  onClick={() => {
                    setFilters((p) => ({ ...p, from: "", to: "" }));
                    setCustomOpen(false);
                  }}
                  className="self-start text-[11px] font-semibold transition hover:opacity-80"
                  style={{ color: T.accentPrimary }}
                >
                  Скинути
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
