"use client";

import { useMemo } from "react";
import { AlertOctagon, Star, UserX } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectRow } from "./projects-types";

/**
 * Preset = поіменована комбінація filters/sort. Натиск встановлює всі
 * параметри за один клік. Дані лічильників — у parent через extraInfo.
 */
export type Preset = "MINE" | "OVERDUE" | "NO_PM";

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
  managerFilter,
  onManagerChange,
  sortMode,
  onSortChange,
  currentUserId,
  activePreset,
  onPresetClick,
}: {
  projects: ProjectRow[];
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  typeFilter: string | null;
  onTypeChange: (t: string | null) => void;
  managerFilter: string | null;
  onManagerChange: (id: string | null) => void;
  sortMode: SortMode;
  onSortChange: (s: SortMode) => void;
  currentUserId: string;
  activePreset: Preset | null;
  onPresetClick: (preset: Preset) => void;
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

  // Список менеджерів проєктів (унікально по id+name)
  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      if (p.manager) map.set(p.manager.id, p.manager.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "uk"));
  }, [projects]);

  // Лічильники для preset-ів (показуємо тільки коли > 0)
  const presetCounts = useMemo(() => {
    const now = Date.now();
    return {
      MINE: projects.filter((p) => p.manager?.id === currentUserId).length,
      OVERDUE: projects.filter((p) => {
        const due = p.extra.expectedEndDate;
        if (!due) return false;
        if (p.status === "COMPLETED" || p.status === "CANCELLED") return false;
        return new Date(due).getTime() < now;
      }).length,
      NO_PM: projects.filter((p) => !p.manager).length,
    };
  }, [projects, currentUserId]);

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

      {/* PM filter */}
      {managerOptions.length > 0 && (
        <Select
          label="ПМ"
          value={managerFilter ?? ""}
          onChange={(v) => onManagerChange(v || null)}
          options={[
            { value: "", label: "Усі ПМ" },
            ...managerOptions.map((m) => ({ value: m.id, label: m.name })),
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

      {/* Right-aligned presets */}
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <PresetChip
          icon={<Star size={11} />}
          label="Мої"
          count={presetCounts.MINE}
          active={activePreset === "MINE"}
          onClick={() => onPresetClick("MINE")}
          accent={T.violet}
          softBg={T.violetSoft}
        />
        <PresetChip
          icon={<AlertOctagon size={11} />}
          label="Просрочка"
          count={presetCounts.OVERDUE}
          active={activePreset === "OVERDUE"}
          onClick={() => onPresetClick("OVERDUE")}
          accent={T.danger}
          softBg={T.dangerSoft}
        />
        <PresetChip
          icon={<UserX size={11} />}
          label="Без ПМ"
          count={presetCounts.NO_PM}
          active={activePreset === "NO_PM"}
          onClick={() => onPresetClick("NO_PM")}
          accent={T.warning}
          softBg={T.warningSoft}
        />
      </div>
    </div>
  );
}

function PresetChip({
  icon,
  label,
  count,
  active,
  onClick,
  accent,
  softBg,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent: string;
  softBg: string;
}) {
  if (count === 0 && !active) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
      style={{
        backgroundColor: active ? softBg : "transparent",
        color: active ? accent : T.textSecondary,
        border: `1px solid ${active ? accent : T.borderSoft}`,
      }}
    >
      <span style={{ color: accent }}>{icon}</span>
      {label}
      {count > 0 && (
        <span
          className="text-[10px] font-bold tabular-nums"
          style={{ color: active ? accent : T.textMuted }}
        >
          {count}
        </span>
      )}
    </button>
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
  managerId: string | null,
  preset: Preset | null,
  currentUserId: string,
  sort: SortMode,
): ProjectRow[] {
  let out = projects;
  if (status !== "ALL") out = out.filter((p) => p.status === status);
  if (type) out = out.filter((p) => p.extra.type === type);
  if (managerId) out = out.filter((p) => p.manager?.id === managerId);

  // Preset застосовується ПОВЕРХ інших фільтрів. Якщо потрібен AND
  // з manual filter — preset просто переписує відповідну ось.
  if (preset === "MINE") {
    out = out.filter((p) => p.manager?.id === currentUserId);
  } else if (preset === "OVERDUE") {
    const now = Date.now();
    out = out.filter((p) => {
      const due = p.extra.expectedEndDate;
      if (!due) return false;
      if (p.status === "COMPLETED" || p.status === "CANCELLED") return false;
      return new Date(due).getTime() < now;
    });
  } else if (preset === "NO_PM") {
    out = out.filter((p) => !p.manager);
  }
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
