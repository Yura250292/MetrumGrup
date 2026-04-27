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
  Layers,
  Building2,
  Wrench,
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

type CostCodeOption = { id: string; code: string; name: string; depth: number };
type CounterpartyOption = { id: string; name: string };

const COST_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "MATERIAL", label: "Матеріали" },
  { value: "LABOR", label: "Робота (ЗП)" },
  { value: "SUBCONTRACT", label: "Підряд" },
  { value: "EQUIPMENT", label: "Техніка" },
  { value: "OVERHEAD", label: "Накладні" },
  { value: "OTHER", label: "Інше" },
];

function useCostCodes() {
  const [items, setItems] = useState<CostCodeOption[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/financing/cost-codes")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => {
        if (alive) setItems(data ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return items;
}

function useCounterparties() {
  const [items, setItems] = useState<CounterpartyOption[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/financing/counterparties?take=100")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => {
        if (alive) setItems(data ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return items;
}

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
  const [showRare, setShowRare] = useState(false);
  const folderTree = useFinanceFolderTree(!scope);
  const costCodes = useCostCodes();
  const counterparties = useCounterparties();

  const activeCount = [
    !scope && filters.projectId,
    !scope && filters.folderId,
    filters.kind,
    filters.type,
    filters.status,
    filters.category,
    filters.costCodeId,
    filters.costType,
    filters.counterpartyId,
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
    filters.costCodeId,
    filters.costType,
    filters.counterpartyId,
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

      {/* Advanced filters (collapsible) — grouped to reduce overload */}
      {showAdvanced && (
        <div
          className="flex flex-col gap-3 pt-3 border-t"
          style={{ borderColor: T.borderSoft }}
        >
          {/* GROUP 1: most-used filters — always shown when advanced is open */}
          <SectionHeader title="Класифікація" hint="Як саме категоризовано операцію" />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {!scope && (
              <FilterSelect
                icon={<Folder size={13} />}
                placeholder="Проєкт"
                title="Прив'язка до конкретного об'єкта"
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

            <FilterSelect
              icon={<Layers size={13} />}
              placeholder="Стаття витрат (cost-code)"
              title="Дерево статей. Сюди йдуть звіти План vs Факт"
              value={filters.costCodeId}
              onChange={(v) => setFilters((p) => ({ ...p, costCodeId: v }))}
            >
              <option value="">Всі статті</option>
              {costCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {"— ".repeat(c.depth)}
                  {c.code} {c.name}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              icon={<Wrench size={13} />}
              placeholder="Тип витрат"
              title="MATERIAL / LABOR / SUBCONTRACT / EQUIPMENT / OVERHEAD / OTHER"
              value={filters.costType}
              onChange={(v) => setFilters((p) => ({ ...p, costType: v }))}
            >
              <option value="">Всі типи</option>
              {COST_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              icon={<Building2 size={13} />}
              placeholder="Контрагент"
              title="Хто отримує або платить"
              value={filters.counterpartyId}
              onChange={(v) => setFilters((p) => ({ ...p, counterpartyId: v }))}
            >
              <option value="">Всі контрагенти</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
          </div>

          {/* GROUP 2 toggle */}
          <button
            type="button"
            onClick={() => setShowRare((v) => !v)}
            className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[11px] font-semibold transition"
            style={{ color: T.textMuted }}
          >
            <ChevronDown
              size={11}
              style={{
                transform: showRare ? "rotate(180deg)" : "none",
                transition: "transform 200ms",
              }}
            />
            {showRare ? "Сховати рідкі" : "+ Більше фільтрів (категорія, автор, вкладення, дати, папка)"}
          </button>

          {showRare && (
            <>
              <SectionHeader
                title="Деталі"
                hint="Старі категорії, підкатегорія, автор, файли, точні дати"
              />
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {!scope && (
                  <FilterSelect
                    icon={<Folder size={13} />}
                    placeholder="Папка"
                    title="Папка фінансування (FINANCE folder tree)"
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
                  title="Стара плоска категорія (materials/salary/...) — поступово замінюється статтею витрат"
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
                  placeholder="Підкатегорія (вільний текст)"
                  icon={<Tag size={13} />}
                />

                {users.length > 0 && (
                  <FilterSelect
                    icon={<UserIcon size={13} />}
                    placeholder="Автор операції"
                    title="Хто створив запис"
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
                  placeholder="Файли / вкладення"
                  title="Чи є прикріплений чек/документ"
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
                  placeholder="Точна дата від"
                />
                <FilterInput
                  type="date"
                  icon={<CalendarDays size={13} />}
                  value={filters.to}
                  onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
                  placeholder="Точна дата до"
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textPrimary }}
      >
        {title}
      </span>
      {hint && (
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          · {hint}
        </span>
      )}
    </div>
  );
}
