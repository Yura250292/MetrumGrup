"use client";

import { usePathname, useRouter } from "next/navigation";
import { Mic, Pause, Play, Square, ChevronRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useMeetingRecording } from "@/contexts/MeetingRecordingContext";

export function MeetingMiniRecorder() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, elapsedMs, pause, resume, stop } = useMeetingRecording();

  // Hide on the /meetings/new page — full recorder is already visible there.
  if (pathname?.startsWith("/admin-v2/meetings/new")) return null;
  if (state !== "recording" && state !== "paused") return null;

  const mm = Math.floor(elapsedMs / 60000);
  const ss = Math.floor((elapsedMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  const active = state === "recording";

  return (
    <div
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-2 py-1.5 shadow-lg md:bottom-6"
      style={{
        background: T.panel,
        border: `1px solid ${active ? T.danger + "66" : T.borderSoft}`,
      }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full"
        style={{
          background: active ? T.dangerSoft : T.panelElevated,
          color: active ? T.danger : T.textSecondary,
        }}
      >
        <Mic size={14} className={active ? "animate-pulse" : ""} />
      </span>

      <span
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color: active ? T.danger : T.textPrimary, minWidth: 42 }}
      >
        {mm}:{ss}
      </span>

      {active ? (
        <button
          onClick={pause}
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: T.panelElevated, color: T.textSecondary }}
          title="Пауза"
        >
          <Pause size={14} />
        </button>
      ) : (
        <button
          onClick={resume}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white"
          style={{ background: T.accentPrimary }}
          title="Продовжити"
        >
          <Play size={14} />
        </button>
      )}

      <button
        onClick={stop}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white"
        style={{ background: T.danger }}
        title="Зупинити"
      >
        <Square size={12} />
      </button>

      <button
        onClick={() => router.push("/admin-v2/meetings/new")}
        className="flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium"
        style={{ background: T.panelElevated, color: T.textSecondary }}
        title="До сторінки запису"
      >
        Відкрити
        <ChevronRight size={12} />
      </button>
    </div>
  );
}
