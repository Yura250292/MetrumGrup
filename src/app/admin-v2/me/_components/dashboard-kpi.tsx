"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Bell,
  ListChecks,
  CalendarDays,
  Play,
  Square,
  Zap,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { Dashboard, ActiveTimer, TaskItem, Focus } from "./use-me-tasks";
import { isOverdue } from "./use-me-tasks";

export const FOCUS_DEFS: { id: Focus; label: string; icon: typeof AlertTriangle }[] = [
  { id: "all", label: "Всі", icon: ListChecks },
  { id: "overdue", label: "Прострочено", icon: AlertTriangle },
  { id: "today", label: "Сьогодні", icon: Clock },
  { id: "next", label: "Далі", icon: CalendarDays },
];

export function FocusBanner({
  activeTimer,
  nextTask,
  onStop,
  onStart,
  stopping,
}: {
  activeTimer: ActiveTimer | null;
  nextTask: TaskItem | null;
  onStop: () => void;
  onStart: (id: string) => void;
  stopping: boolean;
}) {
  if (activeTimer) {
    const elapsedMin = Math.max(
      0,
      Math.floor((Date.now() - new Date(activeTimer.startedAt).getTime()) / 60000),
    );
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          backgroundColor: T.accentPrimarySoft,
          border: `1px solid ${T.accentPrimary}`,
        }}
      >
        <span
          className="inline-flex items-center justify-center h-9 w-9 rounded-full"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
        >
          <Zap size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: T.accentPrimary }}
          >
            У ФОКУСІ · {elapsedMin} хв
          </div>
          <div
            className="text-[14px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {activeTimer.task.title}
          </div>
        </div>
        <button
          onClick={onStop}
          disabled={stopping}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
          style={{ backgroundColor: "#ef4444", color: "#fff" }}
        >
          <Square size={12} /> Стоп
        </button>
      </div>
    );
  }
  if (nextTask) {
    const overdue = isOverdue(nextTask);
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${overdue ? "#ef4444" : T.borderSoft}`,
        }}
      >
        <span
          className="inline-flex items-center justify-center h-9 w-9 rounded-full"
          style={{
            backgroundColor: (overdue ? "#ef4444" : T.accentPrimary) + "22",
            color: overdue ? "#ef4444" : T.accentPrimary,
          }}
        >
          {overdue ? <AlertTriangle size={16} /> : <CalendarDays size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: overdue ? "#ef4444" : T.textMuted }}
          >
            {overdue ? "ПРОСТРОЧЕНО · ПОЧНИ ЗАРАЗ" : "ДАЛІ В ЧЕРЗІ"}
          </div>
          <div
            className="text-[14px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {nextTask.title}
          </div>
        </div>
        <button
          onClick={() => onStart(nextTask.id)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
        >
          <Play size={12} /> Старт
        </button>
      </div>
    );
  }
  return null;
}

export function Tile({
  label,
  value,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex flex-col gap-1 rounded-xl px-3 py-3 text-left transition hover:brightness-95 disabled:cursor-default"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        <span style={{ color }}>{icon}</span>
        {label}
      </span>
      <span className="text-2xl font-bold" style={{ color }}>
        {value}
      </span>
    </button>
  );
}

export function KpiTiles({
  counts,
  onFocusChange,
}: {
  counts: Dashboard["counts"] | undefined;
  onFocusChange: (f: Focus) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Tile
        label="Активних"
        value={counts?.assigned ?? 0}
        icon={<ListChecks size={16} />}
        color={T.accentPrimary}
        onClick={() => onFocusChange("all")}
      />
      <Tile
        label="Прострочено"
        value={counts?.overdue ?? 0}
        icon={<AlertTriangle size={16} />}
        color="#ef4444"
        onClick={() => onFocusChange("overdue")}
      />
      <Tile
        label="Сьогодні"
        value={counts?.dueToday ?? 0}
        icon={<Clock size={16} />}
        color="#f59e0b"
        onClick={() => onFocusChange("today")}
      />
      <Tile
        label="За 7 днів"
        value={counts?.completed ?? 0}
        icon={<CheckCircle2 size={16} />}
        color="#10b981"
      />
      <Tile
        label="Не прочитано"
        value={counts?.unread ?? 0}
        icon={<Bell size={16} />}
        color={T.accentPrimary}
      />
    </div>
  );
}
