import Link from "next/link";
import { TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MotionCard } from "./motion-card";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  href,
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  accent: string;
  href?: string;
  delta?: { value: number; label: string };
  /** Optional time-series for sparkline. If absent, a decorative line is drawn from delta sign. */
  sparkline?: number[];
  /** @deprecated kept for backwards compat */
  gradient?: string;
}) {
  const trend = delta?.value ?? 0;
  const showSparkline = !!delta || (sparkline && sparkline.length > 1);
  const sparklinePath = showSparkline
    ? buildSparklinePath(sparkline, trend, 72, 26)
    : null;

  const content = (
    <MotionCard
      className="premium-card premium-card-elevated relative flex h-full flex-col rounded-xl sm:rounded-2xl p-4 sm:p-5 group overflow-hidden cursor-pointer"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Top row: label + icon */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <span
          className="text-[10.5px] font-semibold tracking-wider uppercase truncate"
          style={{ color: T.textMuted, letterSpacing: "0.08em" }}
        >
          {label}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: accent + "14" }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>

      {/* Value */}
      <div
        className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-none tabular-nums truncate"
        style={{ color: T.textPrimary, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>

      {/* Bottom row: delta + sub */}
      <div className="flex items-center gap-2 flex-wrap mt-2 min-h-[20px]">
        {delta && delta.value !== 0 && (
          <DeltaBadge value={delta.value} label={delta.label} />
        )}
        <span
          className="text-[11.5px] truncate"
          style={{ color: T.textMuted }}
        >
          {sub}
        </span>
      </div>

      {/* Sparkline (decorative bottom-right) */}
      {sparklinePath && (
        <svg
          className="absolute right-3 bottom-3 pointer-events-none"
          width={72}
          height={26}
          viewBox="0 0 72 26"
          style={{ opacity: 0.6 }}
          aria-hidden
        >
          <path
            d={sparklinePath}
            fill="none"
            stroke={accent}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Hover navigate arrow (when card links) */}
      {href && (
        <ArrowUpRight
          size={14}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: T.textMuted }}
        />
      )}
    </MotionCard>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group active:scale-[0.99] transition-transform duration-150 block h-full"
      >
        {content}
      </Link>
    );
  }
  return content;
}

function DeltaBadge({ value, label }: { value: number; label: string }) {
  const isPositive = value > 0;
  const color = isPositive ? T.success : T.danger;
  const Arrow = isPositive ? TrendingUp : TrendingDown;
  const sign = isPositive ? "+" : "";
  const displayValue =
    Math.abs(value) >= 1000
      ? `${sign}${Math.round(value)}`
      : `${sign}${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold flex-shrink-0"
      style={{ backgroundColor: color + "14", color }}
      title={label}
    >
      <Arrow size={10} />
      {displayValue}
    </span>
  );
}

/**
 * Build an SVG path for the sparkline. If `data` is provided and has ≥2 points,
 * use it. Otherwise generate a decorative wavy line whose overall direction matches
 * the trend sign (positive → ascending, negative → descending, zero → flat-wave).
 */
function buildSparklinePath(
  data: number[] | undefined,
  trend: number,
  w: number,
  h: number,
): string {
  const points = data && data.length > 1 ? data : decorativeSeries(trend);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);

  return points
    .map((v, i) => {
      const x = i * stepX;
      // SVG y inverts; pad by 2px top/bottom
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function decorativeSeries(trend: number): number[] {
  // 8 points; small wave riding a linear trend
  const n = 8;
  const direction = trend > 0 ? 1 : trend < 0 ? -1 : 0;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const wave = Math.sin(t * Math.PI * 2.5) * 0.15;
    return t * direction + wave;
  });
}
