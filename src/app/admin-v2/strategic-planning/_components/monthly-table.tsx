"use client";

import { Fragment, useMemo } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import type {
  ForecastResult,
  ForecastRow,
  RowKind,
} from "@/lib/strategic-planning/types";

const KIND_LABEL: Record<RowKind, string> = {
  PROJECT: "Проєкти",
  STAFF: "Співробітники",
  TEMPLATE: "Постійні витрати",
  CUSTOM: "Власні",
};

const KIND_ORDER: RowKind[] = ["PROJECT", "STAFF", "TEMPLATE", "CUSTOM"];

export function MonthlyTable({ forecast }: { forecast: ForecastResult }) {
  const grouped = useMemo(() => {
    const map = new Map<RowKind, ForecastRow[]>();
    for (const row of forecast.rows) {
      const arr = map.get(row.kind) ?? [];
      arr.push(row);
      map.set(row.kind, arr);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      rows: map.get(k) ?? [],
    }));
  }, [forecast.rows]);

  if (forecast.months.length === 0) return null;

  const colCount = forecast.months.length;

  return (
    <Card className="overflow-hidden border-0 shadow-sm" style={{ background: T.panel }}>
      <div className="flex items-center justify-between p-4 pb-2">
        <h2
          className="text-sm font-semibold"
          style={{ color: T.textPrimary }}
        >
          Помісячна деталізація
        </h2>
        <span
          className="text-xs"
          style={{ color: T.textMuted }}
        >
          {forecast.rows.length} рядків · {colCount} місяців
        </span>
      </div>

      {forecast.rows.length === 0 ? (
        <div
          className="px-6 pb-6 text-sm"
          style={{ color: T.textMuted }}
        >
          Поки нічого не обрано. Постав галочки, щоб побачити прогноз.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: T.borderSoft }}
              >
                <th
                  className="sticky left-0 z-10 px-4 py-2 text-left font-semibold"
                  style={{ background: T.panel, color: T.textMuted }}
                >
                  Стаття
                </th>
                {forecast.months.map((m) => (
                  <th
                    key={m.toISOString()}
                    className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                    style={{ color: T.textMuted }}
                  >
                    {format(m, "LLL ’yy", { locale: uk })}
                  </th>
                ))}
                <th
                  className="px-3 py-2 text-right font-semibold"
                  style={{ color: T.textMuted }}
                >
                  Усього
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <Fragment key={group.kind}>
                  <tr>
                    <td
                      colSpan={colCount + 2}
                      className="bg-muted/30 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: T.textMuted }}
                    >
                      {KIND_LABEL[group.kind]}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b"
                      style={{ borderColor: T.borderSoft }}
                    >
                      <td
                        className="sticky left-0 z-10 max-w-[240px] truncate px-4 py-2"
                        style={{ background: T.panel, color: T.textPrimary }}
                        title={row.label}
                      >
                        <span
                          className="mr-1 inline-block h-2 w-2 rounded-full"
                          style={{
                            background:
                              row.type === "INCOME" ? T.success : T.danger,
                          }}
                        />
                        {row.label}
                      </td>
                      {row.monthly.map((v, i) => (
                        <td
                          key={i}
                          className="whitespace-nowrap px-3 py-2 text-right"
                          style={{
                            color: v === 0 ? T.textMuted : T.textPrimary,
                          }}
                        >
                          {v === 0 ? "—" : formatCurrencyCompact(v)}
                        </td>
                      ))}
                      <td
                        className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {formatCurrencyCompact(row.total)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}

              {/* Totals */}
              <tr
                className="border-t-2"
                style={{ borderColor: T.borderStrong }}
              >
                <td
                  className="sticky left-0 z-10 px-4 py-2 text-xs font-bold"
                  style={{ background: T.panel, color: T.success }}
                >
                  Σ Дохід
                </td>
                {forecast.totals.incomeByMonth.map((v, i) => (
                  <td
                    key={i}
                    className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                    style={{ color: T.success }}
                  >
                    {formatCurrencyCompact(v)}
                  </td>
                ))}
                <td
                  className="whitespace-nowrap px-3 py-2 text-right font-bold"
                  style={{ color: T.success }}
                >
                  {formatCurrency(forecast.summary.totalIncome)}
                </td>
              </tr>
              <tr
                className="border-b"
                style={{ borderColor: T.borderSoft }}
              >
                <td
                  className="sticky left-0 z-10 px-4 py-2 text-xs font-bold"
                  style={{ background: T.panel, color: T.danger }}
                >
                  Σ Витрати
                </td>
                {forecast.totals.expenseByMonth.map((v, i) => (
                  <td
                    key={i}
                    className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                    style={{ color: T.danger }}
                  >
                    {formatCurrencyCompact(v)}
                  </td>
                ))}
                <td
                  className="whitespace-nowrap px-3 py-2 text-right font-bold"
                  style={{ color: T.danger }}
                >
                  {formatCurrency(forecast.summary.totalExpense)}
                </td>
              </tr>
              <tr
                className="border-b"
                style={{ borderColor: T.borderSoft }}
              >
                <td
                  className="sticky left-0 z-10 px-4 py-2 text-xs font-bold"
                  style={{ background: T.panel, color: T.textPrimary }}
                >
                  Net
                </td>
                {forecast.totals.netByMonth.map((v, i) => (
                  <td
                    key={i}
                    className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                    style={{
                      color: v >= 0 ? T.success : T.danger,
                    }}
                  >
                    {formatCurrencyCompact(v)}
                  </td>
                ))}
                <td
                  className="whitespace-nowrap px-3 py-2 text-right font-bold"
                  style={{
                    color:
                      forecast.summary.netPL >= 0 ? T.success : T.danger,
                  }}
                >
                  {formatCurrency(forecast.summary.netPL)}
                </td>
              </tr>
              <tr style={{ background: T.panelSoft }}>
                <td
                  className="sticky left-0 z-10 px-4 py-2 text-xs font-bold"
                  style={{ background: T.panelSoft, color: T.accentPrimary }}
                >
                  Накопич. баланс
                </td>
                {forecast.totals.runningBalance.map((v, i) => (
                  <td
                    key={i}
                    className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                    style={{
                      color: v >= 0 ? T.accentPrimary : T.danger,
                    }}
                  >
                    {formatCurrencyCompact(v)}
                  </td>
                ))}
                <td
                  className="whitespace-nowrap px-3 py-2 text-right"
                  style={{ color: T.textMuted }}
                >
                  —
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
