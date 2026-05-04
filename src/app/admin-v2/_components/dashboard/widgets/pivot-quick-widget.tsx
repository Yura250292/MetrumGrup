"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TableProperties, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

type Bucket = "PROJECTS" | "SALARY" | "ADMIN";

const SALARY_CATEGORY = "salary";

const BUCKET_LABELS: Record<Bucket, string> = {
  PROJECTS: "ПРОЄКТИ",
  SALARY: "ЗП",
  ADMIN: "Адмін",
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
  granularity: "TOTAL" | "DAY" | "WEEK" | "MONTH" | "YEAR";
  buckets: string[];
  rows: PivotRow[];
  totals: {
    income: { perBucket: Record<string, number>; total: number };
    expense: { perBucket: Record<string, number>; total: number };
    net: { perBucket: Record<string, number>; total: number };
  };
};

type Filters = {
  bucket: Bucket;
  showPlan: boolean;
};

const STORAGE_KEY = "admin-v2:dashboard:pivot-quick:filters";
const DEFAULT_FILTERS: Filters = { bucket: "PROJECTS", showPlan: true };

function loadFilters(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<Filters>;
    return {
      bucket: (parsed.bucket as Bucket) ?? DEFAULT_FILTERS.bucket,
      showPlan: parsed.showPlan ?? DEFAULT_FILTERS.showPlan,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: Filters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // ignore
  }
}

function buildOpenLink(filters: Filters): string {
  const p = new URLSearchParams({ tab: "pivot", bucket: filters.bucket });
  return `/admin-v2/financing?${p.toString()}`;
}

export function PivotQuickWidget() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    queueMicrotask(() => setFilters(loadFilters()));
  }, []);

  function patch(p: Partial<Filters>) {
    setFilters((prev) => {
      const next = { ...prev, ...p };
      saveFilters(next);
      return next;
    });
  }

  const queryString = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const p = new URLSearchParams({ from, to, granularity: "TOTAL" });
    if (filters.bucket === "SALARY") p.set("category", SALARY_CATEGORY);
    return p.toString();
  }, [filters.bucket]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "pivot-quick", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/admin/financing/pivot?${queryString}`);
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Помилка");
      return (await res.json()) as PivotResponse;
    },
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  const filteredRows = useMemo(() => {
    if (!data) return [] as PivotRow[];
    const base = filters.showPlan ? data.rows : data.rows.filter((r) => r.kind === "FACT");
    if (filters.bucket === "PROJECTS") return base.filter((r) => r.projectId !== null);
    if (filters.bucket === "ADMIN") return base.filter((r) => r.projectId === null && r.category !== SALARY_CATEGORY);
    return base;
  }, [data, filters]);

  // Project blocks (top 4 by abs net) when bucket=PROJECTS, otherwise show category aggregate
  const summary = useMemo(() => {
    if (!data) return null;
    let totalExpense = 0;
    let totalIncome = 0;

    const projectMap = new Map<string, { title: string; expense: number; income: number }>();

    for (const r of filteredRows) {
      const key = r.projectId ?? "__none__";
      const title = r.projectTitle ?? "Без проєкту";
      let agg = projectMap.get(key);
      if (!agg) {
        agg = { title, expense: 0, income: 0 };
        projectMap.set(key, agg);
      }
      if (r.type === "EXPENSE") {
        agg.expense += r.total;
        totalExpense += r.total;
      } else {
        agg.income += r.total;
        totalIncome += r.total;
      }
    }

    const projects = Array.from(projectMap.values())
      .map((p) => ({ ...p, net: p.income - p.expense }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 4);

    return {
      projects,
      totalExpense,
      totalIncome,
      totalNet: totalIncome - totalExpense,
    };
  }, [data, filteredRows]);

  if (data === null) {
    return (
      <WidgetShell icon={<TableProperties size={14} />} title="Зведена таблиця">
        <div className="flex h-full items-center justify-center text-[12px]" style={{ color: T.textMuted }}>
          Доступ обмежений роллю
        </div>
      </WidgetShell>
    );
  }

  const balanceColor = (summary?.totalNet ?? 0) >= 0 ? T.success : T.danger;

  return (
    <WidgetShell
      icon={<TableProperties size={14} />}
      title="Зведена таблиця"
      subtitle={data ? `${BUCKET_LABELS[filters.bucket]} · ${filteredRows.length} рядків` : "Завантаження…"}
      accent={balanceColor}
      action={{ href: buildOpenLink(filters), label: "Відкрити" }}
    >
      <div className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-1">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1">
          {(["PROJECTS", "SALARY", "ADMIN"] as Bucket[]).map((b) => (
            <FilterPill
              key={b}
              active={filters.bucket === b}
              onClick={() => patch({ bucket: b })}
            >
              {BUCKET_LABELS[b]}
            </FilterPill>
          ))}
          <span className="mx-1 h-3 w-px" style={{ background: T.borderSoft }} />
          <FilterPill
            active={filters.showPlan}
            onClick={() => patch({ showPlan: !filters.showPlan })}
          >
            {filters.showPlan ? "✓ План" : "План"}
          </FilterPill>
        </div>

        {(isLoading || !data || !summary) && (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
            <Loader2 size={14} className="animate-spin" /> Завантаження…
          </div>
        )}

        {error && !data && (
          <div className="flex flex-1 items-center justify-center text-[12px]" style={{ color: T.danger }}>
            Не вдалося завантажити
          </div>
        )}

        {data && summary && (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr style={{ background: T.panelSoft }}>
                <th
                  className="px-2 py-1.5 text-left font-semibold"
                  style={{ color: T.textSecondary, borderBottom: `1px solid ${T.borderSoft}` }}
                >
                  {filters.bucket === "PROJECTS" ? "Проєкт" : "Розділ"}
                </th>
                <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textSecondary, borderBottom: `1px solid ${T.borderSoft}` }}>
                  Витр
                </th>
                <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textSecondary, borderBottom: `1px solid ${T.borderSoft}` }}>
                  Дох
                </th>
                <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textSecondary, borderBottom: `1px solid ${T.borderSoft}` }}>
                  Рез
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Grand total — pinned at top */}
              <tr style={{ background: T.accentPrimarySoft, borderTop: `2px solid ${T.borderStrong}` }}>
                <td
                  className="px-2 py-1.5 font-bold uppercase"
                  style={{ color: T.accentPrimary, fontSize: 10, letterSpacing: 0.5 }}
                >
                  Загалом
                </td>
                <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap" style={{ color: T.danger }}>
                  {summary.totalExpense === 0 ? "—" : formatCurrencyCompact(summary.totalExpense)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap" style={{ color: T.success }}>
                  {summary.totalIncome === 0 ? "—" : formatCurrencyCompact(summary.totalIncome)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap" style={{ color: balanceColor }}>
                  {summary.totalNet === 0 ? "—" : formatCurrencyCompact(summary.totalNet)}
                </td>
              </tr>

              {summary.projects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center" style={{ color: T.textMuted }}>
                    Немає даних
                  </td>
                </tr>
              ) : (
                summary.projects.map((p, idx) => (
                  <tr key={idx} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                    <td
                      className="px-2 py-1.5 truncate max-w-[140px]"
                      style={{ color: T.textPrimary }}
                      title={p.title}
                    >
                      {p.title}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap" style={{ color: p.expense > 0 ? T.danger : T.textMuted }}>
                      {p.expense === 0 ? "—" : formatCurrencyCompact(p.expense)}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap" style={{ color: p.income > 0 ? T.success : T.textMuted }}>
                      {p.income === 0 ? "—" : formatCurrencyCompact(p.income)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: p.net >= 0 ? T.success : T.danger }}>
                      {p.net === 0 ? "—" : formatCurrencyCompact(p.net)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </WidgetShell>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold transition"
      style={{
        background: active ? T.accentPrimary : T.panel,
        color: active ? "#fff" : T.textSecondary,
        border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
      }}
    >
      {children}
    </button>
  );
}
