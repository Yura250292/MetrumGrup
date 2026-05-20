"use client";

import {
  CheckCircle2,
  Play,
  Square,
  User,
  ArrowRight,
  AlertTriangle,
  Circle,
  Sparkles,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ExternalAssigneeChip } from "./external-assignee-chip";
import { isOverdue, PRIORITY_COLOR, type TaskItem } from "./use-me-tasks";

type Props = {
  task: TaskItem;
  currentUserId?: string;
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

/** "за 2 дні" / "сьогодні" / "прострочено 3 д" / "—" — компактна релативка. */
function formatDueRelative(
  dueIso: string | null,
  isDone: boolean,
): { label: string; tone: "danger" | "warn" | "muted" } {
  if (!dueIso) return { label: "—", tone: "muted" };
  const now = new Date();
  const due = new Date(dueIso);
  // Truncate to day for stable comparison.
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const diffDays = Math.round((b - a) / (24 * 60 * 60 * 1000));
  if (isDone) return { label: "виконано", tone: "muted" };
  if (diffDays < 0) {
    const d = Math.abs(diffDays);
    return { label: `прострочено ${d}д`, tone: "danger" };
  }
  if (diffDays === 0) return { label: "сьогодні", tone: "warn" };
  if (diffDays === 1) return { label: "завтра", tone: "warn" };
  if (diffDays <= 7) return { label: `за ${diffDays}д`, tone: "muted" };
  return {
    label: due.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
    tone: "muted",
  };
}

export function TaskRowExtended({
  task,
  currentUserId,
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
  const showCreator =
    task.createdById && task.createdById !== currentUserId;
  const creatorName = showCreator ? task.createdBy?.name : undefined;
  const isUrgent = task.priority === "URGENT";
  const highlight = overdue || isUrgent;
  const due = formatDueRelative(task.dueDate, task.status.isDone);
  const dueColor =
    due.tone === "danger" ? T.danger : due.tone === "warn" ? T.warning : T.textMuted;
  const assignees = task.assignees ?? [];
  const visibleAssignees = assignees.slice(0, 3);
  const extraAssignees = assignees.length - visibleAssignees.length;

  return (
    <li
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:brightness-[0.98] cursor-pointer min-h-[52px]"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${highlight ? T.danger + "40" : T.borderSoft}`,
        borderLeft: highlight ? `3px solid ${T.danger}` : undefined,
        boxShadow: isTimerActive ? `inset 3px 0 0 ${T.accentPrimary}` : undefined,
      }}
      onClick={onOpen}
    >
      {/* Quick-complete circle: click to mark done without opening drawer. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!pending) onMarkDone();
        }}
        disabled={pending}
        className="flex-shrink-0 rounded-full p-0.5 hover:scale-110 transition disabled:opacity-50"
        title="Завершити"
        aria-label="Завершити задачу"
      >
        <Circle
          size={18}
          style={{ color: highlight ? T.danger : T.textMuted }}
        />
      </button>

      {/* Priority dot */}
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
          {task.hasAiSpec && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{
                backgroundColor: T.accentSecondarySoft,
                color: T.accentSecondary,
              }}
              title="Технічне завдання згенеровано AI"
            >
              <Sparkles size={9} />
              ТЗ
            </span>
          )}
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

        <div
          className="flex items-center gap-2 text-[11px] flex-wrap"
          style={{ color: T.textMuted }}
        >
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
          <span
            className="font-medium"
            style={{ color: dueColor }}
          >
            {due.label}
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

      {/* Assignee stack (avatars + external chips) */}
      {visibleAssignees.length > 0 && (
        <div
          className="flex -space-x-1.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {visibleAssignees.map((a) =>
            a.user ? (
              <UserAvatar
                key={a.id}
                src={a.user.avatar}
                name={a.user.name}
                userId={a.user.id}
                size={24}
              />
            ) : (
              <ExternalAssigneeChip key={a.id} name={a.externalName ?? ""} size={24} />
            ),
          )}
          {extraAssignees > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full h-6 w-6 text-[9px] font-bold"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textMuted,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              +{extraAssignees}
            </span>
          )}
        </div>
      )}

      {/* Timer + done quick actions */}
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
          className="rounded-md p-1.5 disabled:opacity-50 hidden sm:inline-flex"
          style={{ backgroundColor: T.successSoft, color: T.success }}
          title="Завершити"
        >
          <CheckCircle2 size={12} />
        </button>
      </div>
    </li>
  );
}
