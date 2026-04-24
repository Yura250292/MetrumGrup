import Link from "next/link";
import { TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  href,
  delta,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  accent: string;
  href?: string;
  delta?: { value: number; label: string };
  /** @deprecated no longer used, kept for backwards compat */
  gradient?: string;
}) {
  const content = (
    <div
      className="relative flex h-full flex-col justify-between rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-colors duration-150 group"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Navigate arrow (desktop hover) */}
      {href && (
        <ArrowUpRight
          size={14}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: T.textMuted }}
        />
      )}

      {/* Icon */}
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ backgroundColor: accent + "14" }}
      >
        <Icon size={15} style={{ color: accent }} />
      </div>

      {/* Label */}
      <span
        className="mt-2 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>

      {/* Value */}
      <div
        className="text-lg sm:text-2xl font-bold tracking-tight truncate leading-tight"
        style={{ color: T.textPrimary }}
      >
        {value}
      </div>

      {/* Sub + delta */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] sm:text-[11px] truncate"
          style={{ color: T.textSecondary }}
        >
          {sub}
        </span>
        {delta && delta.value !== 0 && (
          <DeltaBadge value={delta.value} label={delta.label} />
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group hover:scale-[1.01] active:scale-[0.99] transition-transform duration-150">
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
  const displayValue = Math.abs(value) >= 1000
    ? `${sign}${Math.round(value)}`
    : `${sign}${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
      style={{ backgroundColor: color + "14", color }}
      title={label}
    >
      <Arrow size={10} />
      {displayValue}
    </span>
  );
}
