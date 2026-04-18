"use client";

import { useState } from "react";
import { Filter, Search, ChevronDown, ChevronUp } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { FINANCE_CATEGORIES } from "@/lib/constants";
import { FilterSelect, FilterInput } from "./filter-controls";
import { DatePresets } from "./date-presets";
import { SavedViews } from "./saved-views";
import type { FinancingFilters, ProjectOption, UserOption } from "./types";

export function FilterBar({
  filters,
  setFilters,
  resetFilters,
  projects,
  users,
  scope,
}: {
  filters: FinancingFilters;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
  resetFilters: () => void;
  projects: ProjectOption[];
  users: UserOption[];
  scope?: { id: string; title: string };
}) {
  const [showMore, setShowMore] = useState(false);

  const activeCount = [
    !scope && filters.projectId,
    filters.kind,
    filters.type,
    filters.category,
    filters.from,
    filters.to,
    filters.search.trim(),
    filters.subcategory,
    filters.responsibleId,
    filters.hasAttachments,
  ].filter(Boolean).length;

  return (
    <section
      className="rounded-2xl p-3 sm:p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Filter size={14} style={{ color: T.textMuted }} />
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          ФІЛЬТРИ
          {activeCount > 0 && (
            <span
              className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {activeCount}
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={resetFilters}
            className="text-[11px] font-medium"
            style={{ color: T.accentPrimary }}
          >
            Скинути
          </button>
          <SavedViews filters={filters} setFilters={setFilters} />
        </div>
      </div>

      {/* Search — always visible */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: T.textMuted }}
        />
        <input
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
          placeholder="Пошук…"
          className="w-full rounded-xl pl-9 pr-3 py-2.5 text-[13px] outline-none"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderStrong}`,
            color: T.textPrimary,
          }}
        />
      </div>

      {/* Date presets */}
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <DatePresets filters={filters} setFilters={setFilters} />
      </div>

      {/* Row 1: main filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 mt-3">
        {!scope && (
          <FilterSelect
            value={filters.projectId}
            onChange={(v) => setFilters((p) => ({ ...p, projectId: v }))}
          >
            <option value="">Всі проєкти</option>
            <option value="__NULL__">Постійні витрати</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </FilterSelect>
        )}

        <FilterSelect
          value={filters.kind}
          onChange={(v) => setFilters((p) => ({ ...p, kind: v }))}
        >
          <option value="">План / Факт</option>
          <option value="PLAN">План</option>
          <option value="FACT">Факт</option>
        </FilterSelect>

        <FilterSelect
          value={filters.type}
          onChange={(v) => setFilters((p) => ({ ...p, type: v }))}
        >
          <option value="">Доходи / Витрати</option>
          <option value="INCOME">Доходи</option>
          <option value="EXPENSE">Витрати</option>
        </FilterSelect>

        <FilterSelect
          value={filters.category}
          onChange={(v) => setFilters((p) => ({ ...p, category: v }))}
        >
          <option value="">Всі категорії</option>
          {FINANCE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </FilterSelect>

        <FilterInput
          type="date"
          value={filters.from}
          onChange={(v) => setFilters((p) => ({ ...p, from: v }))}
          placeholder="Від"
        />
        <FilterInput
          type="date"
          value={filters.to}
          onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
          placeholder="До"
        />
      </div>

      {/* More filters toggle */}
      <button
        onClick={() => setShowMore(!showMore)}
        className="flex items-center gap-1 mt-3 text-[11px] font-semibold transition"
        style={{ color: T.textMuted }}
      >
        {showMore ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showMore ? "Менше фільтрів" : "Більше фільтрів"}
      </button>

      {/* Row 2: extended filters */}
      {showMore && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
          <FilterInput
            value={filters.subcategory}
            onChange={(v) => setFilters((p) => ({ ...p, subcategory: v }))}
            placeholder="Підкатегорія"
          />

          {users.length > 0 && (
            <FilterSelect
              value={filters.responsibleId}
              onChange={(v) => setFilters((p) => ({ ...p, responsibleId: v }))}
            >
              <option value="">Всі автори</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </FilterSelect>
          )}

          <FilterSelect
            value={filters.hasAttachments}
            onChange={(v) => setFilters((p) => ({ ...p, hasAttachments: v }))}
          >
            <option value="">Вкладення (всі)</option>
            <option value="true">З файлами</option>
            <option value="false">Без файлів</option>
          </FilterSelect>
        </div>
      )}
    </section>
  );
}
