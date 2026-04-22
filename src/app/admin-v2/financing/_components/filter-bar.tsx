"use client";

import { useEffect, useState } from "react";
import {
  Search,
  ChevronDown,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Folder,
  Tag,
  Paperclip,
  User as UserIcon,
  CircleDot,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { FINANCE_CATEGORIES } from "@/lib/constants";
import {
  FilterSelect,
  FilterInput,
  SegmentedControl,
} from "./filter-controls";
import { DatePresets } from "./date-presets";
import { SavedViews } from "./saved-views";
import { ActiveFilterChips } from "./active-filter-chips";
import type { FinancingFilters, ProjectOption, UserOption } from "./types";
import { FINANCE_STATUS_LABELS, type FinanceEntryStatus } from "./types";

const STATUS_SHORT: Record<FinanceEntryStatus, string> = {
  DRAFT: "Чернетка",
  PENDING: "На погодж.",
  APPROVED: "Підтв.",
  PAID: "Оплачено",
};

type FolderTreeOption = { id: string; name: string; depth: number };

function useFinanceFolderTree(enabled: boolean) {
  const [tree, setTree] = useState<FolderTreeOption[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch("/api/admin/folders/tree?domain=FINANCE")
      .then((r) => (r.ok ? r.json() : { folders: [] }))
      .then(({ folders }) => {
        if (!alive) return;
        const result: FolderTreeOption[] = [];
        const walk = (parentId: string | null, depth: number) => {
          for (const f of folders.filter(
            (x: { parentId: string | null }) => x.parentId === parentId,
          )) {
            result.push({ id: f.id, name: f.name, depth });
            walk(f.id, depth + 1);
          }
        };
        walk(null, 0);
        setTree(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);
  return tree;
}

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const folderTree = useFinanceFolderTree(!scope);

  const activeCount = [
    !scope && filters.projectId,
    !scope && filters.folderId,
    filters.kind,
    filters.type,
    filters.status,
    filters.category,
    filters.from,
    filters.to,
    filters.search.trim(),
    filters.subcategory,
    filters.responsibleId,
    filters.hasAttachments,
  ].filter(Boolean).length;

  const advancedCount = [
    !scope && filters.projectId,
    !scope && filters.folderId,
    filters.category,
    filters.subcategory,
    filters.responsibleId,
    filters.hasAttachments,
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  return (
    <section
      className="rounded-2xl p-3 sm:p-4 flex flex-col gap-3"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      {/* Hero row: search + saved views */}
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: T.textMuted }}
          />
          <input
            value={filters.search}
            onChange={(e) =>
              setFilters((p) => ({ ...p, search: e.target.value }))
            }
            placeholder="Пошук…"
            className="w-full rounded-xl pl-10 pr-3 py-2.5 text-[13.5px] outline-none transition focus:ring-2"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${
                filters.search.trim() ? T.accentPrimary : T.borderSoft
              }`,
              color: T.textPrimary,
            }}
          />
        </div>
        <SavedViews filters={filters} setFilters={setFilters} />
      </div>

      {/* Segmented controls + period (single horizontal scroll row on mobile) */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Kind: План/Факт */}
        <SegmentedControl
          ariaLabel="Вид запису"
          value={filters.kind}
          onChange={(v) => setFilters((p) => ({ ...p, kind: v as string }))}
          options={[
            { value: "PLAN", label: "План", icon: <CircleDot size={11} />, color: T.warning },
            { value: "FACT", label: "Факт", icon: <CircleDot size={11} />, color: T.success },
          ]}
        />

        {/* Type: Доходи/Витрати */}
        <SegmentedControl
          ariaLabel="Тип"
          value={filters.type}
          onChange={(v) => setFilters((p) => ({ ...p, type: v as string }))}
          options={[
            { value: "INCOME", label: "Доходи", icon: <TrendingUp size={11} />, color: T.accentPrimary },
            { value: "EXPENSE", label: "Витрати", icon: <TrendingDown size={11} />, color: T.warning },
          ]}
        />

        {/* Status: 4 chip-like segmented */}
        <SegmentedControl
          size="sm"
          ariaLabel="Статус"
          value={filters.status}
          onChange={(v) => setFilters((p) => ({ ...p, status: v as string }))}
          options={(["DRAFT", "PENDING", "APPROVED", "PAID"] as FinanceEntryStatus[]).map(
            (s) => ({
              value: s,
              label: FINANCE_STATUS_LABELS[s],
              shortLabel: STATUS_SHORT[s],
            }),
          )}
        />

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-105"
          style={{
            backgroundColor: showAdvanced || advancedCount > 0 ? T.accentPrimarySoft : T.panelSoft,
            color: showAdvanced || advancedCount > 0 ? T.accentPrimary : T.textSecondary,
            border: `1px solid ${showAdvanced || advancedCount > 0 ? T.accentPrimary : T.borderSoft}`,
          }}
          aria-expanded={showAdvanced}
        >
          <SlidersHorizontal size={13} />
          <span>Більше</span>
          {advancedCount > 0 && (
            <span
              className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {advancedCount}
            </span>
          )}
          <ChevronDown
            size={12}
            style={{
              transition: "transform 200ms",
              transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </div>

      {/* Period chips */}
      <div className="flex items-center gap-2 -mx-1 px-1 overflow-x-auto scrollbar-none">
        <CalendarDays
          size={13}
          className="flex-shrink-0"
          style={{ color: T.textMuted }}
        />
        <DatePresets filters={filters} setFilters={setFilters} />
      </div>

      {/* Active filter chips */}
      {activeCount > 0 && (
        <ActiveFilterChips
          filters={filters}
          setFilters={setFilters}
          resetFilters={resetFilters}
          projects={projects}
          users={users}
          scope={scope}
        />
      )}

      {/* Advanced filters (collapsible) */}
      {showAdvanced && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-3 border-t"
          style={{ borderColor: T.borderSoft }}
        >
          {!scope && (
            <FilterSelect
              icon={<Folder size={13} />}
              placeholder="Проєкт"
              value={filters.projectId}
              onChange={(v) => setFilters((p) => ({ ...p, projectId: v }))}
            >
              <option value="">Всі проєкти</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </FilterSelect>
          )}

          {!scope && (
            <FilterSelect
              icon={<Folder size={13} />}
              placeholder="Папка"
              value={filters.folderId}
              onChange={(v) => setFilters((p) => ({ ...p, folderId: v }))}
            >
              <option value="">Всі папки</option>
              {folderTree.map((f) => (
                <option key={f.id} value={f.id}>
                  {"— ".repeat(f.depth) + f.name}
                </option>
              ))}
            </FilterSelect>
          )}

          <FilterSelect
            icon={<Tag size={13} />}
            placeholder="Категорія"
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
            value={filters.subcategory}
            onChange={(v) => setFilters((p) => ({ ...p, subcategory: v }))}
            placeholder="Підкатегорія"
            icon={<Tag size={13} />}
          />

          {users.length > 0 && (
            <FilterSelect
              icon={<UserIcon size={13} />}
              placeholder="Автор"
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
            icon={<Paperclip size={13} />}
            placeholder="Вкладення"
            value={filters.hasAttachments}
            onChange={(v) => setFilters((p) => ({ ...p, hasAttachments: v }))}
          >
            <option value="">Вкладення (всі)</option>
            <option value="true">З файлами</option>
            <option value="false">Без файлів</option>
          </FilterSelect>

          <FilterInput
            type="date"
            icon={<CalendarDays size={13} />}
            value={filters.from}
            onChange={(v) => setFilters((p) => ({ ...p, from: v }))}
            placeholder="Від"
          />
          <FilterInput
            type="date"
            icon={<CalendarDays size={13} />}
            value={filters.to}
            onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
            placeholder="До"
          />
        </div>
      )}
    </section>
  );
}
