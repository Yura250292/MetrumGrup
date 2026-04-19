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
      className="flex items-center gap-4 rounded-2xl p-5"
      style={{
        background: emphasize
          ? `linear-gradient(135deg, ${color}08 0%, ${color}18 100%)`
          : T.panel,
        border: `1px solid ${emphasize ? color : color + "30"}`,
        boxShadow: emphasize ? `0 4px 12px ${color}18` : `0 1px 4px ${color}10`,
      }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0"
        style={{ backgroundColor: color + "18", border: `1px solid ${color}30` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: T.textSecondary }}
        >
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-xl font-bold truncate"
            style={{ color }}
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
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold flex-shrink-0"
      style={{ backgroundColor: color + "14", color }}
      title={label}
    >
      <Arrow size={10} />
      {sign}{value.toFixed(value % 1 === 0 ? 0 : 1)}%
    </span>
  );
}
