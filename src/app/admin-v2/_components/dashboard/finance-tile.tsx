import { TrendingUp, TrendingDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";

export function FinanceTile({
  label,
  value,
  icon: Icon,
  color,
  emphasize,
  delta,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  emphasize?: boolean;
  delta?: { value: number; label: string };
}) {
  return (
    <div
      className="relative flex items-center gap-4 rounded-2xl p-5 overflow-hidden transition-all duration-200"
      style={{
        background: T.panel,
        border: `1px solid ${emphasize ? color + "40" : T.borderSoft}`,
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
        style={{ backgroundColor: color }}
      />

      {/* Background glow for emphasized */}
      {emphasize && (
        <div
          className="absolute -right-8 -bottom-8 h-28 w-28 rounded-full opacity-[0.08] blur-3xl"
          style={{ backgroundColor: color }}
        />
      )}

      {/* Icon */}
      <div
        className="relative flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${color}18, ${color}08)`,
          border: `1px solid ${color}20`,
        }}
      >
        <Icon size={22} style={{ color }} />
      </div>

      {/* Content */}
      <div className="relative flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          {label}
        </span>
        <div className="flex items-center gap-2.5">
          <span
            className={`font-extrabold truncate ${emphasize ? "text-2xl" : "text-xl"}`}
            style={{ color: emphasize ? color : T.textPrimary }}
          >
            {formatCurrencyCompact(value)}
          </span>
          {delta && delta.value !== 0 && (
            <FinanceDelta value={delta.value} label={delta.label} />
          )}
        </div>
      </div>
    </div>
  );
}

function FinanceDelta({ value, label }: { value: number; label: string }) {
  const isPositive = value > 0;
  const color = isPositive ? T.success : T.danger;
  const Arrow = isPositive ? TrendingUp : TrendingDown;
  const sign = isPositive ? "+" : "";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
      style={{ backgroundColor: color + "14", color }}
      title={label}
    >
      <Arrow size={10} />
      {sign}{value.toFixed(value % 1 === 0 ? 0 : 1)}%
    </span>
  );
}
