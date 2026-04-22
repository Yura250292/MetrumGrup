"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { DualRadialProgress, RadialProgress } from "@/components/ui/RadialProgress";
import type { FinanceSummaryDTO } from "./types";

/** SSR-safe media query hook */
function useMediaQuery(query: string, defaultValue = false) {
  const [match, setMatch] = useState(defaultValue);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return match;
}

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
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isNarrow = useMediaQuery("(max-width: 420px)");
  const ringSize = isNarrow ? 76 : 92;
  const ringThickness = isNarrow ? 5 : 6;
  const deltaThickness = isNarrow ? 6 : 7;
  const ringGap = isNarrow ? 2 : 3;
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
      className="hero-balance-card rounded-xl p-2.5 sm:p-3 transition-shadow hover:shadow-md"
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
        @media (prefers-reduced-motion: reduce) {
          .hero-balance-card, .hero-ring-card { animation: none !important; }
        }
      `}</style>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-3" key={mountKey}>
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
          delay={prefersReducedMotion ? 0 : 0}
          animate={!prefersReducedMotion}
          size={ringSize}
          thickness={ringThickness}
          gap={ringGap}
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
          delay={prefersReducedMotion ? 0 : 140}
          animate={!prefersReducedMotion}
          size={ringSize}
          thickness={ringThickness}
          gap={ringGap}
        />

        {/* Ring 3 — Дельта план→факт */}
        <DeltaRingCard
          coverage={deltaCoverage}
          delta={delta}
          deltaPositive={deltaPositive}
          factBalance={factBalance}
          planBalance={planBalance}
          delay={prefersReducedMotion ? 0 : 280}
          animate={!prefersReducedMotion}
          size={ringSize}
          thickness={deltaThickness}
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
  animate,
  size,
  thickness,
  gap,
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
  animate: boolean;
  size: number;
  thickness: number;
  gap: number;
}) {
  const animatedCenter = useCountUp(centerTarget, animate ? 1100 : 0, animate ? delay : 0);
  const formatted = formatCurrencyCompact(Math.round(animatedCenter));
  const isTiny = size < 88;

  return (
    <div
      className="hero-ring-card flex flex-col items-center gap-1.5 min-w-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-col items-center">
        <span className="text-[11px] font-semibold" style={{ color: T.textPrimary }}>
          {title}
        </span>
        <span className="text-[9px] hidden sm:block" style={{ color: T.textMuted }}>
          {subtitle}
        </span>
      </div>

      <DualRadialProgress
        size={size}
        thickness={thickness}
        gap={gap}
        outer={{ value: outerValue, color: outerColor }}
        inner={{ value: innerValue, color: innerColor }}
        delay={delay}
        duration={1100}
        animate={animate}
        ariaLabel={`${title}: ${formatCurrencyCompact(centerTarget)}`}
      >
        {!isTiny && (
          <span className="text-[7.5px] font-bold tracking-[0.14em]" style={{ color: T.textMuted }}>
            {centerLabel}
          </span>
        )}
        <span
          className={`${isTiny ? "text-[10.5px]" : "text-[12px] sm:text-[13px]"} font-bold tabular-nums`}
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
  animate,
  size,
  thickness,
}: {
  coverage: number;
  delta: number;
  deltaPositive: boolean;
  factBalance: number;
  planBalance: number;
  delay: number;
  animate: boolean;
  size: number;
  thickness: number;
}) {
  const color = deltaPositive ? T.success : T.danger;
  const dur = animate ? 1100 : 0;
  const d = animate ? delay : 0;
  const animatedDelta = useCountUp(delta, dur, d);
  const animatedCoverage = useCountUp(coverage, dur, d);
  const deltaStr = formatCurrencyCompact(Math.round(animatedDelta));
  const isTiny = size < 88;

  return (
    <div
      className="hero-ring-card flex flex-col items-center gap-1.5 min-w-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-col items-center">
        <span className="text-[11px] font-semibold" style={{ color: T.textPrimary }}>
          Дельта
        </span>
        <span className="text-[9px] hidden sm:block" style={{ color: T.textMuted }}>
          факт vs план
        </span>
      </div>

      <RadialProgress
        size={size}
        thickness={thickness}
        value={coverage}
        fillColor={color}
        trackColor={`${color}22`}
        delay={d}
        duration={dur || 1}
        animate={animate}
        ariaLabel={`Дельта: ${formatCurrencyCompact(delta)}`}
      >
        <div className="flex flex-col items-center leading-tight gap-0.5 px-1">
          {!isTiny && (
            <span
              className="text-[6.5px] font-bold tracking-[0.12em]"
              style={{ color: T.textMuted }}
            >
              {deltaPositive ? "ПЕРЕВИК." : "НЕДОВИК."}
            </span>
          )}
          <span
            className={`${isTiny ? "text-[10px]" : "text-[12px] sm:text-[13px]"} font-bold tabular-nums`}
            style={{ color }}
          >
            {animatedDelta >= 0 ? "+" : ""}
            {deltaStr}
          </span>
          <span className={`${isTiny ? "text-[6.5px]" : "text-[7.5px]"} tabular-nums`} style={{ color: T.textMuted }}>
            {Math.round(animatedCoverage)}%
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
    <div className="grid grid-cols-2 gap-1.5 w-full max-w-[160px] text-center">
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
    <div className="flex flex-col min-w-0">
      <span className="flex items-center justify-center gap-1 text-[9px]" style={{ color: T.textMuted }}>
        <span
          className="h-1 w-1 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span
        className="text-[10.5px] font-semibold truncate"
        style={{ color: T.textPrimary }}
      >
        {value}
      </span>
    </div>
  );
}
