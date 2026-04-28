"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import type { ForecastResult } from "@/lib/strategic-planning/types";

type View = "stacked" | "balance";

export function CashflowChart({ forecast }: { forecast: ForecastResult }) {
  const [view, setView] = useState<View>("stacked");

  const data = useMemo(() => {
    return forecast.months.map((m, i) => ({
      label: format(m, "LLL ’yy", { locale: uk }),
      income: Math.round(forecast.totals.incomeByMonth[i]),
      expense: Math.round(forecast.totals.expenseByMonth[i]),
      net: Math.round(forecast.totals.netByMonth[i]),
      balance: Math.round(forecast.totals.runningBalance[i]),
    }));
  }, [forecast]);

  if (data.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm" style={{ background: T.panel }}>
      <div className="flex flex-col gap-2 p-3 pb-1 sm:flex-row sm:items-center sm:justify-between md:p-4 md:pb-2">
        <h2
          className="text-sm font-semibold"
          style={{ color: T.textPrimary }}
        >
          Помісячний cashflow
        </h2>
        <div className="flex gap-1">
          {(
            [
              {
                id: "stacked",
                label: "Дохід / витрати",
                short: "Доходи / витрати",
              },
              {
                id: "balance",
                label: "Накопичений баланс",
                short: "Баланс",
              },
            ] as const
          ).map((v) => {
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className="h-9 flex-1 rounded-lg border px-3 text-xs font-medium transition-all sm:flex-none"
                style={{
                  borderColor: isActive ? T.accentPrimary : T.borderSoft,
                  background: isActive ? T.accentPrimarySoft : "transparent",
                  color: isActive ? T.accentPrimary : T.textSecondary,
                }}
              >
                <span className="hidden md:inline">{v.label}</span>
                <span className="md:hidden">{v.short}</span>
              </button>
            );
          })}
        </div>
      </div>
      <CardContent className="p-2">
        <div className="h-56 w-full md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            {view === "stacked" ? (
              <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderSoft} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: T.textMuted }}
                />
                <YAxis
                  tickFormatter={(v) => formatCurrencyCompact(v)}
                  tick={{ fontSize: 11, fill: T.textMuted }}
                  width={70}
                />
                <Tooltip
                  formatter={(value) =>
                    formatCurrencyCompact(Number(value))
                  }
                  contentStyle={{
                    background: T.panel,
                    border: `1px solid ${T.borderSoft}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar
                  dataKey="income"
                  name="Дохід"
                  fill={T.success}
                  fillOpacity={0.85}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expense"
                  name="Витрати"
                  fill={T.danger}
                  fillOpacity={0.85}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net"
                  stroke={T.accentPrimary}
                  strokeWidth={2}
                  dot={{ r: 3, fill: T.accentPrimary }}
                />
              </ComposedChart>
            ) : (
              <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.accentPrimary} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={T.accentPrimary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderSoft} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: T.textMuted }}
                />
                <YAxis
                  tickFormatter={(v) => formatCurrencyCompact(v)}
                  tick={{ fontSize: 11, fill: T.textMuted }}
                  width={70}
                />
                <Tooltip
                  formatter={(value) =>
                    formatCurrencyCompact(Number(value))
                  }
                  contentStyle={{
                    background: T.panel,
                    border: `1px solid ${T.borderSoft}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name="Баланс"
                  stroke={T.accentPrimary}
                  strokeWidth={2}
                  fill="url(#balanceFill)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
