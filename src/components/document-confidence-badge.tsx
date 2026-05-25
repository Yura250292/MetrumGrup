"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function DocumentConfidenceBadge({
  value,
  label,
}: {
  value: number | null | undefined;
  label?: string;
}) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const tier = value >= 0.9 ? "high" : value >= 0.7 ? "mid" : "low";
  const palette = {
    high: { bg: T.successSoft, fg: T.success, text: "Висока довіра" },
    mid: { bg: T.amberSoft, fg: T.amber, text: "Потрібен перегляд" },
    low: { bg: T.dangerSoft, fg: T.danger, text: "Низька — виправити" },
  } as const;
  const p = palette[tier];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: p.bg, color: p.fg }}
      title={p.text}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: p.fg }}
      />
      {label ? <span>{label}</span> : null}
      <span>{pct}%</span>
    </span>
  );
}
