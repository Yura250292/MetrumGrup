"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Sparkles, AlertTriangle, AlertCircle, CheckCircle2, ChevronRight, ArrowRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiPanel } from "@/contexts/AiPanelContext";
import type { Insight } from "@/lib/ai-assistant/insights";

const ICONS = {
  danger: AlertTriangle,
  warning: AlertCircle,
  info: Sparkles,
  success: CheckCircle2,
};

const COLORS = {
  danger: T.danger,
  warning: T.warning,
  info: T.accentPrimary,
  success: T.success,
};

/**
 * Compact widget for the admin dashboard showing AI insights.
 * Clicking opens the AI chat panel with the relevant question.
 */
export function AiDashboardWidget() {
  const { open } = useAiPanel();
  const { data: insights } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: async (): Promise<Insight[]> => {
      const res = await fetch("/api/admin/ai/insights");
      if (!res.ok) return [];
      return (await res.json()).insights;
    },
    staleTime: 120_000,
  });

  if (!insights?.length) return null;

  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})` }}
          >
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            AI Інсайти
          </h3>
        </div>
        <button
          onClick={() => open()}
          className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:opacity-80"
          style={{ color: T.accentPrimary }}
        >
          Відкрити чат <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {insights.slice(0, 4).map((insight, i) => {
          const Icon = ICONS[insight.type];
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all"
              style={{ backgroundColor: T.panelSoft }}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: COLORS[insight.type] }} />
              <button
                onClick={() => open()}
                className="flex-1 min-w-0 text-left hover:opacity-90 tap-highlight-none"
              >
                <p className="text-[12px] font-medium truncate" style={{ color: T.textPrimary }}>
                  {insight.title}
                </p>
              </button>
              {insight.actionHref && (
                <Link
                  href={insight.actionHref}
                  className="flex items-center gap-0.5 text-[10px] font-semibold shrink-0 hover:opacity-80"
                  style={{ color: COLORS[insight.type] }}
                >
                  Перейти <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
