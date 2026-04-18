"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  eachWeekOfInterval,
  endOfWeek,
  isWithinInterval,
  format,
  startOfWeek,
  subDays,
  addDays,
} from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FinanceEntryDTO } from "./types";

type ViewMode = "plan_fact" | "income_expense";

export function CashflowChart({ entries }: { entries: FinanceEntryDTO[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("income_expense");

  const data = useMemo(() => {
    if (entries.length === 0) return [];

    const dates = entries.map((e) => new Date(e.occurredAt).getTime());
    const minDate = subDays(new Date(Math.min(...dates)), 1);
    const maxDate = addDays(new Date(Math.max(...dates)), 1);

    const weeks = eachWeekOfInterval(
      { start: minDate, end: maxDate },
      { weekStartsOn: 1 }
    );

    return weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekEntries = entries.filter((e) =>
        isWithinInterval(new Date(e.occurredAt), { start: weekStart, end: weekEnd })
      );

      const planIncome = weekEntries
        .filter((e) => e.kind === "PLAN" && e.type === "INCOME")
        .reduce((s, e) => s + Number(e.amount), 0);
      const planExpense = weekEntries
        .filter((e) => e.kind === "PLAN" && e.type === "EXPENSE")
        .reduce((s, e) => s + Number(e.amount), 0);
      const factIncome = weekEntries
        .filter((e) => e.kind === "FACT" && e.type === "INCOME")
        .reduce((s, e) => s + Number(e.amount), 0);
      const factExpense = weekEntries
        .filter((e) => e.kind === "FACT" && e.type === "EXPENSE")
        .reduce((s, e) => s + Number(e.amount), 0);

      return {
        label: format(weekStart, "dd.MM", { locale: uk }),
        planIncome,
        planExpense,
        factIncome,
        factExpense,
        income: factIncome + planIncome,
        expense: factExpense + planExpense,
        net: factIncome + planIncome - factExpense - planExpense,
      };
    });
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          ГРОШОВИЙ ПОТІК
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("income_expense")}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
            style={{
              backgroundColor:
                viewMode === "income_expense" ? T.accentPrimarySoft : T.panelSoft,
              color: viewMode === "income_expense" ? T.accentPrimary : T.textMuted,
              border: `1px solid ${viewMode === "income_expense" ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            Доходи / Витрати
          </button>
          <button
            onClick={() => setViewMode("plan_fact")}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
            style={{
              backgroundColor:
                viewMode === "plan_fact" ? T.accentPrimarySoft : T.panelSoft,
              color: viewMode === "plan_fact" ? T.accentPrimary : T.textMuted,
              border: `1px solid ${viewMode === "plan_fact" ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            План / Факт
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--t-text-3)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--t-text-3)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--t-panel)",
                borderColor: "var(--t-border-strong)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value) =>
                new Intl.NumberFormat("uk-UA").format(Number(value)) + " ₴"
              }
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              iconType="circle"
              iconSize={8}
            />
            {viewMode === "income_expense" ? (
              <>
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Доходи"
                  stroke="#16A34A"
                  fill="#16A34A"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="Витрати"
                  stroke="#DC2626"
                  fill="#DC2626"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </>
            ) : (
              <>
                <Area
                  type="monotone"
                  dataKey="planIncome"
                  name="План дохід"
                  stroke="#3B5BFF"
                  fill="#3B5BFF"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
                <Area
                  type="monotone"
                  dataKey="factIncome"
                  name="Факт дохід"
                  stroke="#16A34A"
                  fill="#16A34A"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="planExpense"
                  name="План витрата"
                  stroke="#EA580C"
                  fill="#EA580C"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
                <Area
                  type="monotone"
                  dataKey="factExpense"
                  name="Факт витрата"
                  stroke="#DC2626"
                  fill="#DC2626"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
