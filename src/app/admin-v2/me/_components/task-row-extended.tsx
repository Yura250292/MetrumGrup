"use client";

import {
  CheckCircle2,
  Play,
  Square,
  User,
  ArrowRight,
  AlertTriangle,
  Circle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { isOverdue, PRIORITY_COLOR, type TaskItem } from "./use-me-tasks";

type Props = {
  task: TaskItem;
  isTimerActive: boolean;
  pending: boolean;
  onOpen: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onMarkDone: () => void;
};

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}

function formatDue(dueIso: string | null): string {
  if (!dueIso) return "—";
  const d = new Date(dueIso);
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

export function TaskRowExtended({
  task,
  isTimerActive,
  pending,
  onOpen,
  onStartTimer,
  onStopTimer,
  onMarkDone,
}: Props) {
  const overdue = isOverdue(task);
  const incoming = task.incomingDepsCount ?? 0;
  const outgoing = task.outgoingDepsCount ?? 0;
  const nextStep = task.firstUndoneChecklistItem;
  const creatorName = task.createdBy?.name;
  const isUrgent = task.priority === "URGENT";
  const highlight = overdue || isUrgent;

  return (
    <li
      className="group flex items-center gap-3 rounded-lg px-3 py-2 transition hover:brightness-[0.98] cursor-pointer"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${highlight ? T.danger + "40" : T.borderSoft}`,
        borderLeft: highlight ? `3px solid ${T.danger}` : undefined,
        boxShadow: isTimerActive ? `inset 3px 0 0 ${T.accentPrimary}` : undefined,
      }}
      onClick={onOpen}
    >
      {/* Priority dot (pulsing for URGENT or overdue) */}
      <span
        className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${highlight ? "animate-pulse" : ""}`}
        style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
        title={`Пріоритет: ${task.priority}${overdue ? " • прострочено" : ""}`}
      />

      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {task.title}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ backgroundColor: task.status.color + "20", color: task.status.color }}
          >
            {task.status.name}
          </span>
          {incoming > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: T.warningSoft, color: T.warning }}
              title={`Блокують ${incoming} задач`}
            >
              <AlertTriangle size={9} />
              Блок: {incoming}
            </span>
          )}
          {outgoing > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
              title={`Блокує ${outgoing} задач`}
            >
              <ArrowRight size={9} />
              Блокує: {outgoing}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] flex-wrap" style={{ color: T.textMuted }}>
          <span className="truncate max-w-[180px]">{task.project.title}</span>
          {creatorName && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <User size={10} />
                {creatorName}
              </span>
            </>
          )}
          <span>·</span>
          <span style={{ color: overdue ? T.danger : T.textMuted }}>
            {formatDue(task.dueDate)}
          </span>
        </div>

        {nextStep && (
          <div
            className="flex items-center gap-1.5 text-[11px] mt-0.5"
            style={{ color: T.textSecondary }}
          >
            <Circle size={10} style={{ color: T.accentPrimary }} />
            <span className="truncate">{truncate(nextStep, 80)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition"
        onClick={(e) => e.stopPropagation()}
      >
        {isTimerActive ? (
          <button
            type="button"
            onClick={onStopTimer}
            disabled={pending}
            className="rounded-md p-1.5 disabled:opacity-50"
            style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            title="Зупинити таймер"
          >
            <Square size={12} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartTimer}
            disabled={pending}
            className="rounded-md p-1.5 disabled:opacity-50"
            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
            title="Старт таймера"
          >
            <Play size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={onMarkDone}
          disabled={pending}
          className="rounded-md p-1.5 disabled:opacity-50"
          style={{ backgroundColor: T.successSoft, color: T.success }}
          title="Завершити"
        >
          <CheckCircle2 size={12} />
        </button>
      </div>
    </li>
  );
}
