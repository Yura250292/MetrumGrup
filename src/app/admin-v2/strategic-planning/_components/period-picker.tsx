"use client";

import { addMonths, format, startOfMonth } from "date-fns";
import { uk } from "date-fns/locale";
import { Calendar, Wallet } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Card, CardContent } from "@/components/ui/card";
import type { Period } from "@/lib/strategic-planning/types";

const DURATION_PRESETS = [3, 6, 9, 12, 18, 24];

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
      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:gap-6">
        {/* Start month */}
        <div className="flex flex-col gap-1.5">
          <label
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            <Calendar className="h-3.5 w-3.5" />
            Початок
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleStartMonthShift(-1)}
              className="rounded-lg border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
              style={{ borderColor: T.borderSoft, color: T.textPrimary }}
              aria-label="Попередній місяць"
            >
              ‹
            </button>
            <input
              type="month"
              value={startInputValue}
              onChange={(e) => handleStartMonthInput(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{
                borderColor: T.borderSoft,
                color: T.textPrimary,
                background: T.panel,
              }}
            />
            <button
              type="button"
              onClick={() => handleStartMonthShift(1)}
              className="rounded-lg border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
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
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Горизонт
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_PRESETS.map((m) => {
              const isActive = period.durationMonths === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    onPeriodChange({ ...period, durationMonths: m })
                  }
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-all"
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
              className="w-16 rounded-lg border px-2 py-1.5 text-sm"
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
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            <Wallet className="h-3.5 w-3.5" />
            Поточний баланс (₴)
          </label>
          <input
            type="number"
            value={openingBalance || ""}
            onChange={(e) => onOpeningBalanceChange(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-44 rounded-lg border px-3 py-1.5 text-right text-sm font-medium"
            style={{
              borderColor: T.borderSoft,
              color: T.textPrimary,
              background: T.panel,
            }}
          />
        </div>

        {/* Range hint */}
        <div
          className="hidden text-xs md:block md:self-center"
          style={{ color: T.textMuted }}
        >
          {format(start, "LLLL yyyy", { locale: uk })} →{" "}
          {format(endMonth, "LLLL yyyy", { locale: uk })}
        </div>
      </CardContent>
    </Card>
  );
}
