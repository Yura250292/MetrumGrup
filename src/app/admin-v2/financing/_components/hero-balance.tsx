"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { DualRadialProgress, RadialProgress } from "@/components/ui/RadialProgress";
import type { FinanceSummaryDTO } from "./types";

const pct = (part: number, whole: number) => {
  if (!whole || whole === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
};

export function HeroBalance({ summary }: { summary: FinanceSummaryDTO }) {
  const fi = summary.fact.income.sum;
  const fe = summary.fact.expense.sum;
  const pi = summary.plan.income.sum;
  const pe = summary.plan.expense.sum;

  const factBalance = fi - fe;
  const planBalance = pi - pe;
  const delta = factBalance - planBalance;

  // Ring scaling: each ring pair sized relative to its own max (so larger side = 100%, smaller shows proportion)
  const factMax = Math.max(fi, fe, 1);
  const planMax = Math.max(pi, pe, 1);

  // Delta ring: how close fact balance is to plan balance. |fact| / |plan| × 100, capped at 100.
  const deltaCoverage =
    planBalance === 0 ? (factBalance === 0 ? 100 : 0) : pct(Math.abs(factBalance), Math.abs(planBalance));

  const factPositive = factBalance >= 0;
  const planPositive = planBalance >= 0;
  const deltaPositive = delta >= 0;

  return (
    <section
      className="rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-md"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 14px -6px rgba(0,0,0,0.06)",
      }}
    >
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        {/* Ring 1 — Факт */}
        <RingCard
          title="Факт"
          subtitle="дохід / витрата"
          outerValue={pct(fi, factMax)}
          innerValue={pct(fe, factMax)}
          outerColor={T.success}
          innerColor={T.warning}
          centerLabel="БАЛАНС"
          centerValue={formatCurrencyCompact(factBalance)}
          centerTone={factPositive ? T.success : T.danger}
          legendLeft={{ label: "Дохід", value: formatCurrencyCompact(fi), color: T.success }}
          legendRight={{ label: "Витрата", value: formatCurrencyCompact(fe), color: T.warning }}
        />

        {/* Ring 2 — План */}
        <RingCard
          title="План"
          subtitle="дохід / витрата"
          outerValue={pct(pi, planMax)}
          innerValue={pct(pe, planMax)}
          outerColor={T.accentPrimary}
          innerColor={T.violet}
          centerLabel="БАЛАНС"
          centerValue={formatCurrencyCompact(planBalance)}
          centerTone={planPositive ? T.accentPrimary : T.danger}
          legendLeft={{ label: "Дохід", value: formatCurrencyCompact(pi), color: T.accentPrimary }}
          legendRight={{ label: "Витрата", value: formatCurrencyCompact(pe), color: T.violet }}
        />

        {/* Ring 3 — Дельта план→факт */}
        <DeltaRingCard
          coverage={deltaCoverage}
          delta={delta}
          deltaPositive={deltaPositive}
          factBalance={factBalance}
          planBalance={planBalance}
        />
      </div>
    </section>
  );
}

function RingCard({
  title,
  subtitle,
  outerValue,
  innerValue,
  outerColor,
  innerColor,
  centerLabel,
  centerValue,
  centerTone,
  legendLeft,
  legendRight,
}: {
  title: string;
  subtitle: string;
  outerValue: number;
  innerValue: number;
  outerColor: string;
  innerColor: string;
  centerLabel: string;
  centerValue: string;
  centerTone: string;
  legendLeft: { label: string; value: string; color: string };
  legendRight: { label: string; value: string; color: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 min-w-0">
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          {title}
        </span>
        <span className="text-[10.5px]" style={{ color: T.textMuted }}>
          {subtitle}
        </span>
      </div>

      <DualRadialProgress
        size={140}
        thickness={9}
        gap={5}
        outer={{ value: outerValue, color: outerColor }}
        inner={{ value: innerValue, color: innerColor }}
        ariaLabel={`${title}: ${centerValue}`}
      >
        <span className="text-[9px] font-bold tracking-[0.16em]" style={{ color: T.textMuted }}>
          {centerLabel}
        </span>
        <span className="text-[17px] sm:text-[19px] font-bold" style={{ color: centerTone }}>
          {centerValue}
        </span>
      </DualRadialProgress>

      <LegendRow left={legendLeft} right={legendRight} />
    </div>
  );
}

function DeltaRingCard({
  coverage,
  delta,
  deltaPositive,
  factBalance,
  planBalance,
}: {
  coverage: number;
  delta: number;
  deltaPositive: boolean;
  factBalance: number;
  planBalance: number;
}) {
  const color = deltaPositive ? T.success : T.danger;
  return (
    <div className="flex flex-col items-center gap-3 min-w-0">
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          Дельта
        </span>
        <span className="text-[10.5px]" style={{ color: T.textMuted }}>
          факт vs план
        </span>
      </div>

      <RadialProgress
        size={140}
        thickness={10}
        value={coverage}
        fillColor={color}
        trackColor={`${color}22`}
        ariaLabel={`Дельта: ${formatCurrencyCompact(delta)}`}
      >
        <div className="flex flex-col items-center leading-tight gap-0.5">
          <span
            className="text-[9px] font-bold tracking-[0.16em]"
            style={{ color: T.textMuted }}
          >
            {deltaPositive ? "ПЕРЕВИКОНАННЯ" : "НЕДОВИКОНАННЯ"}
          </span>
          <span className="text-[17px] sm:text-[19px] font-bold" style={{ color }}>
            {delta >= 0 ? "+" : ""}
            {formatCurrencyCompact(delta)}
          </span>
          <span className="text-[9px]" style={{ color: T.textMuted }}>
            покриття {coverage}%
          </span>
        </div>
      </RadialProgress>

      <LegendRow
        left={{ label: "Факт", value: formatCurrencyCompact(factBalance), color: T.success }}
        right={{ label: "План", value: formatCurrencyCompact(planBalance), color: T.accentPrimary }}
      />
    </div>
  );
}

function LegendRow({
  left,
  right,
}: {
  left: { label: string; value: string; color: string };
  right: { label: string; value: string; color: string };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-[220px] text-center">
      <LegendItem {...left} />
      <LegendItem {...right} />
    </div>
  );
}

function LegendItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="flex items-center justify-center gap-1 text-[10.5px]" style={{ color: T.textMuted }}>
        <span
          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span
        className="text-[12.5px] sm:text-[13px] font-semibold truncate"
        style={{ color: T.textPrimary }}
      >
        {value}
      </span>
    </div>
  );
}
