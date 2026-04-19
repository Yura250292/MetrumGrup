"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function AiSummary() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ai-dashboard-summary"],
    queryFn: async (): Promise<string> => {
      const res = await fetch("/api/admin/ai/summary");
      if (!res.ok) return "";
      const json = await res.json();
      return json.summary ?? "";
    },
    staleTime: 300_000, // 5 minutes
    retry: 1,
  });

  if (!data && !isLoading) return null;

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${T.accentPrimary}08 0%, ${T.accentSecondary}12 100%)`,
        border: `1px solid ${T.accentPrimary}20`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
          style={{
            background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
          }}
        >
          <Sparkles size={14} color="#fff" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
              AI ПІДСУМОК ДНЯ
            </span>
          </div>
          {isLoading || isFetching ? (
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full animate-pulse"
                style={{ backgroundColor: T.accentPrimary }}
              />
              <span className="text-[13px]" style={{ color: T.textMuted }}>
                Аналізую дані...
              </span>
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed" style={{ color: T.textPrimary }}>
              {data}
            </p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 transition hover:brightness-[0.95]"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
          }}
          title="Оновити підсумок"
        >
          <RefreshCw
            size={12}
            style={{ color: T.textMuted }}
            className={isFetching ? "animate-spin" : ""}
          />
        </button>
      </div>
    </div>
  );
}
