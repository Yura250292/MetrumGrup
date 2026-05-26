"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { Collapsible } from "@/components/ui/Collapsible";
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

/** Smoothly tween a number from 0 (or previous value) to `target`. */
function useCountUp(target: number, duration = 900, delay = 0) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, delay]);

  return value;
}

export function HeroBalance({ summary }: { summary: FinanceSummaryDTO }) {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isNarrow = useMediaQuery("(max-width: 420px)");
  const [open, setOpen] = useState(!isNarrow);
  useEffect(() => {
    setOpen(!isNarrow);
  }, [isNarrow]);

  const fi = summary.fact.income.sum;
  const fe = summary.fact.expense.sum;
  const pi = summary.plan.income.sum;
  const pe = summary.plan.expense.sum;

  const factBalance = fi - fe;
  const planBalance = pi - pe;

  const bud = summary.budget.income.sum - summary.budget.expense.sum;
  const com = summary.commitments.income.sum - summary.commitments.expense.sum;
  const cash = summary.actualCashBalance;

  // Restart entry animation each time the summary data changes.
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
        @keyframes heroRowIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-balance-card { animation: heroCardIn 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .hero-bullet-row { animation: heroRowIn 540ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .hero-balance-card, .hero-bullet-row { animation: none !important; }
        }
      `}</style>

      {/* Compact summary bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-1 py-1 transition-colors"
      >
        <div
          className="flex items-stretch min-w-0 flex-1 divide-x"
          style={{ borderColor: T.borderSoft }}
        >
          <CompactStat
            label="Каса"
            value={formatCurrencyCompact(cash)}
            tone={cash >= 0 ? T.success : T.danger}
          />
          <CompactStat
            label="Бюджет"
            value={formatCurrencyCompact(bud)}
            tone={bud >= 0 ? T.accentPrimary : T.danger}
          />
          <CompactStat
            label="Обовʼязання"
            value={formatCurrencyCompact(com)}
            tone={com >= 0 ? T.warning : T.danger}
          />
        </div>
        <ChevronDown
          size={16}
          className="flex-shrink-0 transition-transform"
          style={{
            color: T.textMuted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      <Collapsible open={open} duration={320}>
        <div
          className="pt-3 mt-2 flex flex-col"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
          key={mountKey}
        >
          <BulletRow
            label="Дохід"
            planValue={pi}
            factValue={fi}
            barColor={T.success}
            deltaDirection="higher-is-good"
            delay={prefersReducedMotion ? 0 : 0}
            animate={!prefersReducedMotion}
          />
          <div style={{ borderTop: `1px dashed ${T.borderSoft}` }} />
          <BulletRow
            label="Витрата"
            planValue={pe}
            factValue={fe}
            barColor={T.warning}
            deltaDirection="lower-is-good"
            delay={prefersReducedMotion ? 0 : 120}
            animate={!prefersReducedMotion}
          />
          <div style={{ borderTop: `1px dashed ${T.borderSoft}` }} />
          <BalanceRow
            planBalance={planBalance}
            factBalance={factBalance}
            delay={prefersReducedMotion ? 0 : 240}
            animate={!prefersReducedMotion}
          />
        </div>
      </Collapsible>
    </section>
  );
}

function CompactStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center leading-tight min-w-0 px-2 sm:px-3"
      style={{ borderColor: T.borderSoft }}
    >
      <span
        className="text-[9.5px] font-semibold tracking-wide"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span
        className="text-[13px] sm:text-[14px] font-bold tabular-nums whitespace-nowrap truncate max-w-full"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}

type DeltaDirection = "higher-is-good" | "lower-is-good";

function BulletRow({
  label,
  planValue,
  factValue,
  barColor,
  deltaDirection,
  delay,
  animate,
}: {
  label: string;
  planValue: number;
  factValue: number;
  barColor: string;
  deltaDirection: DeltaDirection;
  delay: number;
  animate: boolean;
}) {
  const dur = animate ? 900 : 0;
  const animatedPlan = useCountUp(planValue, dur, animate ? delay : 0);
  const animatedFact = useCountUp(factValue, dur, animate ? delay + 80 : 0);
  const delta = factValue - planValue;
  const animatedDelta = useCountUp(delta, dur, animate ? delay + 160 : 0);

  const max = Math.max(Math.abs(planValue), Math.abs(factValue), 1);
  const planWidth = (Math.abs(planValue) / max) * 100;
  const factWidth = (Math.abs(factValue) / max) * 100;

  const isPositiveDelta = delta >= 0;
  const isGood =
    delta === 0
      ? true
      : deltaDirection === "higher-is-good"
        ? isPositiveDelta
        : !isPositiveDelta;
  const deltaColor = delta === 0 ? T.textMuted : isGood ? T.success : T.danger;
  const arrow = delta === 0 ? "" : isPositiveDelta ? "▲" : "▼";

  return (
    <div
      className="hero-bullet-row grid items-center gap-2 sm:gap-3 py-2"
      style={{
        gridTemplateColumns: "62px 1fr auto",
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className="text-[11px] sm:text-[12px] font-semibold truncate"
        style={{ color: T.textPrimary }}
      >
        {label}
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <BulletBar
          legend="План"
          width={planWidth}
          value={animatedPlan}
          color={`${barColor}66`}
        />
        <BulletBar
          legend="Факт"
          width={factWidth}
          value={animatedFact}
          color={barColor}
        />
      </div>

      <div
        className="flex items-center gap-1 px-2 py-1 rounded-md tabular-nums whitespace-nowrap"
        style={{
          backgroundColor: `${deltaColor}15`,
          color: deltaColor,
        }}
      >
        <span className="text-[10px] sm:text-[11px] font-bold">
          {animatedDelta > 0 ? "+" : ""}
          {formatCurrencyCompact(animatedDelta)}
        </span>
        {arrow && <span className="text-[8px]">{arrow}</span>}
      </div>
    </div>
  );
}

function BulletBar({
  legend,
  width,
  value,
  color,
}: {
  legend: string;
  width: number;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="text-[8.5px] sm:text-[9px] font-semibold uppercase tracking-wide w-7 flex-shrink-0"
        style={{ color: T.textMuted }}
      >
        {legend}
      </span>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden min-w-0"
        style={{ backgroundColor: `${color}22` }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(width, 1.5)}%`,
            backgroundColor: color,
            transition: "width 200ms linear",
          }}
        />
      </div>
      <span
        className="text-[10px] sm:text-[11px] font-semibold tabular-nums w-14 text-right flex-shrink-0"
        style={{ color: T.textPrimary }}
      >
        {formatCurrencyCompact(value)}
      </span>
    </div>
  );
}

function BalanceRow({
  planBalance,
  factBalance,
  delay,
  animate,
}: {
  planBalance: number;
  factBalance: number;
  delay: number;
  animate: boolean;
}) {
  const dur = animate ? 900 : 0;
  const animatedPlan = useCountUp(planBalance, dur, animate ? delay : 0);
  const animatedFact = useCountUp(factBalance, dur, animate ? delay + 80 : 0);
  const delta = factBalance - planBalance;
  const animatedDelta = useCountUp(delta, dur, animate ? delay + 160 : 0);

  const factColor = factBalance >= 0 ? T.success : T.danger;
  const planColor = planBalance >= 0 ? T.accentPrimary : T.danger;
  const deltaColor = delta === 0 ? T.textMuted : delta >= 0 ? T.success : T.danger;
  const arrow = delta === 0 ? "" : delta >= 0 ? "▲" : "▼";

  return (
    <div
      className="hero-bullet-row grid items-center gap-2 sm:gap-3 py-2"
      style={{
        gridTemplateColumns: "62px 1fr auto",
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className="text-[11px] sm:text-[12px] font-bold truncate"
        style={{ color: T.textPrimary }}
      >
        Баланс
      </div>

      <div className="flex items-center justify-around gap-2 min-w-0">
        <BalanceStat label="План" value={animatedPlan} color={planColor} />
        <span
          className="text-[12px] font-light flex-shrink-0"
          style={{ color: T.textMuted }}
        >
          →
        </span>
        <BalanceStat label="Факт" value={animatedFact} color={factColor} />
      </div>

      <div
        className="flex items-center gap-1 px-2 py-1 rounded-md tabular-nums whitespace-nowrap"
        style={{
          backgroundColor: `${deltaColor}15`,
          color: deltaColor,
        }}
      >
        <span className="text-[10px] sm:text-[11px] font-bold">
          {animatedDelta > 0 ? "+" : ""}
          {formatCurrencyCompact(animatedDelta)}
        </span>
        {arrow && <span className="text-[8px]">{arrow}</span>}
      </div>
    </div>
  );
}

function BalanceStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center leading-tight min-w-0">
      <span
        className="text-[8.5px] sm:text-[9px] font-semibold uppercase tracking-wide"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span
        className="text-[12px] sm:text-[14px] font-bold tabular-nums whitespace-nowrap"
        style={{ color }}
      >
        {formatCurrencyCompact(value)}
      </span>
    </div>
  );
}
