"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Loader2, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, isSameDay, isWithinInterval, addDays } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import type { FinanceEntryDTO } from "./types";

type ViewMode = "day" | "week" | "month";

export function TabCalendar({
  entries,
  loading,
}: {
  entries: FinanceEntryDTO[];
  loading: boolean;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");

  const planEntries = useMemo(
    () => entries.filter((e) => e.kind === "PLAN"),
    [entries]
  );

  const now = new Date();

  const timeline = useMemo(() => {
    if (planEntries.length === 0) return [];

    const dates = planEntries.map((e) => new Date(e.occurredAt));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    // Extend range: at least show 30 days
    const end = maxDate > addDays(now, 30) ? maxDate : addDays(now, 30);
    const start = minDate < now ? minDate : now;

    if (viewMode === "day") {
      const days = eachDayOfInterval({ start, end });
      return days.map((day) => {
        const dayEntries = planEntries.filter((e) => isSameDay(new Date(e.occurredAt), day));
        const income = dayEntries.filter((e) => e.type === "INCOME").reduce((s, e) => s + Number(e.amount), 0);
        const expense = dayEntries.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + Number(e.amount), 0);
        const isPast = day < now;
        return {
          label: format(day, "dd.MM", { locale: uk }),
          sublabel: format(day, "EEE", { locale: uk }),
          income,
          expense,
          net: income - expense,
          entries: dayEntries,
          isPast,
        };
      });
    }

    if (viewMode === "week") {
      const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      return weeks.map((weekStart) => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const weekEntries = planEntries.filter((e) => {
          const d = new Date(e.occurredAt);
          return isWithinInterval(d, { start: weekStart, end: weekEnd });
        });
        const income = weekEntries.filter((e) => e.type === "INCOME").reduce((s, e) => s + Number(e.amount), 0);
        const expense = weekEntries.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + Number(e.amount), 0);
        const isPast = weekEnd < now;
        return {
          label: `${format(weekStart, "dd.MM")} — ${format(weekEnd, "dd.MM")}`,
          sublabel: "",
          income,
          expense,
          net: income - expense,
          entries: weekEntries,
          isPast,
        };
      });
    }

    // month
    const months: { label: string; sublabel: string; income: number; expense: number; net: number; entries: FinanceEntryDTO[]; isPast: boolean }[] = [];
    let cursor = startOfMonth(start);
    while (cursor <= end) {
      const mStart = startOfMonth(cursor);
      const mEnd = endOfMonth(cursor);
      const monthEntries = planEntries.filter((e) => {
        const d = new Date(e.occurredAt);
        return isWithinInterval(d, { start: mStart, end: mEnd });
      });
      const income = monthEntries.filter((e) => e.type === "INCOME").reduce((s, e) => s + Number(e.amount), 0);
      const expense = monthEntries.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + Number(e.amount), 0);
      months.push({
        label: format(cursor, "LLLL yyyy", { locale: uk }),
        sublabel: "",
        income,
        expense,
        net: income - expense,
        entries: monthEntries,
        isPast: mEnd < now,
      });
      cursor = addDays(mEnd, 1);
    }
    return months;
  }, [planEntries, viewMode, now]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* View mode switcher */}
      <div className="flex items-center gap-2">
        <CalendarDays size={14} style={{ color: T.textMuted }} />
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          ПЛАТІЖНИЙ КАЛЕНДАР (ПЛАНОВІ ОПЕРАЦІЇ)
        </span>
        <div className="ml-auto flex gap-1">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: viewMode === mode ? T.accentPrimarySoft : T.panelSoft,
                color: viewMode === mode ? T.accentPrimary : T.textMuted,
                border: `1px solid ${viewMode === mode ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {mode === "day" ? "День" : mode === "week" ? "Тиждень" : "Місяць"}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {planEntries.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <CalendarDays size={32} style={{ color: T.textMuted }} />
          <span className="text-[13px]" style={{ color: T.textMuted }}>
            Немає планових операцій для відображення
          </span>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="max-h-[600px] overflow-y-auto">
            {timeline.map((period, i) => {
              const hasEntries = period.income > 0 || period.expense > 0;
              return (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b px-4 py-3"
                  style={{
                    borderColor: T.borderSoft,
                    backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                    opacity: period.isPast ? 0.6 : 1,
                    borderLeft: period.isPast && hasEntries
                      ? `3px solid ${T.danger}`
                      : "3px solid transparent",
                  }}
                >
                  <div className="w-32 flex-shrink-0">
                    <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                      {period.label}
                    </span>
                    {period.sublabel && (
                      <span className="text-[10px] ml-1" style={{ color: T.textMuted }}>
                        {period.sublabel}
                      </span>
                    )}
                  </div>

                  {hasEntries ? (
                    <>
                      <div className="flex items-center gap-1.5 w-28">
                        <TrendingUp size={11} style={{ color: T.success }} />
                        <span className="text-[11px] font-semibold" style={{ color: T.success }}>
                          +{formatCurrency(period.income)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 w-28">
                        <TrendingDown size={11} style={{ color: T.danger }} />
                        <span className="text-[11px] font-semibold" style={{ color: T.danger }}>
                          −{formatCurrency(period.expense)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 w-28">
                        <span
                          className="text-[12px] font-bold"
                          style={{ color: period.net >= 0 ? T.success : T.danger }}
                        >
                          {period.net >= 0 ? "+" : ""}
                          {formatCurrency(period.net)}
                        </span>
                        {period.net < 0 && (
                          <span title="Касовий розрив"><AlertTriangle size={11} style={{ color: T.warning }} /></span>
                        )}
                      </div>
                      <div className="flex-1 text-right">
                        <span className="text-[10px]" style={{ color: T.textMuted }}>
                          {period.entries.length} оп.
                        </span>
                        {period.isPast && (
                          <span className="ml-2 text-[9px] font-bold" style={{ color: T.danger }}>
                            МИНУЛО
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
