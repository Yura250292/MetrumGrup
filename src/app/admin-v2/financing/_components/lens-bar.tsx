"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, X, TrendingUp, TrendingDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import type { FinancingFilters, Lens, ProjectOption, UserOption } from "./types";
import { DatePresets } from "./date-presets";

/**
 * LensBar — спрощений фільтр для вкладки «Огляд» financing-view.
 * Замінює перевантажений FilterBar (~25 chip-ів) на:
 *   - Search
 *   - LensPicker (Усе / Бюджет / Зобовʼязання / Кеш / Не класифіковано)
 *   - FlowToggle (Усе / Доходи / Витрати)
 *   - DatePresets
 *   - «Більше» для project/cost-code/counterparty/etc.
 *
 * FilterBar лишається в інших вкладках (Operations/Pivot/Approvals).
 *
 * Маппінг lens → FinancingFilters.financeNatures див. lensToNatures().
 * Kind (PLAN/FACT) виводиться у Operations-вкладці автоматично з financeNatures
 * (всі _INCOME/_EXPENSE значення коректні).
 */

// === Lens definitions ===

type LensDef = {
  key: Lens;
  label: string;
  hint: string;
  natures: ReadonlyArray<
    | "BUDGET_INCOME"
    | "BUDGET_EXPENSE"
    | "COMMITTED_INCOME"
    | "COMMITTED_EXPENSE"
    | "ACTUAL_INCOME"
    | "ACTUAL_EXPENSE"
  >;
};

const LENSES: ReadonlyArray<LensDef> = [
  { key: "ALL", label: "Усе", hint: "Всі записи без фільтра", natures: [] },
  {
    key: "BUDGET",
    label: "Бюджет",
    hint: "Планові суми бюджету",
    natures: ["BUDGET_INCOME", "BUDGET_EXPENSE"],
  },
  {
    key: "COMMITTED",
    label: "Зобовʼязання",
    hint: "Борг або очікувані надходження",
    natures: ["COMMITTED_INCOME", "COMMITTED_EXPENSE"],
  },
  {
    key: "ACTUAL",
    label: "Кеш",
    hint: "Реально оплачені операції",
    natures: ["ACTUAL_INCOME", "ACTUAL_EXPENSE"],
  },
  {
    key: "UNCLASSIFIED",
    label: "Не класифіковано",
    hint: "Записи без фінансової природи",
    natures: [],
  },
];

const LENS_BY_KEY = new Map<Lens, LensDef>(LENSES.map((l) => [l.key, l]));

/** Lens → FinancingFilters partial (тільки financeNature + financeNatures). */
export function lensToFilterPatch(lens: Lens): Partial<FinancingFilters> {
  const def = LENS_BY_KEY.get(lens);
  if (!def) return { financeNature: "", financeNatures: [] };
  if (lens === "ALL") return { financeNature: "", financeNatures: [] };
  if (lens === "UNCLASSIFIED") return { financeNature: "NULL", financeNatures: [] };
  // Concrete lenses → multi-value.
  return { financeNature: "", financeNatures: [...def.natures] };
}

/** Зворотній маппінг: визначити активний Lens із поточних фільтрів. */
export function detectLens(filters: FinancingFilters): Lens {
  if (filters.financeNature === "NULL") return "UNCLASSIFIED";
  const arr = filters.financeNatures ?? [];
  if (arr.length === 0) return "ALL";
  const sorted = [...arr].sort().join(",");
  for (const def of LENSES) {
    if (def.natures.length === 0) continue;
    if ([...def.natures].sort().join(",") === sorted) return def.key;
  }
  // Якщо набір не співпадає з жодним пресетом — повертаємо ALL.
  return "ALL";
}

// === Flow toggle ===

type Flow = "ALL" | "INCOME" | "EXPENSE";

function detectFlow(filters: FinancingFilters): Flow {
  if (filters.type === "INCOME") return "INCOME";
  if (filters.type === "EXPENSE") return "EXPENSE";
  return "ALL";
}

// === Component ===

export function LensBar({
  filters,
  setFilters,
  projects,
  users,
  scope,
}: {
  filters: FinancingFilters;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
  projects: ProjectOption[];
  users?: UserOption[];
  scope?: { id: string; title: string };
}) {
  const activeLens = detectLens(filters);
  const activeFlow = detectFlow(filters);
  const [moreOpen, setMoreOpen] = useState(false);
  const [counterpartyOptions, setCounterpartyOptions] = useState<ComboboxOption[]>([]);
  const [costCodeOptions, setCostCodeOptions] = useState<ComboboxOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cpRes, ccRes] = await Promise.all([
          fetch("/api/admin/financing/counterparties?take=100", { cache: "no-store" }),
          fetch("/api/admin/financing/cost-codes", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (cpRes.ok) {
          const j = await cpRes.json();
          setCounterpartyOptions(
            (j.data ?? []).map((c: { id: string; name: string }) => ({
              value: c.id,
              label: c.name,
            })),
          );
        }
        if (ccRes.ok) {
          const j = await ccRes.json();
          setCostCodeOptions(
            (j.data ?? []).map((c: { id: string; code: string; name: string }) => ({
              value: c.id,
              label: `${c.code} — ${c.name}`,
            })),
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickLens = (lens: Lens) => {
    setFilters((p) => ({ ...p, ...lensToFilterPatch(lens) }));
  };

  const pickFlow = (flow: Flow) => {
    setFilters((p) => ({ ...p, type: flow === "ALL" ? "" : flow }));
  };

  // Кількість активних додаткових фільтрів (для бейджа на «Більше»).
  const moreCount = useMemo(() => {
    let n = 0;
    if (!scope && filters.projectId) n++;
    if (filters.costCodeId) n++;
    if (filters.costType) n++;
    if (filters.counterpartyId) n++;
    if (filters.folderId) n++;
    if (filters.responsibleId) n++;
    if (filters.hasAttachments) n++;
    // Status показуємо тільки для COMMITTED/ACTUAL — рахуємо тільки тут.
    if ((activeLens === "COMMITTED" || activeLens === "ACTUAL") && filters.status) n++;
    return n;
  }, [filters, scope, activeLens]);

  const statusVisible = activeLens === "COMMITTED" || activeLens === "ACTUAL";

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl p-3 sm:p-4"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Row 1: Search + LensPicker + FlowToggle + «Більше» */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <label
          className="flex flex-1 min-w-[200px] items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: T.borderSoft, background: T.panelSoft }}
        >
          <Search size={14} style={{ color: T.textMuted }} />
          <input
            value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            placeholder="Пошук назвою, описом, контрагентом…"
            className="flex-1 bg-transparent text-[13px] focus:outline-none"
            style={{ color: T.textPrimary }}
          />
          {filters.search && (
            <button
              onClick={() => setFilters((p) => ({ ...p, search: "" }))}
              aria-label="Очистити пошук"
              className="rounded p-0.5 hover:brightness-95"
              style={{ color: T.textMuted }}
            >
              <X size={12} />
            </button>
          )}
        </label>

        {/* LensPicker */}
        <div
          className="flex items-center gap-0.5 rounded-lg border p-0.5"
          style={{ borderColor: T.borderSoft, background: T.panelSoft }}
          role="radiogroup"
          aria-label="Тип запису"
        >
          {LENSES.map((def) => {
            const active = activeLens === def.key;
            return (
              <button
                key={def.key}
                role="radio"
                aria-checked={active}
                onClick={() => pickLens(def.key)}
                title={def.hint}
                className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition"
                style={{
                  backgroundColor: active ? T.accentPrimary : "transparent",
                  color: active ? "#fff" : T.textSecondary,
                }}
              >
                {def.label}
              </button>
            );
          })}
        </div>

        {/* FlowToggle */}
        <div
          className="flex items-center gap-0.5 rounded-lg border p-0.5"
          style={{ borderColor: T.borderSoft, background: T.panelSoft }}
          role="radiogroup"
          aria-label="Напрямок"
        >
          <FlowChip active={activeFlow === "ALL"} onClick={() => pickFlow("ALL")} label="Усе" />
          <FlowChip
            active={activeFlow === "INCOME"}
            onClick={() => pickFlow("INCOME")}
            label="Доходи"
            icon={<TrendingUp size={12} />}
            color={T.success}
          />
          <FlowChip
            active={activeFlow === "EXPENSE"}
            onClick={() => pickFlow("EXPENSE")}
            label="Витрати"
            icon={<TrendingDown size={12} />}
            color={T.danger}
          />
        </div>

        {/* «Більше» */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold transition hover:brightness-[0.97]"
          style={{
            borderColor: T.borderSoft,
            color: T.textPrimary,
            background: T.panelSoft,
          }}
          aria-expanded={moreOpen}
        >
          Більше
          {moreCount > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: T.accentPrimary, minWidth: 18, height: 16 }}
            >
              {moreCount}
            </span>
          )}
          <ChevronDown
            size={12}
            style={{
              transition: "transform 150ms",
              transform: moreOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </div>

      {/* Row 2: DatePresets */}
      <DatePresets filters={filters} setFilters={setFilters} />

      {/* «Більше» panel */}
      {moreOpen && (
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 rounded-lg p-3"
          style={{ background: T.panelSoft, border: `1px dashed ${T.borderSoft}` }}
        >
          {!scope && (
            <FilterField label="Проєкт">
              <select
                value={filters.projectId}
                onChange={(e) => setFilters((p) => ({ ...p, projectId: e.target.value }))}
                className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: T.borderSoft, background: T.panel, color: T.textPrimary }}
              >
                <option value="">Усі проєкти</option>
                {projects.map((pj) => (
                  <option key={pj.id} value={pj.id}>
                    {pj.title}
                  </option>
                ))}
              </select>
            </FilterField>
          )}

          <FilterField label="Стаття витрат">
            <Combobox
              options={costCodeOptions}
              value={filters.costCodeId}
              onChange={(v) => setFilters((p) => ({ ...p, costCodeId: v ?? "" }))}
              placeholder="Усі статті"
              allowClear
            />
          </FilterField>

          <FilterField label="Тип витрати">
            <select
              value={filters.costType}
              onChange={(e) => setFilters((p) => ({ ...p, costType: e.target.value }))}
              className="w-full rounded-md border px-2 py-1.5 text-[12px]"
              style={{ borderColor: T.borderSoft, background: T.panel, color: T.textPrimary }}
            >
              <option value="">Усі типи</option>
              <option value="MATERIAL">Матеріали</option>
              <option value="LABOR">Робота (ЗП)</option>
              <option value="SUBCONTRACT">Підряд</option>
              <option value="EQUIPMENT">Техніка</option>
              <option value="OVERHEAD">Накладні</option>
              <option value="OTHER">Інше</option>
            </select>
          </FilterField>

          <FilterField label="Контрагент">
            <Combobox
              options={counterpartyOptions}
              value={filters.counterpartyId}
              onChange={(v) => setFilters((p) => ({ ...p, counterpartyId: v ?? "" }))}
              placeholder="Усі контрагенти"
              allowClear
            />
          </FilterField>

          {users && users.length > 0 && (
            <FilterField label="Автор">
              <select
                value={filters.responsibleId}
                onChange={(e) => setFilters((p) => ({ ...p, responsibleId: e.target.value }))}
                className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: T.borderSoft, background: T.panel, color: T.textPrimary }}
              >
                <option value="">Усі</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </FilterField>
          )}

          <FilterField label="Вкладення">
            <select
              value={filters.hasAttachments}
              onChange={(e) =>
                setFilters((p) => ({ ...p, hasAttachments: e.target.value }))
              }
              className="w-full rounded-md border px-2 py-1.5 text-[12px]"
              style={{ borderColor: T.borderSoft, background: T.panel, color: T.textPrimary }}
            >
              <option value="">Без різниці</option>
              <option value="true">З файлами</option>
              <option value="false">Без файлів</option>
            </select>
          </FilterField>

          {/* Status — лише для COMMITTED/ACTUAL */}
          {statusVisible && (
            <FilterField label="Статус">
              <select
                value={filters.status}
                onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: T.borderSoft, background: T.panel, color: T.textPrimary }}
              >
                <option value="">Усі статуси</option>
                <option value="DRAFT">Чернетка</option>
                <option value="PENDING">На погодженні</option>
                <option value="APPROVED">Підтверджено</option>
                <option value="PAID">Оплачено</option>
              </select>
            </FilterField>
          )}
        </div>
      )}
    </section>
  );
}

function FlowChip({
  active,
  onClick,
  label,
  icon,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition"
      style={{
        backgroundColor: active ? color ?? T.accentPrimary : "transparent",
        color: active ? "#fff" : T.textSecondary,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted, letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
