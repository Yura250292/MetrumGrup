"use client";

import { addMonths, format, startOfMonth } from "date-fns";
import { uk } from "date-fns/locale";
import { Calendar, Wallet } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Card, CardContent } from "@/components/ui/card";
import type { Period } from "@/lib/strategic-planning/types";

const DURATION_PRESETS = [3, 6, 12, 18, 24];

export function PeriodPicker({
  period,
  onPeriodChange,
  openingBalance,
  onOpeningBalanceChange,
}: {
  period: Period;
  onPeriodChange: (next: Period) => void;
  openingBalance: number;
  onOpeningBalanceChange: (value: number) => void;
}) {
  const start = new Date(period.startMonth);

  function handleStartMonthShift(delta: number) {
    const next = startOfMonth(addMonths(start, delta));
    onPeriodChange({ ...period, startMonth: next.toISOString() });
  }

  function handleStartMonthInput(value: string) {
    if (!value) return;
    // value like "2026-05"
    const [y, m] = value.split("-").map(Number);
    if (!y || !m) return;
    const date = startOfMonth(new Date(y, m - 1, 1));
    onPeriodChange({ ...period, startMonth: date.toISOString() });
  }

  const startInputValue = format(start, "yyyy-MM");
  const endMonth = startOfMonth(addMonths(start, period.durationMonths - 1));

  return (
    <Card className="border-0 shadow-sm" style={{ background: T.panel }}>
      <CardContent className="grid gap-3 p-3 md:grid-cols-[auto_1fr_auto] md:items-end md:gap-5 md:p-4">
        {/* Start month */}
        <div className="flex flex-col gap-1.5">
          <label
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            <Calendar className="h-3.5 w-3.5" />
            Початок
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleStartMonthShift(-1)}
              className="h-10 rounded-lg border px-3 text-base transition-colors hover:bg-muted"
              style={{ borderColor: T.borderSoft, color: T.textPrimary }}
              aria-label="Попередній місяць"
            >
              ‹
            </button>
            <input
              type="month"
              value={startInputValue}
              onChange={(e) => handleStartMonthInput(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm md:flex-none"
              style={{
                borderColor: T.borderSoft,
                color: T.textPrimary,
                background: T.panel,
              }}
            />
            <button
              type="button"
              onClick={() => handleStartMonthShift(1)}
              className="h-10 rounded-lg border px-3 text-base transition-colors hover:bg-muted"
              style={{ borderColor: T.borderSoft, color: T.textPrimary }}
              aria-label="Наступний місяць"
            >
              ›
            </button>
          </div>
        </div>

        {/* Duration */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Горизонт
          </label>
          <div className="-mx-1 flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible md:pb-0">
            {DURATION_PRESETS.map((m) => {
              const isActive = period.durationMonths === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    onPeriodChange({ ...period, durationMonths: m })
                  }
                  className="h-10 shrink-0 snap-start rounded-lg border px-3 text-sm font-medium transition-all"
                  style={{
                    borderColor: isActive ? T.accentPrimary : T.borderSoft,
                    background: isActive ? T.accentPrimarySoft : "transparent",
                    color: isActive ? T.accentPrimary : T.textPrimary,
                  }}
                >
                  {m} міс
                </button>
              );
            })}
            <input
              type="number"
              min={1}
              max={24}
              value={period.durationMonths}
              onChange={(e) => {
                const v = Math.max(1, Math.min(24, Number(e.target.value) || 1));
                onPeriodChange({ ...period, durationMonths: v });
              }}
              className="h-10 w-16 shrink-0 rounded-lg border px-2 text-sm"
              style={{
                borderColor: T.borderSoft,
                color: T.textPrimary,
                background: T.panel,
              }}
              aria-label="Кількість місяців"
            />
          </div>
        </div>

        {/* Opening balance */}
        <div className="flex flex-col gap-1.5 md:ml-auto">
          <label
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            <Wallet className="h-3.5 w-3.5" />
            Поточний баланс (₴)
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={openingBalance || ""}
            onChange={(e) => onOpeningBalanceChange(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-10 w-full rounded-lg border px-3 text-right text-sm font-medium md:w-44"
            style={{
              borderColor: T.borderSoft,
              color: T.textPrimary,
              background: T.panel,
            }}
          />
        </div>

        {/* Range hint */}
        <div
          className="text-xs md:col-span-3 md:self-center md:text-right"
          style={{ color: T.textMuted }}
        >
          {format(start, "LLLL yyyy", { locale: uk })} →{" "}
          {format(endMonth, "LLLL yyyy", { locale: uk })}
        </div>
      </CardContent>
    </Card>
  );
}
