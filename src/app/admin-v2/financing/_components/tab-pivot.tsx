"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Download, RefreshCw, ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import type { FinancingFilters } from "./types";
import { startOfLocalDayISO, endOfLocalDayISO } from "@/lib/dates/local-day-range";
import type { PivotEntryDetail } from "@/lib/financing/pivot-entries";

type DrillState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  entries: PivotEntryDetail[];
  total: number;
  /// Skip-offset for the next "show more" request — points past the last loaded entry.
  nextOffset: number;
};

const DRILL_PAGE_SIZE = 20;

const EMPTY_DRILL: DrillState = {
  open: false,
  loading: false,
  error: null,
  entries: [],
  total: 0,
  nextOffset: 0,
};

function drillKey(row: PivotRow): string {
  return `${row.kind}::${row.type}::${row.projectId ?? "_NULL_"}::${row.category}::${row.subcategory ?? "_NULL_"}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

function formatQty(qty: number, unit: string | null): string {
  // Trim trailing zeros for readability (10.000 → 10, 85.500 → 85.5).
  const s = qty % 1 === 0 ? String(Math.round(qty)) : qty.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${s} ${unit}` : s;
}

type Bucket = "PROJECTS" | "SALARY" | "ADMIN";
type Granularity = "TOTAL" | "DAY" | "WEEK" | "MONTH" | "YEAR";

const SALARY_CATEGORY = "salary";

const BUCKET_LABELS: Record<Bucket, string> = {
  PROJECTS: "ПРОЄКТИ",
  SALARY: "ЗП",
  ADMIN: "Адміністративні витрати",
};

const GRANULARITY_LABELS: Record<Granularity, string> = {
  TOTAL: "Без розбивки",
  DAY: "Дні",
  WEEK: "Тижні",
  MONTH: "Місяці",
  YEAR: "Роки",
};

type PivotRow = {
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
  projectId: string | null;
  projectTitle: string | null;
  perBucket: Record<string, number>;
  total: number;
};

type PivotResponse = {
  range: { from: string; to: string };
  granularity: Granularity;
  buckets: string[];
  rows: PivotRow[];
  totals: {
    income: { perBucket: Record<string, number>; total: number };
    expense: { perBucket: Record<string, number>; total: number };
    net: { perBucket: Record<string, number>; total: number };
  };
};

const NO_PROJECT_KEY = "__NO_PROJECT__";
const NO_PROJECT_LABEL = "Без проєкту";

const MONTH_LABELS_UK = [
  "Січ", "Лют", "Бер", "Кві", "Тра", "Чер",
  "Лип", "Сер", "Вер", "Жов", "Лис", "Гру",
];

function formatBucketHeader(key: string, granularity: Granularity): string {
  if (granularity === "TOTAL") return "Загалом";
  if (granularity === "YEAR") return key;
  if (granularity === "MONTH") {
    const [yearStr, monthStr] = key.split("-");
    const m = Number(monthStr) - 1;
    return `${MONTH_LABELS_UK[m] ?? monthStr}.${yearStr.slice(2)}`;
  }
  if (granularity === "WEEK") {
    const [yearStr, w] = key.split("-W");
    return `${w}т ’${yearStr.slice(2)}`;
  }
  // DAY: 2026-04-15 → 15.04
  const [, mm, dd] = key.split("-");
  return `${dd}.${mm}`;
}

function categoryLabel(cat: string): string {
  return FINANCE_CATEGORY_LABELS[cat] ?? cat;
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// Render-friendly aggregates per project
type ProjectBlock = {
  projectId: string;
  projectTitle: string;
  factIncome: PivotRow[];
  factExpense: PivotRow[];
  planIncome: PivotRow[];
  planExpense: PivotRow[];
  factIncomePerBucket: Record<string, number>;
  factExpensePerBucket: Record<string, number>;
  planIncomePerBucket: Record<string, number>;
  planExpensePerBucket: Record<string, number>;
  factIncomeTotal: number;
  factExpenseTotal: number;
  planIncomeTotal: number;
  planExpenseTotal: number;
};

function emptyBucketMap(buckets: string[]): Record<string, number> {
  return Object.fromEntries(buckets.map((b) => [b, 0]));
}

function addToBucketMap(
  target: Record<string, number>,
  src: Record<string, number>,
  buckets: string[],
) {
  for (const b of buckets) target[b] = (target[b] ?? 0) + (src[b] ?? 0);
}

function buildProjectBlocks(rows: PivotRow[], buckets: string[]): ProjectBlock[] {
  const map = new Map<string, ProjectBlock>();
  for (const r of rows) {
    const key = r.projectId ?? NO_PROJECT_KEY;
    let block = map.get(key);
    if (!block) {
      block = {
        projectId: key,
        projectTitle: r.projectTitle ?? NO_PROJECT_LABEL,
        factIncome: [],
        factExpense: [],
        planIncome: [],
        planExpense: [],
        factIncomePerBucket: emptyBucketMap(buckets),
        factExpensePerBucket: emptyBucketMap(buckets),
        planIncomePerBucket: emptyBucketMap(buckets),
        planExpensePerBucket: emptyBucketMap(buckets),
        factIncomeTotal: 0,
        factExpenseTotal: 0,
        planIncomeTotal: 0,
        planExpenseTotal: 0,
      };
      map.set(key, block);
    }
    if (r.kind === "FACT" && r.type === "INCOME") {
      block.factIncome.push(r);
      addToBucketMap(block.factIncomePerBucket, r.perBucket, buckets);
      block.factIncomeTotal += r.total;
    } else if (r.kind === "FACT" && r.type === "EXPENSE") {
      block.factExpense.push(r);
      addToBucketMap(block.factExpensePerBucket, r.perBucket, buckets);
      block.factExpenseTotal += r.total;
    } else if (r.kind === "PLAN" && r.type === "INCOME") {
      block.planIncome.push(r);
      addToBucketMap(block.planIncomePerBucket, r.perBucket, buckets);
      block.planIncomeTotal += r.total;
    } else {
      block.planExpense.push(r);
      addToBucketMap(block.planExpensePerBucket, r.perBucket, buckets);
      block.planExpenseTotal += r.total;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.projectId === NO_PROJECT_KEY) return 1;
    if (b.projectId === NO_PROJECT_KEY) return -1;
    return a.projectTitle.localeCompare(b.projectTitle);
  });
}

function buildOperationsLink(opts: {
  projectId?: string | null;
  category?: string;
  subcategory?: string | null;
  kind?: "PLAN" | "FACT";
  type?: "INCOME" | "EXPENSE";
  from?: string;
  to?: string;
}): string {
  const p = new URLSearchParams({ tab: "operations" });
  if (opts.projectId) p.set("projectId", opts.projectId);
  if (opts.category) p.set("category", opts.category);
  if (opts.subcategory) p.set("subcategory", opts.subcategory);
  if (opts.kind) p.set("kind", opts.kind);
  if (opts.type) p.set("type", opts.type);
  if (opts.from) p.set("from", opts.from);
  if (opts.to) p.set("to", opts.to);
  return `/admin-v2/financing?${p.toString()}`;
}

export function TabPivot({
  scope,
  filters,
}: {
  scope?: { id: string; title: string };
  filters: FinancingFilters;
}) {
  const searchParams = useSearchParams();
  const bucketFromUrl = searchParams.get("bucket");
  const initialBucket: Bucket =
    bucketFromUrl === "SALARY" || bucketFromUrl === "ADMIN" ? bucketFromUrl : "PROJECTS";
  const [bucket, setBucket] = useState<Bucket>(initialBucket);
  const [granularity, setGranularity] = useState<Granularity>("TOTAL");
  const [showPlan, setShowPlan] = useState(true);
  const [data, setData] = useState<PivotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [drillMap, setDrillMap] = useState<Record<string, DrillState>>({});

  const query = useMemo(() => {
    const p = new URLSearchParams();

    if (scope) {
      p.set("projectId", scope.id);
    } else {
      if (bucket === "SALARY") p.set("category", SALARY_CATEGORY);
      if (filters.projectId) p.set("projectId", filters.projectId);
      if (filters.folderId) p.set("folderId", filters.folderId);
    }

    p.set("granularity", granularity);

    if (filters.from) p.set("from", startOfLocalDayISO(filters.from));
    if (filters.to) p.set("to", endOfLocalDayISO(filters.to));

    if (filters.archived) p.set("archived", "true");

    return p.toString();
  }, [scope, filters, bucket, granularity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/financing/pivot?${query}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Помилка завантаження");
        const json: PivotResponse = await res.json();
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Помилка";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Client-side bucket filter
  const filteredRows = useMemo<PivotRow[]>(() => {
    if (!data) return [];
    const base = showPlan ? data.rows : data.rows.filter((r) => r.kind === "FACT");
    if (bucket === "PROJECTS") return base.filter((r) => r.projectId !== null);
    if (bucket === "ADMIN") return base.filter((r) => r.projectId === null && r.category !== SALARY_CATEGORY);
    return base; // SALARY
  }, [data, bucket, showPlan]);

  const buckets = useMemo<string[]>(() => data?.buckets ?? [], [data]);

  // Recompute totals from filteredRows
  const computedTotals = useMemo(() => {
    const incomePerBucket = emptyBucketMap(buckets);
    const expensePerBucket = emptyBucketMap(buckets);
    let incomeTotal = 0;
    let expenseTotal = 0;
    for (const r of filteredRows) {
      const target = r.type === "INCOME" ? incomePerBucket : expensePerBucket;
      addToBucketMap(target, r.perBucket, buckets);
      if (r.type === "INCOME") incomeTotal += r.total;
      else expenseTotal += r.total;
    }
    const netPerBucket: Record<string, number> = {};
    for (const b of buckets) {
      netPerBucket[b] = (incomePerBucket[b] ?? 0) - (expensePerBucket[b] ?? 0);
    }
    return {
      income: { perBucket: incomePerBucket, total: incomeTotal },
      expense: { perBucket: expensePerBucket, total: expenseTotal },
      net: { perBucket: netPerBucket, total: incomeTotal - expenseTotal },
    };
  }, [filteredRows, buckets]);

  const projectBlocks = useMemo(
    () => buildProjectBlocks(filteredRows, buckets),
    [filteredRows, buckets],
  );

  function toggleProjectExpand(id: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedProjects(new Set(projectBlocks.map((p) => p.projectId)));
  }

  function collapseAll() {
    setExpandedProjects(new Set());
    setDrillMap({});
  }

  async function loadDrillPage(row: PivotRow, offset: number, append: boolean) {
    const key = drillKey(row);
    setDrillMap((m) => ({
      ...m,
      [key]: {
        ...(m[key] ?? EMPTY_DRILL),
        open: true,
        loading: true,
        error: null,
      },
    }));

    try {
      const p = new URLSearchParams();
      p.set("kind", row.kind);
      p.set("type", row.type);
      p.set("category", row.category);
      // subcategory: empty string = filter for NULL; absent = no filter. Our
      // PivotRow encodes "missing subcategory" as null → пасе саме як empty.
      if (row.subcategory != null) p.set("subcategory", row.subcategory);
      else p.set("subcategory", "");
      if (row.projectId) p.set("projectId", row.projectId);
      else p.set("projectId", "null");
      if (filters.from) p.set("from", startOfLocalDayISO(filters.from));
      if (filters.to) p.set("to", endOfLocalDayISO(filters.to));
      if (filters.folderId) p.set("folderId", filters.folderId);
      if (filters.archived) p.set("archived", "true");
      p.set("limit", String(DRILL_PAGE_SIZE));
      p.set("offset", String(offset));

      const res = await fetch(
        `/api/admin/financing/pivot/entries?${p.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Не вдалось завантажити деталі");
      const json: {
        entries: PivotEntryDetail[];
        total: number;
        limit: number;
        offset: number;
      } = await res.json();

      setDrillMap((m) => {
        const prev = m[key] ?? EMPTY_DRILL;
        const merged = append ? [...prev.entries, ...json.entries] : json.entries;
        return {
          ...m,
          [key]: {
            open: true,
            loading: false,
            error: null,
            entries: merged,
            total: json.total,
            nextOffset: json.offset + json.entries.length,
          },
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Помилка";
      setDrillMap((m) => ({
        ...m,
        [key]: {
          ...(m[key] ?? EMPTY_DRILL),
          open: true,
          loading: false,
          error: msg,
        },
      }));
    }
  }

  function toggleDrill(row: PivotRow) {
    const key = drillKey(row);
    const current = drillMap[key];
    if (current?.open) {
      setDrillMap((m) => ({ ...m, [key]: { ...current, open: false } }));
      return;
    }
    // Re-use cached entries if we have them; otherwise lazy-load.
    if (current && current.entries.length > 0) {
      setDrillMap((m) => ({ ...m, [key]: { ...current, open: true } }));
      return;
    }
    void loadDrillPage(row, 0, /*append*/ false);
  }

  // Drop drill cache whenever query params change — stale rows would mislead.
  useEffect(() => {
    setDrillMap({});
  }, [query]);

  function handleExportCsv() {
    if (!data) return;
    const headers: string[] = ["Тип", "План/Факт", "Проєкт", "Категорія", "Субкатегорія"];
    for (const b of buckets) headers.push(formatBucketHeader(b, data.granularity));
    headers.push("Σ");
    const lines: string[] = [headers.join(",")];
    for (const r of filteredRows) {
      const cells: string[] = [
        r.type === "INCOME" ? "Дохід" : "Витрата",
        r.kind === "FACT" ? "Факт" : "План",
        r.projectTitle ?? NO_PROJECT_LABEL,
        categoryLabel(r.category),
        r.subcategory ?? "",
      ];
      for (const b of buckets) cells.push(String(r.perBucket[b] ?? 0));
      cells.push(String(r.total));
      lines.push(cells.map(csvEscape).join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pivot-${data.range.from.slice(0, 10)}-${data.range.to.slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const showScopeFilter = !scope;
  const fromIso = filters.from ? startOfLocalDayISO(filters.from) : undefined;
  const toIso = filters.to ? endOfLocalDayISO(filters.to) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar — sticky щоб фільтри завжди залишались зверху, а таблиця оновлювалась знизу */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 -mx-1 px-1 py-2"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: T.background,
          borderBottom: `1px solid ${T.borderSoft}`,
          backdropFilter: "saturate(180%) blur(8px)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Bucket chips */}
          {showScopeFilter && (
            <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: T.borderSoft, background: T.panel }}>
              {(["PROJECTS", "SALARY", "ADMIN"] as Bucket[]).map((b) => {
                const active = bucket === b;
                return (
                  <button
                    key={b}
                    onClick={() => setBucket(b)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium transition"
                    style={{
                      background: active ? T.accentPrimary : "transparent",
                      color: active ? "#fff" : T.textSecondary,
                    }}
                  >
                    {BUCKET_LABELS[b]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Granularity select */}
          <label className="flex items-center gap-2 rounded-lg border px-2 py-1 text-sm" style={{ borderColor: T.borderSoft, background: T.panel, color: T.textSecondary }}>
            <span style={{ color: T.textMuted, fontSize: 12 }}>Період:</span>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
              className="bg-transparent text-sm focus:outline-none"
              style={{ color: T.textPrimary }}
            >
              {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
                <option key={g} value={g}>
                  {GRANULARITY_LABELS[g]}
                </option>
              ))}
            </select>
          </label>

          {/* Show plan toggle */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: T.borderSoft, background: T.panel, color: T.textSecondary }}>
            <input
              type="checkbox"
              checked={showPlan}
              onChange={(e) => setShowPlan(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Показувати План
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition"
            style={{ borderColor: T.borderSoft, color: T.textSecondary, background: T.panel }}
          >
            <Maximize2 size={12} /> Розгорнути все
          </button>
          <button
            onClick={collapseAll}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition"
            style={{ borderColor: T.borderSoft, color: T.textSecondary, background: T.panel }}
          >
            <Minimize2 size={12} /> Згорнути все
          </button>
          <button
            onClick={handleExportCsv}
            disabled={!data || loading}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
            style={{ borderColor: T.borderSoft, color: T.textPrimary, background: T.panel }}
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 rounded-md border p-3 text-sm"
          style={{ borderColor: T.danger, background: T.dangerSoft, color: T.danger }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 rounded-lg border p-12 text-sm" style={{ borderColor: T.borderSoft, color: T.textSecondary }}>
          <Loader2 size={16} className="animate-spin" /> Завантаження…
        </div>
      )}

      {data && filteredRows.length === 0 && !loading && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border p-12 text-sm"
          style={{ borderColor: T.borderSoft, color: T.textSecondary, background: T.panel }}
        >
          <RefreshCw size={20} />
          <div>Немає даних за обраний період</div>
        </div>
      )}

      {data && filteredRows.length > 0 && (
        <div
          className="overflow-x-auto rounded-lg border relative"
          style={{ borderColor: T.borderSoft, background: T.panel, opacity: loading ? 0.6 : 1, transition: "opacity 120ms ease" }}
        >
          {loading && (
            <div
              className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium"
              style={{ borderColor: T.borderSoft, background: T.panel, color: T.textSecondary, boxShadow: T.shadow1 }}
            >
              <Loader2 size={12} className="animate-spin" /> Оновлення…
            </div>
          )}
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* Row 1: bucket headers (each spans 3 sub-columns) */}
              <tr style={{ background: T.panelSoft }}>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 px-3 py-2 text-left font-semibold"
                  style={{
                    background: T.panelSoft,
                    color: T.textPrimary,
                    borderBottom: `1px solid ${T.borderSoft}`,
                    borderRight: `1px solid ${T.borderSoft}`,
                    minWidth: 240,
                  }}
                >
                  Назва
                </th>
                {buckets.map((b) => (
                  <th
                    key={b}
                    colSpan={3}
                    className="px-2 py-1.5 text-center font-semibold whitespace-nowrap"
                    style={{
                      color: T.textPrimary,
                      borderBottom: `1px solid ${T.borderSoft}`,
                      borderLeft: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    {formatBucketHeader(b, data.granularity)}
                  </th>
                ))}
              </tr>
              {/* Row 2: triplet sub-headers */}
              <tr style={{ background: T.panelSoft }}>
                {buckets.map((b) => (
                  <SubHeaderTriplet key={b} firstColumn={true} />
                ))}
              </tr>

              {/* Sticky grand-total row */}
              <tr
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  background: T.accentPrimarySoft,
                  borderTop: `2px solid ${T.borderStrong}`,
                  borderBottom: `2px solid ${T.borderStrong}`,
                }}
              >
                <td
                  className="sticky left-0 z-20 px-3 py-2 font-bold uppercase"
                  style={{
                    background: T.accentPrimarySoft,
                    color: T.accentPrimary,
                    fontSize: 11,
                    letterSpacing: 0.5,
                    borderRight: `1px solid ${T.borderSoft}`,
                  }}
                >
                  ЗАГАЛЬНИЙ РЕЗУЛЬТАТ
                </td>
                {buckets.map((b) => {
                  const exp = computedTotals.expense.perBucket[b] ?? 0;
                  const inc = computedTotals.income.perBucket[b] ?? 0;
                  const net = computedTotals.net.perBucket[b] ?? 0;
                  return (
                    <TripletCells
                      key={b}
                      expense={exp}
                      income={inc}
                      net={net}
                      bold
                    />
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {projectBlocks.map((block) => {
                const isExpanded = expandedProjects.has(block.projectId);
                const linkable = block.projectId !== NO_PROJECT_KEY;
                return (
                  <ProjectRows
                    key={block.projectId}
                    block={block}
                    buckets={buckets}
                    isExpanded={isExpanded}
                    onToggle={() => toggleProjectExpand(block.projectId)}
                    showPlan={showPlan}
                    linkable={linkable}
                    fromIso={fromIso}
                    toIso={toIso}
                    drillMap={drillMap}
                    onDrillToggle={toggleDrill}
                    onDrillLoadMore={(row) =>
                      loadDrillPage(row, drillMap[drillKey(row)]?.nextOffset ?? 0, true)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="text-xs" style={{ color: T.textMuted }}>
          Період: {data.range.from.slice(0, 10)} — {data.range.to.slice(0, 10)} ·{" "}
          {data.granularity === "TOTAL" ? "без розбивки" : `${buckets.length} ${GRANULARITY_LABELS[data.granularity].toLowerCase()}`} · {filteredRows.length} рядків · {projectBlocks.length} блок(ів)
        </div>
      )}
    </div>
  );
}

function SubHeaderTriplet({ firstColumn: _ }: { firstColumn?: boolean }) {
  return (
    <>
      <th className="px-2 py-1 text-right font-medium whitespace-nowrap" style={{ color: T.textMuted, fontSize: 11, borderBottom: `1px solid ${T.borderSoft}`, borderLeft: `1px solid ${T.borderSoft}`, minWidth: 70 }}>
        Витрати
      </th>
      <th className="px-2 py-1 text-right font-medium whitespace-nowrap" style={{ color: T.textMuted, fontSize: 11, borderBottom: `1px solid ${T.borderSoft}`, minWidth: 70 }}>
        Доходи
      </th>
      <th className="px-2 py-1 text-right font-medium whitespace-nowrap" style={{ color: T.textMuted, fontSize: 11, borderBottom: `1px solid ${T.borderSoft}`, minWidth: 70 }}>
        Результат
      </th>
    </>
  );
}

function TripletCells({
  expense,
  income,
  net,
  bold = false,
  muted = false,
}: {
  expense: number;
  income: number;
  net: number;
  bold?: boolean;
  muted?: boolean;
}) {
  const fmt = (v: number) => (v === 0 ? "—" : formatCurrency(v));
  const netColor = net > 0 ? T.success : net < 0 ? T.danger : T.textMuted;
  const netPrefix = net > 0 ? "+" : net < 0 ? "−" : "";

  return (
    <>
      <td
        className="px-2 py-1.5 text-right whitespace-nowrap"
        style={{
          color: expense > 0 ? T.danger : muted ? T.textMuted : T.textSecondary,
          fontWeight: bold ? 700 : 400,
          borderLeft: `1px solid ${T.borderSoft}`,
        }}
      >
        {expense === 0 ? "—" : fmt(expense)}
      </td>
      <td
        className="px-2 py-1.5 text-right whitespace-nowrap"
        style={{
          color: income > 0 ? T.success : muted ? T.textMuted : T.textSecondary,
          fontWeight: bold ? 700 : 400,
        }}
      >
        {income === 0 ? "—" : fmt(income)}
      </td>
      <td
        className="px-2 py-1.5 text-right whitespace-nowrap"
        style={{
          color: netColor,
          fontWeight: bold ? 700 : 600,
        }}
      >
        {net === 0 ? "—" : `${netPrefix}${formatCurrency(Math.abs(net))}`}
      </td>
    </>
  );
}

function ProjectRows({
  block,
  buckets,
  isExpanded,
  onToggle,
  showPlan,
  linkable,
  fromIso,
  toIso,
  drillMap,
  onDrillToggle,
  onDrillLoadMore,
}: {
  block: ProjectBlock;
  buckets: string[];
  isExpanded: boolean;
  onToggle: () => void;
  showPlan: boolean;
  linkable: boolean;
  fromIso?: string;
  toIso?: string;
  drillMap: Record<string, DrillState>;
  onDrillToggle: (row: PivotRow) => void;
  onDrillLoadMore: (row: PivotRow) => void;
}) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  // Project header — sums depend on showPlan
  const headerExpensePerBucket = emptyBucketMap(buckets);
  const headerIncomePerBucket = emptyBucketMap(buckets);
  addToBucketMap(headerExpensePerBucket, block.factExpensePerBucket, buckets);
  addToBucketMap(headerIncomePerBucket, block.factIncomePerBucket, buckets);
  if (showPlan) {
    addToBucketMap(headerExpensePerBucket, block.planExpensePerBucket, buckets);
    addToBucketMap(headerIncomePerBucket, block.planIncomePerBucket, buckets);
  }

  return (
    <>
      {/* Project header row */}
      <tr
        onClick={onToggle}
        style={{
          background: T.panelSoft,
          cursor: "pointer",
          borderTop: `2px solid ${T.borderStrong}`,
        }}
      >
        <td
          className="sticky left-0 z-10 px-3 py-2 font-semibold"
          style={{ background: T.panelSoft, color: T.textPrimary, borderRight: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center gap-2">
            <Chevron size={14} />
            {linkable ? (
              <Link
                href={`/admin-v2/projects/${block.projectId}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline"
                style={{ color: T.accentPrimary }}
              >
                {block.projectTitle}
              </Link>
            ) : (
              <span>{block.projectTitle}</span>
            )}
          </div>
        </td>
        {buckets.map((b) => {
          const exp = headerExpensePerBucket[b] ?? 0;
          const inc = headerIncomePerBucket[b] ?? 0;
          return <TripletCells key={b} expense={exp} income={inc} net={inc - exp} bold />;
        })}
      </tr>

      {isExpanded && (
        <>
          {/* Фактичні: subtotal */}
          <SubtotalRow
            label="Фактичні:"
            buckets={buckets}
            expensePerBucket={block.factExpensePerBucket}
            incomePerBucket={block.factIncomePerBucket}
          />
          {block.factIncome.map((r, i) => (
            <CategoryRow
              key={`fi-${i}`}
              row={r}
              buckets={buckets}
              fromIso={fromIso}
              toIso={toIso}
              drill={drillMap[drillKey(r)] ?? EMPTY_DRILL}
              onToggle={() => onDrillToggle(r)}
              onLoadMore={() => onDrillLoadMore(r)}
            />
          ))}
          {block.factExpense.map((r, i) => (
            <CategoryRow
              key={`fe-${i}`}
              row={r}
              buckets={buckets}
              fromIso={fromIso}
              toIso={toIso}
              drill={drillMap[drillKey(r)] ?? EMPTY_DRILL}
              onToggle={() => onDrillToggle(r)}
              onLoadMore={() => onDrillLoadMore(r)}
            />
          ))}

          {/* Планові: subtotal — only if showPlan */}
          {showPlan && (block.planIncome.length + block.planExpense.length > 0) && (
            <>
              <SubtotalRow
                label="Планові:"
                buckets={buckets}
                expensePerBucket={block.planExpensePerBucket}
                incomePerBucket={block.planIncomePerBucket}
              />
              {block.planIncome.map((r, i) => (
                <CategoryRow
                  key={`pi-${i}`}
                  row={r}
                  buckets={buckets}
                  fromIso={fromIso}
                  toIso={toIso}
                  drill={drillMap[drillKey(r)] ?? EMPTY_DRILL}
                  onToggle={() => onDrillToggle(r)}
                  onLoadMore={() => onDrillLoadMore(r)}
                />
              ))}
              {block.planExpense.map((r, i) => (
                <CategoryRow
                  key={`pe-${i}`}
                  row={r}
                  buckets={buckets}
                  fromIso={fromIso}
                  toIso={toIso}
                  drill={drillMap[drillKey(r)] ?? EMPTY_DRILL}
                  onToggle={() => onDrillToggle(r)}
                  onLoadMore={() => onDrillLoadMore(r)}
                />
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

function SubtotalRow({
  label,
  buckets,
  expensePerBucket,
  incomePerBucket,
}: {
  label: string;
  buckets: string[];
  expensePerBucket: Record<string, number>;
  incomePerBucket: Record<string, number>;
}) {
  return (
    <tr style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.panel }}>
      <td
        className="sticky left-0 z-10 px-3 py-1.5 font-semibold"
        style={{ background: T.panel, color: T.textSecondary, fontSize: 12, paddingLeft: 28, borderRight: `1px solid ${T.borderSoft}` }}
      >
        {label}
      </td>
      {buckets.map((b) => {
        const exp = expensePerBucket[b] ?? 0;
        const inc = incomePerBucket[b] ?? 0;
        return <TripletCells key={b} expense={exp} income={inc} net={inc - exp} muted />;
      })}
    </tr>
  );
}

function CategoryRow({
  row,
  buckets,
  fromIso,
  toIso,
  drill,
  onToggle,
  onLoadMore,
}: {
  row: PivotRow;
  buckets: string[];
  fromIso?: string;
  toIso?: string;
  drill: DrillState;
  onToggle: () => void;
  onLoadMore: () => void;
}) {
  const link = buildOperationsLink({
    projectId: row.projectId,
    category: row.category,
    subcategory: row.subcategory ?? undefined,
    kind: row.kind,
    type: row.type,
    from: fromIso,
    to: toIso,
  });

  const DrillChevron = drill.open ? ChevronDown : ChevronRight;
  const totalCols = 1 + buckets.length * 3;

  return (
    <>
      <tr
        style={{ borderTop: `1px solid ${T.borderSoft}`, cursor: "pointer" }}
        onClick={onToggle}
      >
        <td
          className="sticky left-0 z-10 px-3 py-1.5"
          style={{ background: T.panel, color: T.textPrimary, paddingLeft: 44, borderRight: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center gap-1.5">
            <DrillChevron size={12} style={{ color: T.textMuted }} />
            <Link
              href={link}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
              style={{ color: T.textPrimary }}
            >
              {categoryLabel(row.category)}
              {row.subcategory && (
                <span className="ml-1" style={{ color: T.textMuted }}>
                  / {row.subcategory}
                </span>
              )}
            </Link>
          </div>
        </td>
        {buckets.map((b) => {
          const v = row.perBucket[b] ?? 0;
          const isExpense = row.type === "EXPENSE";
          const isIncome = row.type === "INCOME";
          return (
            <TripletCells
              key={b}
              expense={isExpense ? v : 0}
              income={isIncome ? v : 0}
              net={isIncome ? v : -v}
            />
          );
        })}
      </tr>
      {drill.open && (
        <tr style={{ background: T.panelSoft }}>
          <td colSpan={totalCols} style={{ padding: 0, borderTop: `1px solid ${T.borderSoft}` }}>
            <DrillContent
              drill={drill}
              type={row.type}
              onLoadMore={onLoadMore}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function DrillContent({
  drill,
  type,
  onLoadMore,
}: {
  drill: DrillState;
  type: "INCOME" | "EXPENSE";
  onLoadMore: () => void;
}) {
  const isInitialLoad = drill.loading && drill.entries.length === 0;
  const hasMore = drill.entries.length < drill.total;
  const amountColor = type === "EXPENSE" ? T.danger : T.success;

  if (drill.error && drill.entries.length === 0) {
    return (
      <div className="px-12 py-3 text-xs" style={{ color: T.danger }}>
        {drill.error}
      </div>
    );
  }

  if (isInitialLoad) {
    return (
      <div className="px-12 py-3 flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
        <Loader2 size={12} className="animate-spin" />
        Завантаження…
      </div>
    );
  }

  if (drill.entries.length === 0) {
    return (
      <div className="px-12 py-3 text-xs" style={{ color: T.textMuted }}>
        Немає окремих записів у цій категорії за період.
      </div>
    );
  }

  return (
    <div className="px-12 py-2">
      <table className="w-full" style={{ fontSize: 11.5 }}>
        <thead>
          <tr style={{ color: T.textMuted }}>
            <th className="text-left py-1 pr-3 font-medium" style={{ minWidth: 72 }}>Дата</th>
            <th className="text-left py-1 pr-3 font-medium">Опис</th>
            <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">Кількість × ціна</th>
            <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">Сума</th>
            <th className="text-left py-1 font-medium">Контрагент</th>
          </tr>
        </thead>
        <tbody>
          {drill.entries.map((e) => (
            <tr key={e.id} style={{ borderTop: `1px dashed ${T.borderSoft}` }}>
              <td className="py-1 pr-3 whitespace-nowrap" style={{ color: T.textSecondary }}>
                {formatDateShort(e.occurredAt)}
              </td>
              <td className="py-1 pr-3" style={{ color: T.textPrimary }}>
                <div className="flex flex-col">
                  <span>{e.title}</span>
                  {e.stageName && (
                    <span className="text-[10px]" style={{ color: T.textMuted }}>
                      етап: {e.stageName}
                    </span>
                  )}
                </div>
              </td>
              <td className="py-1 pr-3 text-right tabular-nums whitespace-nowrap" style={{ color: T.textSecondary }}>
                {e.quantity != null && e.unitPrice != null
                  ? `${formatQty(e.quantity, e.unit)} × ${formatCurrency(e.unitPrice)}`
                  : "—"}
              </td>
              <td
                className="py-1 pr-3 text-right tabular-nums whitespace-nowrap font-semibold"
                style={{ color: amountColor }}
              >
                {formatCurrency(e.amount)}
              </td>
              <td className="py-1" style={{ color: T.textSecondary }}>
                {e.counterparty ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(hasMore || drill.error) && (
        <div className="flex items-center justify-between gap-3 mt-1.5">
          {drill.error ? (
            <span className="text-[11px]" style={{ color: T.danger }}>{drill.error}</span>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              Показано {drill.entries.length} з {drill.total}
            </span>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={drill.loading}
              className="text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50"
              style={{ color: T.accentPrimary }}
            >
              {drill.loading && <Loader2 size={11} className="animate-spin" />}
              Показати ще
            </button>
          )}
        </div>
      )}
    </div>
  );
}
