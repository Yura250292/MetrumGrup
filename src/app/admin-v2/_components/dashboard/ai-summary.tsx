"use client";

import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function AiSummary() {
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai/summary");
      if (!res.ok) { setData(""); return; }
      const json = await res.json();
      setData(json.summary ?? "");
      setLoaded(true);
    } catch {
      setData("");
    } finally {
      setLoading(false);
    }
  }

  // Not yet loaded — show compact button
  if (!loaded && !loading) {
    return (
      <button
        onClick={load}
        className="premium-ai w-full flex items-center gap-3 rounded-2xl p-4 sm:p-5 transition active:scale-[0.99] tap-highlight-none"
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
          }}
        >
          <Sparkles size={14} color="#fff" />
        </div>
        <div className="flex-1 text-left">
          <span className="text-[12px] font-bold" style={{ color: T.accentPrimary }}>
            AI ПІДСУМОК ДНЯ
          </span>
          <p className="text-[11px]" style={{ color: T.textMuted }}>
            Натисніть щоб згенерувати
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="premium-ai rounded-2xl p-4 sm:p-5 relative overflow-hidden">
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
          {loading ? (
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
          onClick={load}
          disabled={loading}
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
            className={loading ? "animate-spin" : ""}
          />
        </button>
      </div>
    </div>
  );
}
