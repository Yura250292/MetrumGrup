"use client";

import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { DualRadialProgress } from "@/components/ui/RadialProgress";
import type { FinanceSummaryDTO } from "./types";

const safePct = (actual: number, planned: number) =>
  planned <= 0 ? 0 : Math.round((actual / planned) * 100);

export function HeroBalance({ summary }: { summary: FinanceSummaryDTO }) {
  const factBalance = summary.balance;
  const planBalance = summary.plan.income.sum - summary.plan.expense.sum;
  const incomePct = safePct(summary.fact.income.sum, summary.plan.income.sum);
  const expensePct = safePct(summary.fact.expense.sum, summary.plan.expense.sum);
  const balancePositive = factBalance >= 0;

  return (
    <section
      className="rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-md"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 14px -6px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex flex-col sm:flex-row items-stretch gap-5">
        {/* Radial chart */}
        <div className="flex items-center justify-center sm:justify-start flex-shrink-0">
          <DualRadialProgress
            size={144}
            thickness={9}
            gap={5}
            outer={{ value: incomePct, color: T.accentPrimary }}
            inner={{ value: expensePct, color: T.warning }}
            ariaLabel={`Доходи план/факт ${incomePct}%, витрати план/факт ${expensePct}%`}
          >
            <span
              className="text-[9px] font-bold tracking-[0.16em]"
              style={{ color: T.textMuted }}
            >
              ФАКТ БАЛАНС
            </span>
            <span
              className="text-[18px] sm:text-[20px] font-bold"
              style={{ color: balancePositive ? T.success : T.danger }}
            >
              {formatCurrencyCompact(factBalance)}
            </span>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              план {formatCurrencyCompact(planBalance)}
            </span>
          </DualRadialProgress>
        </div>

        {/* Side stats */}
        <div className="flex-1 grid grid-cols-2 gap-3 sm:gap-4 min-w-0">
          <SideRow
            icon={<TrendingUp size={14} />}
            color={T.accentPrimary}
            label="Доходи"
            actual={summary.fact.income.sum}
            planned={summary.plan.income.sum}
            pct={incomePct}
          />
          <SideRow
            icon={<TrendingDown size={14} />}
            color={T.warning}
            label="Витрати"
            actual={summary.fact.expense.sum}
            planned={summary.plan.expense.sum}
            pct={expensePct}
            invert
          />
          <SideRow
            icon={<Wallet size={14} />}
            color={T.success}
            label="Записів"
            actual={summary.count}
            planned={null}
            pct={null}
            asCount
          />
          <SideRow
            icon={<TrendingUp size={14} />}
            color={balancePositive ? T.success : T.danger}
            label="Дельта план→факт"
            actual={factBalance - planBalance}
            planned={null}
            pct={null}
            asDelta
          />
        </div>
      </div>
    </section>
  );
}

function SideRow({
  icon,
  color,
  label,
  actual,
  planned,
  pct,
  invert,
  asCount,
  asDelta,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  actual: number;
  planned: number | null;
  pct: number | null;
  invert?: boolean;
  asCount?: boolean;
  asDelta?: boolean;
}) {
  let mainText: string;
  if (asCount) {
    mainText = String(actual);
  } else if (asDelta) {
    mainText = `${actual >= 0 ? "+" : ""}${formatCurrencyCompact(actual)}`;
  } else {
    mainText = formatCurrencyCompact(actual);
  }

  let pctTone: string = T.textMuted;
  if (pct !== null) {
    if (invert) {
      pctTone = pct > 100 ? T.danger : pct >= 80 ? T.warning : T.success;
    } else {
      pctTone = pct >= 100 ? T.success : pct >= 70 ? T.warning : T.textSecondary;
    }
  }

  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px]" style={{ color: T.textMuted }}>
          {label}
        </div>
        <div
          className="text-[15px] sm:text-base font-semibold truncate"
          style={{ color: T.textPrimary }}
        >
          {mainText}
        </div>
        {planned !== null && pct !== null && (
          <div className="text-[10px] truncate" style={{ color: pctTone }}>
            {pct}% від {formatCurrencyCompact(planned)}
          </div>
        )}
      </div>
    </div>
  );
}
