"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { Insight } from "@/lib/ai-assistant/insights";

const ICONS = {
  danger: AlertTriangle,
  warning: AlertCircle,
  info: Info,
  success: CheckCircle2,
};

const COLORS = {
  danger: { bg: T.dangerSoft, text: T.danger },
  warning: { bg: T.warningSoft, text: T.warning },
  info: { bg: T.accentPrimarySoft, text: T.accentPrimary },
  success: { bg: T.successSoft, text: T.success },
};

export function AiInsights({ onAsk }: { onAsk: (prompt: string) => void }) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: async (): Promise<Insight[]> => {
      const res = await fetch("/api/admin/ai/insights");
      if (!res.ok) return [];
      const data = await res.json();
      return data.insights;
    },
    staleTime: 60_000, // cache 1 min
  });

  if (isLoading || !insights?.length) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 md:px-4 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: T.textMuted }}>
        Увага
      </p>
      {insights.map((insight, i) => {
        const Icon = ICONS[insight.type];
        const color = COLORS[insight.type];
        return (
          <button
            key={i}
            onClick={() => onAsk(`Розкажи детальніше: ${insight.title}. ${insight.detail}`)}
            className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.98] tap-highlight-none"
            style={{ backgroundColor: color.bg, border: `1px solid ${color.text}15` }}
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: color.text }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold leading-tight" style={{ color: T.textPrimary }}>
                {insight.title}
              </p>
              <p className="text-[11px] mt-0.5 leading-snug truncate" style={{ color: T.textSecondary }}>
                {insight.detail}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
