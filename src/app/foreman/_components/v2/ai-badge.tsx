"use client";

import { Sparkles } from "lucide-react";

interface AiBadgeProps {
  /** 0..1 confidence value. */
  confidence?: number | null;
  label?: string;
}

export function AiBadge({ confidence, label = "AI розпізнав" }: AiBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-2 py-1 text-[11px] font-bold">
      <Sparkles size={12} strokeWidth={2.4} />
      {label}
      {typeof confidence === "number" && (
        <span className="ml-1 opacity-80 tabular-nums">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  );
}

interface ConfidenceLabelProps {
  confidence: number;
}

export function ConfidenceLabel({ confidence }: ConfidenceLabelProps) {
  const pct = Math.round(confidence * 100);
  const tone = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600";
  return (
    <span className={`text-[11px] font-semibold ${tone} tabular-nums`}>Точність: {pct}%</span>
  );
}
