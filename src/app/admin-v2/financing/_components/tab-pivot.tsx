"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Download, RefreshCw } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import type { FinancingFilters } from "./types";

type PivotKindMode = "ALL" | "PLAN" | "FACT";

type PivotRow = {
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
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

const MONTH_LABELS_UK = [
  "Січ", "Лют", "Бер", "Кві", "Тра", "Чер",
  "Лип", "Сер", "Вер", "Жов", "Лис", "Гру",
];

function formatMonthHeader(key: string): string {
  const [yearStr, monthStr] = key.split("-");
  const m = Number(monthStr) - 1;
  const label = MONTH_LABELS_UK[m] ?? monthStr;
  return `${label} ${yearStr.slice(2)}`;
}

function categoryLabel(cat: string): string {
  return FINANCE_CATEGORY_LABELS[cat] ?? cat;
}

function buildCsv(data: PivotResponse): string {
  const headers = ["Тип", "Категорія", "Субкатегорія", ...data.months.map(formatMonthHeader), "Σ"];
  const lines: string[] = [headers.join(",")];

  const incomeRows = data.rows.filter((r) => r.type === "INCOME");
  const expenseRows = data.rows.filter((r) => r.type === "EXPENSE");

  for (const r of incomeRows) {
    lines.push(
      [
        "Дохід",
        categoryLabel(r.category),
        r.subcategory ?? "",
        ...data.months.map((m) => String(r.perMonth[m] ?? 0)),
        String(r.total),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  lines.push(
    ["Σ Доходи", "", "", ...data.months.map((m) => String(data.totals.income.perMonth[m] ?? 0)), String(data.totals.income.total)]
      .map(csvEscape)
      .join(","),
  );

  for (const r of expenseRows) {
    lines.push(
      [
        "Витрата",
        categoryLabel(r.category),
        r.subcategory ?? "",
        ...data.months.map((m) => String(r.perMonth[m] ?? 0)),
        String(r.total),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  lines.push(
    ["Σ Витрати", "", "", ...data.months.map((m) => String(data.totals.expense.perMonth[m] ?? 0)), String(data.totals.expense.total)]
      .map(csvEscape)
      .join(","),
  );
  lines.push(
    ["Чистий прибуток", "", "", ...data.months.map((m) => String(data.totals.net.perMonth[m] ?? 0)), String(data.totals.net.total)]
      .map(csvEscape)
      .join(","),
  );

  return lines.join("\n");
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes("\"") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function TabPivot({
  scope,
  filters,
}: {
  scope?: { id: string; title: string };
  filters: FinancingFilters;
}) {
  const [kindMode, setKindMode] = useState<PivotKindMode>("ALL");
  const [data, setData] = useState<PivotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();

    if (scope) {
      p.set("projectId", scope.id);
    } else if (filters.projectId) {
      p.set("projectId", filters.projectId);
    }

    if (filters.folderId) p.set("folderId", filters.folderId);

    if (filters.from) p.set("from", new Date(filters.from).toISOString());
    if (filters.to) {
      const d = new Date(filters.to);
      d.setHours(23, 59, 59, 999);
      p.set("to", d.toISOString());
    }

    if (filters.archived) p.set("archived", "true");

    if (kindMode !== "ALL") p.set("kind", kindMode);

    return p.toString();
  }, [scope, filters, kindMode]);

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

  const incomeRows = useMemo(
    () => (data ? data.rows.filter((r) => r.type === "INCOME") : []),
    [data],
  );
  const expenseRows = useMemo(
    () => (data ? data.rows.filter((r) => r.type === "EXPENSE") : []),
    [data],
  );

  function handleExportCsv() {
    if (!data) return;
    const csv = buildCsv(data);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fromTag = data.range.from.slice(0, 10);
    const toTag = data.range.to.slice(0, 10);
    a.href = url;
    a.download = `pivot-${fromTag}-${toTag}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: T.borderSoft, background: T.panel }}>
          {(["ALL", "PLAN", "FACT"] as PivotKindMode[]).map((mode) => {
            const active = kindMode === mode;
            const label = mode === "ALL" ? "Усі" : mode === "PLAN" ? "Тільки План" : "Тільки Факт";
            return (
              <button
                key={mode}
                onClick={() => setKindMode(mode)}
                className="rounded-md px-3 py-1.5 text-sm font-medium transition"
                style={{
                  background: active ? T.accentPrimary : "transparent",
                  color: active ? "#fff" : T.textSecondary,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleExportCsv}
          disabled={!data || loading}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
          style={{ borderColor: T.borderSoft, color: T.textPrimary, background: T.panel }}
        >
          <Download size={14} /> CSV
        </button>
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

      {data && data.rows.length === 0 && !loading && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border p-12 text-sm"
          style={{ borderColor: T.borderSoft, color: T.textSecondary, background: T.panel }}
        >
          <RefreshCw size={20} />
          <div>Немає даних за обраний період</div>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div
          className="overflow-x-auto rounded-lg border"
          style={{ borderColor: T.borderSoft, background: T.panel }}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ background: T.panelSoft }}>
                <th
                  className="sticky left-0 z-10 px-3 py-2 text-left font-semibold"
                  style={{
                    background: T.panelSoft,
                    color: T.textPrimary,
                    borderBottom: `1px solid ${T.borderSoft}`,
                    minWidth: 220,
                  }}
                >
                  Категорія
                </th>
                {data.months.map((m) => (
                  <th
                    key={m}
                    className="px-3 py-2 text-right font-semibold whitespace-nowrap"
                    style={{ color: T.textPrimary, borderBottom: `1px solid ${T.borderSoft}`, minWidth: 90 }}
                  >
                    {formatMonthHeader(m)}
                  </th>
                ))}
                <th
                  className="px-3 py-2 text-right font-semibold whitespace-nowrap"
                  style={{ color: T.textPrimary, borderBottom: `1px solid ${T.borderSoft}`, minWidth: 110 }}
                >
                  Σ
                </th>
              </tr>
            </thead>

            <tbody>
              {/* INCOME group */}
              <tr style={{ background: T.successSoft }}>
                <td
                  className="sticky left-0 z-10 px-3 py-2 font-bold uppercase"
                  style={{ background: T.successSoft, color: T.success, fontSize: 12, letterSpacing: 0.5 }}
                >
                  ДОХОДИ
                </td>
                {data.months.map((m) => (
                  <td key={m} className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: T.success }}>
                    {formatCurrency(data.totals.income.perMonth[m] ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-bold whitespace-nowrap" style={{ color: T.success }}>
                  {formatCurrency(data.totals.income.total)}
                </td>
              </tr>
              {incomeRows.map((r, idx) => (
                <tr key={`in-${idx}`} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                  <td
                    className="sticky left-0 z-10 px-3 py-2"
                    style={{ background: T.panel, color: T.textPrimary }}
                  >
                    <span className="pl-3">{categoryLabel(r.category)}</span>
                    {r.subcategory && (
                      <span className="ml-1" style={{ color: T.textMuted }}>
                        / {r.subcategory}
                      </span>
                    )}
                  </td>
                  {data.months.map((m) => {
                    const v = r.perMonth[m] ?? 0;
                    return (
                      <td key={m} className="px-3 py-2 text-right whitespace-nowrap" style={{ color: v > 0 ? T.success : T.textMuted }}>
                        {v === 0 ? "—" : formatCurrency(v)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: T.success }}>
                    {formatCurrency(r.total)}
                  </td>
                </tr>
              ))}

              {/* EXPENSE group */}
              <tr style={{ background: T.dangerSoft }}>
                <td
                  className="sticky left-0 z-10 px-3 py-2 font-bold uppercase"
                  style={{ background: T.dangerSoft, color: T.danger, fontSize: 12, letterSpacing: 0.5, borderTop: `2px solid ${T.borderSoft}` }}
                >
                  ВИТРАТИ
                </td>
                {data.months.map((m) => (
                  <td
                    key={m}
                    className="px-3 py-2 text-right font-semibold whitespace-nowrap"
                    style={{ color: T.danger, borderTop: `2px solid ${T.borderSoft}` }}
                  >
                    −{formatCurrency(data.totals.expense.perMonth[m] ?? 0)}
                  </td>
                ))}
                <td
                  className="px-3 py-2 text-right font-bold whitespace-nowrap"
                  style={{ color: T.danger, borderTop: `2px solid ${T.borderSoft}` }}
                >
                  −{formatCurrency(data.totals.expense.total)}
                </td>
              </tr>
              {expenseRows.map((r, idx) => (
                <tr key={`ex-${idx}`} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                  <td
                    className="sticky left-0 z-10 px-3 py-2"
                    style={{ background: T.panel, color: T.textPrimary }}
                  >
                    <span className="pl-3">{categoryLabel(r.category)}</span>
                    {r.subcategory && (
                      <span className="ml-1" style={{ color: T.textMuted }}>
                        / {r.subcategory}
                      </span>
                    )}
                  </td>
                  {data.months.map((m) => {
                    const v = r.perMonth[m] ?? 0;
                    return (
                      <td key={m} className="px-3 py-2 text-right whitespace-nowrap" style={{ color: v > 0 ? T.danger : T.textMuted }}>
                        {v === 0 ? "—" : `−${formatCurrency(v)}`}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: T.danger }}>
                    −{formatCurrency(r.total)}
                  </td>
                </tr>
              ))}

              {/* NET row */}
              <tr style={{ background: T.accentPrimarySoft, borderTop: `2px solid ${T.borderStrong}` }}>
                <td
                  className="sticky left-0 z-10 px-3 py-2 font-bold uppercase"
                  style={{ background: T.accentPrimarySoft, color: T.accentPrimary, fontSize: 12, letterSpacing: 0.5 }}
                >
                  Чистий прибуток
                </td>
                {data.months.map((m) => {
                  const v = data.totals.net.perMonth[m] ?? 0;
                  const color = v >= 0 ? T.success : T.danger;
                  const prefix = v >= 0 ? "+" : "−";
                  return (
                    <td key={m} className="px-3 py-2 text-right font-bold whitespace-nowrap" style={{ color }}>
                      {v === 0 ? "—" : `${prefix}${formatCurrency(Math.abs(v))}`}
                    </td>
                  );
                })}
                <td
                  className="px-3 py-2 text-right font-bold whitespace-nowrap"
                  style={{ color: data.totals.net.total >= 0 ? T.success : T.danger }}
                >
                  {(() => {
                    const v = data.totals.net.total;
                    const prefix = v >= 0 ? "+" : "−";
                    return v === 0 ? "—" : `${prefix}${formatCurrency(Math.abs(v))}`;
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="text-xs" style={{ color: T.textMuted }}>
          Період: {data.range.from.slice(0, 10)} — {data.range.to.slice(0, 10)} · {data.months.length} міс. · {data.rows.length} рядків
        </div>
      )}
    </div>
  );
}
