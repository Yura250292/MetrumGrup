"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TableProperties, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

type PivotRow = {
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
  projectId: string | null;
  projectTitle: string | null;
  perMonth: Record<string, number>;
  total: number;
};

type PivotResponse = {
  range: { from: string; to: string };
  months: string[];
  rows: PivotRow[];
  totals: {
    income: { perMonth: Record<string, number>; total: number };
    expense: { perMonth: Record<string, number>; total: number };
    net: { perMonth: Record<string, number>; total: number };
  };
};

type ScopeMode = "ALL" | "SALARY" | "GENERAL_EXPENSES" | "PROJECTS_ONLY";
type KindMode = "ALL" | "PLAN" | "FACT";
type PeriodMonths = 3 | 6 | 12;

type Filters = {
  scope: ScopeMode;
  kind: KindMode;
  months: PeriodMonths;
};

const STORAGE_KEY = "admin-v2:dashboard:pivot-quick:filters";

const DEFAULT_FILTERS: Filters = {
  scope: "ALL",
  kind: "ALL",
  months: 6,
};

const GENERAL_EXPENSES_FOLDER_ID = "fld_sys_general_expenses";

const MONTH_LABELS_UK = [
  "Січ", "Лют", "Бер", "Кві", "Тра", "Чер",
  "Лип", "Сер", "Вер", "Жов", "Лис", "Гру",
];

function formatMonthHeader(key: string): string {
  const [yearStr, monthStr] = key.split("-");
  const m = Number(monthStr) - 1;
  return `${MONTH_LABELS_UK[m] ?? monthStr} ${yearStr.slice(2)}`;
}

function lastN<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

function loadFilters(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<Filters>;
    return {
      scope: (parsed.scope as ScopeMode) ?? DEFAULT_FILTERS.scope,
      kind: (parsed.kind as KindMode) ?? DEFAULT_FILTERS.kind,
      months: (parsed.months as PeriodMonths) ?? DEFAULT_FILTERS.months,
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
    // ignore quota / privacy errors
  }
}

function buildLink(filters: Filters): string {
  // Forward filter state into the full pivot tab via query params it understands
  const p = new URLSearchParams({ tab: "pivot" });
  if (filters.scope === "GENERAL_EXPENSES") p.set("folderId", GENERAL_EXPENSES_FOLDER_ID);
  return `/admin-v2/financing?${p.toString()}`;
}

export function PivotQuickWidget() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    // Hydrate from localStorage post-mount. queueMicrotask defers the setState
    // past the effect's synchronous body so the linter doesn't flag a cascade.
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
    const from = new Date(now.getFullYear(), now.getMonth() - (filters.months - 1), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const p = new URLSearchParams({ from, to });

    if (filters.scope === "SALARY") p.set("category", "salary");
    else if (filters.scope === "GENERAL_EXPENSES") p.set("folderId", GENERAL_EXPENSES_FOLDER_ID);

    if (filters.kind !== "ALL") p.set("kind", filters.kind);

    return p.toString();
  }, [filters]);

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
    if (filters.scope === "PROJECTS_ONLY") return data.rows.filter((r) => r.projectId !== null);
    return data.rows;
  }, [data, filters.scope]);

  // Show last 3 months only — compact view
  const visibleMonths = useMemo(() => (data ? lastN(data.months, 3) : []), [data]);

  // Top 4 projects by absolute net (recomputed from filteredRows)
  const { topProjects, netPerMonth, netTotal } = useMemo(() => {
    if (!data) return { topProjects: [], netPerMonth: {}, netTotal: 0 };

    const projectAggregates = new Map<
      string,
      { title: string; net: number; netPerMonth: Record<string, number> }
    >();
    const overallNetPerMonth: Record<string, number> = Object.fromEntries(visibleMonths.map((m) => [m, 0]));
    let overallNetTotal = 0;

    for (const r of filteredRows) {
      const key = r.projectId ?? "__none__";
      const title = r.projectTitle ?? "Без проєкту";
      let agg = projectAggregates.get(key);
      if (!agg) {
        agg = { title, net: 0, netPerMonth: Object.fromEntries(visibleMonths.map((m) => [m, 0])) };
        projectAggregates.set(key, agg);
      }
      const sign = r.type === "INCOME" ? 1 : -1;
      agg.net += sign * r.total;
      overallNetTotal += sign * r.total;
      for (const m of visibleMonths) {
        const v = sign * (r.perMonth[m] ?? 0);
        agg.netPerMonth[m] = (agg.netPerMonth[m] ?? 0) + v;
        overallNetPerMonth[m] = (overallNetPerMonth[m] ?? 0) + v;
      }
    }

    const top = Array.from(projectAggregates.values())
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 4);

    return { topProjects: top, netPerMonth: overallNetPerMonth, netTotal: overallNetTotal };
  }, [data, filteredRows, visibleMonths]);

  if (data === null) {
    return (
      <WidgetShell icon={<TableProperties size={14} />} title="Зведена таблиця">
        <div className="flex h-full items-center justify-center text-[12px]" style={{ color: T.textMuted }}>
          Доступ обмежений роллю
        </div>
      </WidgetShell>
    );
  }

  const balanceColor = netTotal >= 0 ? T.success : T.danger;

  return (
    <WidgetShell
      icon={<TableProperties size={14} />}
      title="Зведена таблиця"
      subtitle={data ? `${visibleMonths.length} міс. · ${filteredRows.length} рядків` : "Завантаження…"}
      accent={balanceColor}
      action={{ href: buildLink(filters), label: "Відкрити" }}
    >
      <div className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-1">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1">
          <FilterPill active={filters.scope === "ALL"} onClick={() => patch({ scope: "ALL" })}>
            Усі
          </FilterPill>
          <FilterPill active={filters.scope === "SALARY"} onClick={() => patch({ scope: "SALARY" })}>
            ЗП
          </FilterPill>
          <FilterPill active={filters.scope === "GENERAL_EXPENSES"} onClick={() => patch({ scope: "GENERAL_EXPENSES" })}>
            Загальні
          </FilterPill>
          <FilterPill active={filters.scope === "PROJECTS_ONLY"} onClick={() => patch({ scope: "PROJECTS_ONLY" })}>
            Проєкти
          </FilterPill>
          <span className="mx-1 h-3 w-px" style={{ background: T.borderSoft }} />
          <FilterPill active={filters.kind === "ALL"} onClick={() => patch({ kind: "ALL" })}>
            План+Факт
          </FilterPill>
          <FilterPill active={filters.kind === "PLAN"} onClick={() => patch({ kind: "PLAN" })}>
            План
          </FilterPill>
          <FilterPill active={filters.kind === "FACT"} onClick={() => patch({ kind: "FACT" })}>
            Факт
          </FilterPill>
          <span className="mx-1 h-3 w-px" style={{ background: T.borderSoft }} />
          {([3, 6, 12] as const).map((m) => (
            <FilterPill
              key={m}
              active={filters.months === m}
              onClick={() => patch({ months: m })}
            >
              {m}м
            </FilterPill>
          ))}
        </div>

        {(isLoading || !data) && (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
            <Loader2 size={14} className="animate-spin" /> Завантаження…
          </div>
        )}

        {error && !data && (
          <div className="flex flex-1 items-center justify-center text-[12px]" style={{ color: T.danger }}>
            Не вдалося завантажити
          </div>
        )}

        {data && (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr style={{ background: T.panelSoft }}>
                <th
                  className="px-2 py-1.5 text-left font-semibold"
                  style={{ color: T.textSecondary, borderBottom: `1px solid ${T.borderSoft}` }}
                >
                  Проєкт
                </th>
                {visibleMonths.map((m) => (
                  <th
                    key={m}
                    className="px-2 py-1.5 text-right font-semibold whitespace-nowrap"
                    style={{ color: T.textSecondary, borderBottom: `1px solid ${T.borderSoft}` }}
                  >
                    {formatMonthHeader(m)}
                  </th>
                ))}
                <th
                  className="px-2 py-1.5 text-right font-semibold"
                  style={{ color: T.textSecondary, borderBottom: `1px solid ${T.borderSoft}` }}
                >
                  Σ
                </th>
              </tr>
            </thead>
            <tbody>
              {topProjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleMonths.length + 2}
                    className="px-2 py-4 text-center"
                    style={{ color: T.textMuted }}
                  >
                    Немає даних
                  </td>
                </tr>
              ) : (
                topProjects.map((p, idx) => (
                  <tr
                    key={idx}
                    style={{ borderTop: idx > 0 ? `1px solid ${T.borderSoft}` : undefined }}
                  >
                    <td
                      className="px-2 py-1.5 truncate max-w-[140px]"
                      style={{ color: T.textPrimary }}
                      title={p.title}
                    >
                      {p.title}
                    </td>
                    {visibleMonths.map((m) => {
                      const v = p.netPerMonth[m] ?? 0;
                      const color = v > 0 ? T.success : v < 0 ? T.danger : T.textMuted;
                      return (
                        <td
                          key={m}
                          className="px-2 py-1.5 text-right whitespace-nowrap"
                          style={{ color }}
                        >
                          {v === 0 ? "—" : formatCurrencyCompact(v)}
                        </td>
                      );
                    })}
                    <td
                      className="px-2 py-1.5 text-right font-semibold whitespace-nowrap"
                      style={{ color: p.net >= 0 ? T.success : T.danger }}
                    >
                      {formatCurrencyCompact(p.net)}
                    </td>
                  </tr>
                ))
              )}
              <tr style={{ borderTop: `2px solid ${T.borderStrong}`, background: T.accentPrimarySoft }}>
                <td
                  className="px-2 py-1.5 font-bold uppercase"
                  style={{ color: T.accentPrimary, fontSize: 10, letterSpacing: 0.5 }}
                >
                  Чистий
                </td>
                {visibleMonths.map((m) => {
                  const v = netPerMonth[m] ?? 0;
                  const color = v > 0 ? T.success : v < 0 ? T.danger : T.textMuted;
                  return (
                    <td
                      key={m}
                      className="px-2 py-1.5 text-right font-bold whitespace-nowrap"
                      style={{ color }}
                    >
                      {v === 0 ? "—" : formatCurrencyCompact(v)}
                    </td>
                  );
                })}
                <td
                  className="px-2 py-1.5 text-right font-bold whitespace-nowrap"
                  style={{ color: balanceColor }}
                >
                  {formatCurrencyCompact(netTotal)}
                </td>
              </tr>
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
