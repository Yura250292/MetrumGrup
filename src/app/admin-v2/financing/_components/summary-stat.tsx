"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { RadialProgress } from "@/components/ui/RadialProgress";

export function SummaryStat({
  label,
  value,
  accent,
  icon,
  ringPct,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  accent: string;
  icon?: React.ReactNode;
  ringPct?: number | null;
  hint?: string;
  emphasis?: "hero" | "default";
}) {
  const isHero = emphasis === "hero";
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {ringPct !== undefined && ringPct !== null && (
        <RadialProgress
          value={ringPct}
          size={isHero ? 44 : 36}
          thickness={isHero ? 5 : 4}
          fillColor={accent}
          trackColor={`${accent}22`}
        >
          <span
            className="text-[9px] sm:text-[10px] font-bold"
            style={{ color: accent }}
          >
            {Math.round(ringPct)}%
          </span>
        </RadialProgress>
      )}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="flex items-center gap-1 text-[10px] font-semibold tracking-wide truncate"
          style={{ color: T.textMuted }}
        >
          {icon}
          {label}
        </span>
        <span
          className={`${isHero ? "text-lg sm:text-2xl" : "text-base sm:text-xl"} font-bold truncate`}
          style={{ color: accent }}
        >
          {value}
        </span>
        {hint && (
          <span
            className="text-[10px] truncate"
            style={{ color: T.textMuted }}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

export function formatPercent(actual: number, planned: number): string {
  if (!planned || planned === 0) return "—";
  const pct = Math.round((actual / planned) * 100);
  return `${pct}%`;
}

export function rawPercent(actual: number, planned: number): number | null {
  if (!planned || planned === 0) return null;
  return Math.round((actual / planned) * 100);
}
