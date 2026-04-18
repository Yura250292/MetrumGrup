"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function SummaryStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold tracking-wider truncate"
        style={{ color: T.textMuted }}
      >
        {icon}
        {label}
      </span>
      <span
        className="text-base sm:text-xl font-bold truncate"
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}

export function formatPercent(actual: number, planned: number): string {
  if (!planned || planned === 0) return "—";
  const pct = Math.round((actual / planned) * 100);
  return `${pct}%`;
}
