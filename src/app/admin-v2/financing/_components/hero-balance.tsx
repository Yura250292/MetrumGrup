"use client";

import { useEffect, useRef, useState } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { DualRadialProgress, RadialProgress } from "@/components/ui/RadialProgress";
import type { FinanceSummaryDTO } from "./types";

const pct = (part: number, whole: number) => {
  if (!whole || whole === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
};

/** Smoothly tween a number from 0 (or previous value) to `target` over `duration` ms. */
function useCountUp(target: number, duration = 1100, delay = 0) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    fromRef.current = value;
    startRef.current = null;

    const timeout = setTimeout(() => {
      const step = (ts: number) => {
        if (startRef.current === null) startRef.current = ts;
        const elapsed = ts - startRef.current;
        const t = Math.min(1, elapsed / duration);
        // easeOutExpo
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setValue(fromRef.current + (target - fromRef.current) * eased);
        if (t < 1) frameRef.current = requestAnimationFrame(step);
      };
      frameRef.current = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // We intentionally depend only on target — animation retriggers on target change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, delay]);

  return value;
}

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

  // Restart entry animation each time the summary data changes (e.g. navigating folders).
  // The key forces React to remount the 3 ring cards so useEffect re-fires.
  const mountKey = `${fi}-${fe}-${pi}-${pe}`;

  return (
    <section
      className="hero-balance-card rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-md"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 14px -6px rgba(0,0,0,0.06)",
      }}
    >
      <style>{`
        @keyframes heroCardIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroRingIn {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .hero-balance-card { animation: heroCardIn 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .hero-ring-card { animation: heroRingIn 620ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>

      <div className="grid grid-cols-3 gap-3 sm:gap-5" key={mountKey}>
        {/* Ring 1 — Факт */}
        <RingCard
          title="Факт"
          subtitle="дохід / витрата"
          outerValue={pct(fi, factMax)}
          innerValue={pct(fe, factMax)}
          outerColor={T.success}
          innerColor={T.warning}
          centerLabel="БАЛАНС"
          centerTarget={factBalance}
          centerTone={factPositive ? T.success : T.danger}
          legendLeft={{ label: "Дохід", value: formatCurrencyCompact(fi), color: T.success }}
          legendRight={{ label: "Витрата", value: formatCurrencyCompact(fe), color: T.warning }}
          delay={0}
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
          centerTarget={planBalance}
          centerTone={planPositive ? T.accentPrimary : T.danger}
          legendLeft={{ label: "Дохід", value: formatCurrencyCompact(pi), color: T.accentPrimary }}
          legendRight={{ label: "Витрата", value: formatCurrencyCompact(pe), color: T.violet }}
          delay={140}
        />

        {/* Ring 3 — Дельта план→факт */}
        <DeltaRingCard
          coverage={deltaCoverage}
          delta={delta}
          deltaPositive={deltaPositive}
          factBalance={factBalance}
          planBalance={planBalance}
          delay={280}
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
  centerTarget,
  centerTone,
  legendLeft,
  legendRight,
  delay,
}: {
  title: string;
  subtitle: string;
  outerValue: number;
  innerValue: number;
  outerColor: string;
  innerColor: string;
  centerLabel: string;
  centerTarget: number;
  centerTone: string;
  legendLeft: { label: string; value: string; color: string };
  legendRight: { label: string; value: string; color: string };
  delay: number;
}) {
  const animatedCenter = useCountUp(centerTarget, 1100, delay);
  const formatted = formatCurrencyCompact(Math.round(animatedCenter));

  return (
    <div
      className="hero-ring-card flex flex-col items-center gap-3 min-w-0"
      style={{ animationDelay: `${delay}ms` }}
    >
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
        delay={delay}
        duration={1100}
        ariaLabel={`${title}: ${formatCurrencyCompact(centerTarget)}`}
      >
        <span className="text-[9px] font-bold tracking-[0.16em]" style={{ color: T.textMuted }}>
          {centerLabel}
        </span>
        <span
          className="text-[17px] sm:text-[19px] font-bold tabular-nums"
          style={{ color: centerTone }}
        >
          {formatted}
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
  delay,
}: {
  coverage: number;
  delta: number;
  deltaPositive: boolean;
  factBalance: number;
  planBalance: number;
  delay: number;
}) {
  const color = deltaPositive ? T.success : T.danger;
  const animatedDelta = useCountUp(delta, 1100, delay);
  const animatedCoverage = useCountUp(coverage, 1100, delay);
  const deltaStr = formatCurrencyCompact(Math.round(animatedDelta));

  return (
    <div
      className="hero-ring-card flex flex-col items-center gap-3 min-w-0"
      style={{ animationDelay: `${delay}ms` }}
    >
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
        delay={delay}
        duration={1100}
        ariaLabel={`Дельта: ${formatCurrencyCompact(delta)}`}
      >
        <div className="flex flex-col items-center leading-tight gap-0.5">
          <span
            className="text-[9px] font-bold tracking-[0.16em]"
            style={{ color: T.textMuted }}
          >
            {deltaPositive ? "ПЕРЕВИКОНАННЯ" : "НЕДОВИКОНАННЯ"}
          </span>
          <span
            className="text-[17px] sm:text-[19px] font-bold tabular-nums"
            style={{ color }}
          >
            {animatedDelta >= 0 ? "+" : ""}
            {deltaStr}
          </span>
          <span className="text-[9px] tabular-nums" style={{ color: T.textMuted }}>
            покриття {Math.round(animatedCoverage)}%
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
