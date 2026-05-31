"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RotateCcw, Play } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  cycleStageStatusAction,
  setStageProgressAction,
  updateStageDatesAction,
} from "../actions";

/**
 * Кнопка зміни статусу: PENDING → IN_PROGRESS → COMPLETED → PENDING.
 * Іконка і текст залежать від поточного статусу.
 */
export function StageStatusButton({
  stageId,
  status,
  className,
}: {
  stageId: string;
  status: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await cycleStageStatusAction(stageId);
      if (!result.success) setError(result.error);
    });
  };

  const config = (() => {
    if (status === "PENDING") {
      return { label: "Розпочати", icon: Play, bg: T.accentPrimary, fg: "#FFF" };
    }
    if (status === "IN_PROGRESS") {
      return { label: "Завершити", icon: Check, bg: T.success, fg: "#FFF" };
    }
    return { label: "Відновити", icon: RotateCcw, bg: T.panelElevated, fg: T.textSecondary };
  })();
  const Icon = config.icon;

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          className ??
          "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition disabled:opacity-60"
        }
        style={{ backgroundColor: config.bg, color: config.fg }}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
        {config.label}
      </button>
      {error && (
        <span className="text-[10px]" style={{ color: T.danger }}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Slider 0..100 для редагування прогресу. Debounced save на release.
 */
export function StageProgressSlider({
  stageId,
  initialProgress,
}: {
  stageId: string;
  initialProgress: number;
}) {
  const [value, setValue] = useState(initialProgress);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const persist = (newValue: number) => {
    setError(null);
    startTransition(async () => {
      const result = await setStageProgressAction(stageId, newValue);
      if (!result.success) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onMouseUp={() => persist(value)}
          onTouchEnd={() => persist(value)}
          onKeyUp={() => persist(value)}
          disabled={isPending}
          className="flex-1 accent-current"
          style={{ color: T.accentPrimary }}
        />
        <span
          className="text-[12px] font-bold tabular-nums w-12 text-right"
          style={{ color: T.accentPrimary }}
        >
          {value}%
        </span>
        {isPending && <Loader2 size={12} className="animate-spin" style={{ color: T.textMuted }} />}
      </div>
      {error && (
        <span className="text-[10px]" style={{ color: T.danger }}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Edit dates inline. Показуємо два date inputs, save on blur.
 */
export function StageDatesEditor({
  stageId,
  startDate,
  endDate,
}: {
  stageId: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
}) {
  const [start, setStart] = useState<string>(toInputDate(startDate));
  const [end, setEnd] = useState<string>(toInputDate(endDate));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const persist = (newStart: string, newEnd: string) => {
    setError(null);
    startTransition(async () => {
      const result = await updateStageDatesAction(
        stageId,
        newStart || null,
        newEnd || null,
      );
      if (!result.success) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: T.textSecondary }}>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onBlur={() => persist(start, end)}
          disabled={isPending}
          className="rounded-md px-1.5 py-1 outline-none"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
        />
        <span>—</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => persist(start, end)}
          disabled={isPending}
          className="rounded-md px-1.5 py-1 outline-none"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
        />
        {isPending && <Loader2 size={12} className="animate-spin" style={{ color: T.textMuted }} />}
      </div>
      {error && (
        <span className="text-[10px]" style={{ color: T.danger }}>
          {error}
        </span>
      )}
    </div>
  );
}

function toInputDate(d: Date | string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}
