"use client";

import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import type { ForecastSummary } from "@/lib/strategic-planning/types";

export function SummaryKpis({
  summary,
  months,
  openingBalance,
}: {
  summary: ForecastSummary;
  months: Date[];
  openingBalance: number;
}) {
  const minBalanceMonth =
    months.length > 0 ? months[summary.minBalanceMonthIndex] : null;
  const isWarning = summary.minBalance < 0;
  const finalBalance = openingBalance + summary.netPL;

  const tiles: Array<{
    label: string;
    value: string;
    fullValue: string;
    sub?: string;
    icon: React.ReactNode;
    color: string;
    background: string;
  }> = [
    {
      label: "Дохід",
      value: formatCurrencyCompact(summary.totalIncome),
      fullValue: formatCurrency(summary.totalIncome),
      sub: `за ${months.length} міс`,
      icon: <ArrowUpRight className="h-4 w-4 md:h-5 md:w-5" />,
      color: T.success,
      background: T.successSoft,
    },
    {
      label: "Витрати",
      value: formatCurrencyCompact(summary.totalExpense),
      fullValue: formatCurrency(summary.totalExpense),
      sub: `за ${months.length} міс`,
      icon: <ArrowDownRight className="h-4 w-4 md:h-5 md:w-5" />,
      color: T.danger,
      background: T.dangerSoft,
    },
    {
      label: "Net P&L",
      value: formatCurrencyCompact(summary.netPL),
      fullValue: formatCurrency(summary.netPL),
      sub:
        summary.netPL >= 0
          ? "прибуток за період"
          : "збиток за період",
      icon: <Wallet className="h-4 w-4 md:h-5 md:w-5" />,
      color: summary.netPL >= 0 ? T.accentPrimary : T.danger,
      background:
        summary.netPL >= 0 ? T.accentPrimarySoft : T.dangerSoft,
    },
    {
      label: isWarning ? "Касовий розрив!" : "Мін. баланс",
      value: formatCurrencyCompact(summary.minBalance),
      fullValue: formatCurrency(summary.minBalance),
      sub: minBalanceMonth
        ? `у ${format(minBalanceMonth, "LLL yyyy", { locale: uk })}`
        : "—",
      icon: isWarning ? (
        <AlertTriangle className="h-4 w-4 md:h-5 md:w-5" />
      ) : (
        <Wallet className="h-4 w-4 md:h-5 md:w-5" />
      ),
      color: isWarning ? T.danger : T.teal,
      background: isWarning ? T.dangerSoft : T.tealSoft,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className="border-0 p-3 shadow-sm md:p-4"
          style={{ background: T.panel }}
          title={tile.fullValue}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span
                className="text-[10px] font-bold uppercase tracking-wider md:text-[11px]"
                style={{ color: T.textMuted }}
              >
                {tile.label}
              </span>
              <span
                className="truncate text-lg font-bold tracking-tight md:text-2xl"
                style={{ color: T.textPrimary }}
              >
                {tile.value}
              </span>
              {tile.sub && (
                <span
                  className="text-[11px] md:text-xs"
                  style={{ color: T.textMuted }}
                >
                  {tile.sub}
                </span>
              )}
            </div>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl md:h-9 md:w-9"
              style={{ background: tile.background, color: tile.color }}
            >
              {tile.icon}
            </div>
          </div>
        </Card>
      ))}
      {/* Opening + Final balance summary chip */}
      <Card
        className="col-span-2 border-0 p-3 shadow-sm md:p-4 lg:col-span-4"
        style={{ background: T.panelSoft }}
      >
        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:text-sm">
          <span style={{ color: T.textMuted }}>
            Старт:{" "}
            <span
              className="font-semibold"
              style={{ color: T.textPrimary }}
            >
              {formatCurrencyCompact(openingBalance)}
            </span>
          </span>
          <span style={{ color: T.textMuted }}>
            Кінець горизонту:{" "}
            <span
              className="font-bold"
              style={{
                color: finalBalance >= 0 ? T.success : T.danger,
              }}
            >
              {formatCurrencyCompact(finalBalance)}
            </span>
          </span>
        </div>
      </Card>
    </div>
  );
}
