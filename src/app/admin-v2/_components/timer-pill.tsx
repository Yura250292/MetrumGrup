"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, Square, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ActiveTimer = {
  id: string;
  startedAt: string;
  description: string | null;
  task: {
    id: string;
    title: string;
    project: { id: string; title: string };
  };
};

function formatElapsed(startedAt: Date): string {
  const diff = Math.max(0, Date.now() - startedAt.getTime());
  const total = Math.floor(diff / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Small floating pill shown in admin-v2 layout when a timer is active.
 * Polls /api/admin/time/timer/current every 20s to survive tab refresh;
 * local tick updates every second for the elapsed display.
 */
export function TimerPill() {
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [, forceTick] = useState(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/time/timer/current");
      if (!r.ok) {
        setTimer(null);
        return;
      }
      const j = await r.json();
      setTimer(j.data ?? null);
    } catch {
      setTimer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 20000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (!timer) return;
    tickerRef.current = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [timer]);

  // Expose reload so TaskDrawer can trigger after starting a timer there
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener("timer:refresh", reload);
    return () => window.removeEventListener("timer:refresh", reload);
  }, [load]);

  const stop = async () => {
    if (!timer) return;
    setStopping(true);
    try {
      await fetch("/api/admin/time/timer/stop", { method: "POST" });
      await load();
    } finally {
      setStopping(false);
    }
  };

  if (loading || !timer) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-4 right-4 z-40 flex items-center gap-3 rounded-2xl px-3 py-2 shadow-lg"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.accentPrimary}`,
      }}
    >
      <span
        className="inline-flex items-center justify-center h-8 w-8 rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
      >
        <Clock size={14} />
      </span>
      <Link
        href={`/admin-v2/projects/${timer.task.project.id}?tab=tasks`}
        className="flex flex-col min-w-0"
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-wider truncate"
          style={{ color: T.textMuted }}
        >
          {timer.task.project.title}
        </span>
        <span
          className="text-[13px] font-semibold truncate max-w-[180px]"
          style={{ color: T.textPrimary }}
        >
          {timer.task.title}
        </span>
      </Link>
      <span
        className="font-mono font-bold text-[13px] tabular-nums"
        style={{ color: T.accentPrimary }}
      >
        {formatElapsed(new Date(timer.startedAt))}
      </span>
      <button
        onClick={stop}
        disabled={stopping}
        className="rounded-lg p-2 tap-highlight-none active:scale-95 disabled:opacity-50"
        style={{
          backgroundColor: "#ef4444",
          color: "#fff",
        }}
        title="Зупинити"
      >
        {stopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
      </button>
    </div>
  );
}
