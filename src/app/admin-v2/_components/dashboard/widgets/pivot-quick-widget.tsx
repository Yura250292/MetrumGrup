"use client";

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

const MONTH_LABELS_UK = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];

function formatMonthHeader(key: string): string {
  const [yearStr, monthStr] = key.split("-");
  const m = Number(monthStr) - 1;
  return `${MONTH_LABELS_UK[m] ?? monthStr} ${yearStr.slice(2)}`;
}

function lastN<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

export function PivotQuickWidget() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "pivot-quick"],
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      const res = await fetch(`/api/admin/financing/pivot?from=${from}&to=${to}`);
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Помилка");
      return (await res.json()) as PivotResponse;
    },
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  if (data === null) {
    return (
      <WidgetShell icon={<TableProperties size={14} />} title="Зведена таблиця">
        <div className="flex h-full items-center justify-center text-[12px]" style={{ color: T.textMuted }}>
          Доступ обмежений роллю
        </div>
      </WidgetShell>
    );
  }

  if (isLoading || !data) {
    return (
      <WidgetShell icon={<TableProperties size={14} />} title="Зведена таблиця">
        <div className="flex h-full items-center justify-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
          <Loader2 size={14} className="animate-spin" /> Завантаження…
        </div>
      </WidgetShell>
    );
  }

  if (error) {
    return (
      <WidgetShell icon={<TableProperties size={14} />} title="Зведена таблиця">
        <div className="flex h-full items-center justify-center text-[12px]" style={{ color: T.danger }}>
          Не вдалося завантажити
        </div>
      </WidgetShell>
    );
  }

  // Show last 3 months only — compact view
  const visibleMonths = lastN(data.months, 3);
  const netTotal = data.totals.net.total;
  const balanceColor = netTotal >= 0 ? T.success : T.danger;

  // Top 3 projects by absolute net (so dashboard isn't drowned in detail)
  const projectAggregates = new Map<
    string,
    { title: string; net: number; netPerMonth: Record<string, number> }
  >();
  for (const r of data.rows) {
    const key = r.projectId ?? "__none__";
    const title = r.projectTitle ?? "Без проєкту";
    let agg = projectAggregates.get(key);
    if (!agg) {
      agg = { title, net: 0, netPerMonth: Object.fromEntries(visibleMonths.map((m) => [m, 0])) };
      projectAggregates.set(key, agg);
    }
    const sign = r.type === "INCOME" ? 1 : -1;
    agg.net += sign * r.total;
    for (const m of visibleMonths) {
      agg.netPerMonth[m] = (agg.netPerMonth[m] ?? 0) + sign * (r.perMonth[m] ?? 0);
    }
  }
  const topProjects = Array.from(projectAggregates.values())
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .slice(0, 4);

  return (
    <WidgetShell
      icon={<TableProperties size={14} />}
      title="Зведена таблиця"
      subtitle={`${visibleMonths.length} міс. · ${data.rows.length} рядків`}
      accent={balanceColor}
      action={{ href: "/admin-v2/financing?tab=pivot", label: "Відкрити" }}
    >
      <div className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-1">
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
                const v = data.totals.net.perMonth[m] ?? 0;
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
      </div>
    </WidgetShell>
  );
}
