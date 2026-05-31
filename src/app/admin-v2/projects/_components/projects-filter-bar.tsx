"use client";

import { useMemo } from "react";
import type { ProjectStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectRow } from "./projects-types";

export type StatusFilter = "ALL" | ProjectStatus;
export type SortMode = "updated" | "deadline" | "budget" | "title";

const STATUS_CHIPS: Array<{
  value: StatusFilter;
  label: string;
  dot?: string;
}> = [
  { value: "ALL", label: "Всі" },
  { value: "ACTIVE", label: "Активні", dot: T.success },
  { value: "DRAFT", label: "Чернетки", dot: T.warning },
  { value: "ON_HOLD", label: "Призупинені", dot: T.textMuted },
  { value: "COMPLETED", label: "Завершені", dot: T.accentPrimary },
];

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "updated", label: "Останні зміни" },
  { value: "deadline", label: "Дедлайн" },
  { value: "budget", label: "Бюджет" },
  { value: "title", label: "За алфавітом" },
];

/**
 * Filter+sort бар над сіткою карток. Status-chips з лічильниками, plus
 * type-dropdown і sort-dropdown. Тримає UI-стан у parent (controlled).
 */
export function ProjectsFilterBar({
  projects,
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
  sortMode,
  onSortChange,
}: {
  projects: ProjectRow[];
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  typeFilter: string | null;
  onTypeChange: (t: string | null) => void;
  sortMode: SortMode;
  onSortChange: (s: SortMode) => void;
}) {
  // Counts per status, computed once per render.
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: projects.length };
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects]);

  // Unique types для dropdown (з extra.type або fallback "Без типу")
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      if (p.extra.type) set.add(p.extra.type);
    }
    return Array.from(set).sort();
  }, [projects]);

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1">
        {STATUS_CHIPS.map((chip) => {
          const isActive = statusFilter === chip.value;
          const count = counts[chip.value] ?? 0;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onStatusChange(chip.value)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition"
              style={{
                backgroundColor: isActive ? T.accentPrimarySoft : "transparent",
                color: isActive ? T.accentPrimary : T.textSecondary,
                border: `1px solid ${isActive ? T.accentPrimary : "transparent"}`,
              }}
            >
              {chip.dot && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: chip.dot }}
                />
              )}
              <span>{chip.label}</span>
              <span
                className="text-[10px] font-bold tabular-nums"
                style={{ color: isActive ? T.accentPrimary : T.textMuted }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <span
        aria-hidden
        className="hidden sm:inline-block h-5 w-px"
        style={{ backgroundColor: T.borderSoft }}
      />

      {/* Type filter */}
      {typeOptions.length > 0 && (
        <Select
          label="Тип"
          value={typeFilter ?? ""}
          onChange={(v) => onTypeChange(v || null)}
          options={[
            { value: "", label: "Усі типи" },
            ...typeOptions.map((t) => ({ value: t, label: t })),
          ]}
        />
      )}

      {/* Sort */}
      <Select
        label="Сорт."
        value={sortMode}
        onChange={(v) => onSortChange(v as SortMode)}
        options={SORT_OPTIONS}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px]"
      style={{ color: T.textSecondary }}
    >
      <span className="text-[10px] uppercase tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border-none outline-none text-[12px] font-semibold cursor-pointer"
        style={{ color: T.textPrimary }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Pure helper — застосовує filter+sort до проєктів. Тримаю окремо
 * від UI щоб table view використовував той самий стан.
 */
export function applyProjectsFilterSort(
  projects: ProjectRow[],
  status: StatusFilter,
  type: string | null,
  sort: SortMode,
): ProjectRow[] {
  let out = projects;
  if (status !== "ALL") out = out.filter((p) => p.status === status);
  if (type) out = out.filter((p) => p.extra.type === type);
  out = [...out].sort((a, b) => {
    switch (sort) {
      case "deadline": {
        const av = a.extra.expectedEndDate ? new Date(a.extra.expectedEndDate).getTime() : Infinity;
        const bv = b.extra.expectedEndDate ? new Date(b.extra.expectedEndDate).getTime() : Infinity;
        return av - bv;
      }
      case "budget":
        return Number(b.totalBudget) - Number(a.totalBudget);
      case "title":
        return a.title.localeCompare(b.title, "uk");
      case "updated":
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });
  return out;
}
