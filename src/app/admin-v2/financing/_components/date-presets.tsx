"use client";

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
  return (
    <div className="flex flex-wrap gap-1.5">
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
    </div>
  );
}
