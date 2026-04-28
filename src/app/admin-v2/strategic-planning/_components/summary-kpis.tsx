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
import { formatCurrency } from "@/lib/utils";
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
    sub?: string;
    icon: React.ReactNode;
    color: string;
    background: string;
  }> = [
    {
      label: "Загальний дохід",
      value: formatCurrency(summary.totalIncome),
      sub: `за ${months.length} міс`,
      icon: <ArrowUpRight className="h-5 w-5" />,
      color: T.success,
      background: T.successSoft,
    },
    {
      label: "Загальні витрати",
      value: formatCurrency(summary.totalExpense),
      sub: `за ${months.length} міс`,
      icon: <ArrowDownRight className="h-5 w-5" />,
      color: T.danger,
      background: T.dangerSoft,
    },
    {
      label: "Net P&L",
      value: formatCurrency(summary.netPL),
      sub:
        summary.netPL >= 0
          ? "прибуток за період"
          : "збиток за період",
      icon: <Wallet className="h-5 w-5" />,
      color: summary.netPL >= 0 ? T.accentPrimary : T.danger,
      background:
        summary.netPL >= 0 ? T.accentPrimarySoft : T.dangerSoft,
    },
    {
      label: isWarning ? "Касовий розрив!" : "Мінімальний баланс",
      value: formatCurrency(summary.minBalance),
      sub: minBalanceMonth
        ? `у ${format(minBalanceMonth, "LLLL yyyy", { locale: uk })}`
        : "—",
      icon: isWarning ? (
        <AlertTriangle className="h-5 w-5" />
      ) : (
        <Wallet className="h-5 w-5" />
      ),
      color: isWarning ? T.danger : T.teal,
      background: isWarning ? T.dangerSoft : T.tealSoft,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className="border-0 p-4 shadow-sm"
          style={{ background: T.panel }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                {tile.label}
              </span>
              <span
                className="text-xl font-bold tracking-tight md:text-2xl"
                style={{ color: T.textPrimary }}
              >
                {tile.value}
              </span>
              {tile.sub && (
                <span
                  className="text-xs"
                  style={{ color: T.textMuted }}
                >
                  {tile.sub}
                </span>
              )}
            </div>
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: tile.background, color: tile.color }}
            >
              {tile.icon}
            </div>
          </div>
        </Card>
      ))}
      {/* Opening + Final balance summary chip */}
      <Card
        className="col-span-2 border-0 p-4 shadow-sm lg:col-span-4"
        style={{ background: T.panelSoft }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span style={{ color: T.textMuted }}>
            Стартовий баланс:{" "}
            <span
              className="font-semibold"
              style={{ color: T.textPrimary }}
            >
              {formatCurrency(openingBalance)}
            </span>
          </span>
          <span style={{ color: T.textMuted }}>
            Кінцевий баланс наприкінці горизонту:{" "}
            <span
              className="font-bold"
              style={{
                color: finalBalance >= 0 ? T.success : T.danger,
              }}
            >
              {formatCurrency(finalBalance)}
            </span>
          </span>
        </div>
      </Card>
    </div>
  );
}
