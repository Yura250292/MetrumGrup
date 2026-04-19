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
      className="relative flex flex-col items-center justify-center text-center rounded-xl sm:rounded-2xl p-3 sm:p-5 h-full transition-all duration-200 overflow-hidden group"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Accent gradient overlay top */}
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }}
      />

      {/* Decorative background glow */}
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.07] blur-2xl"
        style={{ backgroundColor: accent }}
      />

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
        className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl mb-2 sm:mb-3 relative z-10"
        style={{
          background: `linear-gradient(135deg, ${accent}22, ${accent}10)`,
          border: `1px solid ${accent}25`,
        }}
      >
        <Icon size={18} style={{ color: accent }} />
      </div>

      {/* Label */}
      <span
        className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase mb-1 relative z-10"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>

      {/* Value */}
      <div
        className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight truncate leading-tight relative z-10 max-w-full"
        style={{ color: T.textPrimary }}
      >
        {value}
      </div>

      {/* Sub + delta */}
      <div className="flex items-center justify-center gap-2 mt-1 relative z-10">
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
