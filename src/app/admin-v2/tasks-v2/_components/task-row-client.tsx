"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  toggleTaskDoneAction,
  cycleTaskPriorityAction,
} from "../actions";

export type ClientTaskRow = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  estimatedHours: number;
  actualHours: number;
  status: { id: string; name: string; color: string | null; isDone: boolean } | null;
  project: { id: string; title: string; slug: string };
  assignees: Array<{
    user: { id: string; name: string | null; avatar: string | null } | null;
  }>;
  checklistCount: number;
  attachmentCount: number;
};

export function InteractiveTaskRow({
  task,
  isLast,
}: {
  task: ClientTaskRow;
  isLast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic local state
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);
  const [optimisticPriority, setOptimisticPriority] = useState<string | null>(
    null,
  );

  const effectiveDone = optimisticDone ?? task.status?.isDone ?? !!task.completedAt;
  const effectivePriority = optimisticPriority ?? task.priority;

  const handleToggleDone = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const target = !effectiveDone;
    setOptimisticDone(target);
    setError(null);
    startTransition(async () => {
      const result = await toggleTaskDoneAction(task.id);
      if (!result.ok) {
        setOptimisticDone(null);
        setError(result.error);
        setTimeout(() => setError(null), 3000);
      } else {
        // Hard refresh to pick up server-rendered state
        router.refresh();
      }
    });
  };

  const handleCyclePriority = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const PRIORITY_CYCLE = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
    const idx = PRIORITY_CYCLE.indexOf(
      effectivePriority as (typeof PRIORITY_CYCLE)[number],
    );
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
    setOptimisticPriority(next);
    setError(null);
    startTransition(async () => {
      const result = await cycleTaskPriorityAction(
        task.id,
        effectivePriority as (typeof PRIORITY_CYCLE)[number],
      );
      if (!result.ok) {
        setOptimisticPriority(null);
        setError(result.error);
        setTimeout(() => setError(null), 3000);
      } else {
        router.refresh();
      }
    });
  };

  const now = new Date();
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const dueTier = getDueTier(dueDate, effectiveDone);
  const prio = PRIORITY_MAP[effectivePriority] ?? PRIORITY_MAP.NORMAL;
  const estimated = task.estimatedHours;
  const actual = task.actualHours;

  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
        opacity: effectiveDone ? 0.55 : 1,
        transition: "opacity 150ms",
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[28px_3px_1fr_160px_140px_120px_20px] items-center gap-3 px-5 py-3 relative">
        {/* Checkbox — interactive */}
        <button
          type="button"
          onClick={handleToggleDone}
          disabled={pending}
          className="flex h-5 w-5 items-center justify-center rounded transition hover:brightness-110 disabled:opacity-50"
          style={{
            backgroundColor: effectiveDone ? T.success : "transparent",
            border: `2px solid ${effectiveDone ? T.success : T.borderSoft}`,
            cursor: pending ? "wait" : "pointer",
          }}
          title={effectiveDone ? "Зняти позначку «виконано»" : "Позначити виконано"}
          aria-label={
            effectiveDone ? "Зняти позначку «виконано»" : "Позначити виконано"
          }
        >
          {pending ? (
            <Loader2 size={12} className="animate-spin" style={{ color: "#FFFFFF" }} />
          ) : effectiveDone ? (
            <CheckCircle2 size={12} style={{ color: "#FFFFFF" }} />
          ) : null}
        </button>

        {/* Priority accent stripe — interactive */}
        <button
          type="button"
          onClick={handleCyclePriority}
          disabled={pending}
          className="hidden md:flex w-[3px] h-7 rounded-full transition hover:brightness-110 disabled:opacity-50"
          style={{
            backgroundColor: prio.color,
            cursor: pending ? "wait" : "pointer",
          }}
          title={`Priority: ${effectivePriority} (клік — змінити)`}
          aria-label={`Priority: ${effectivePriority}, click to cycle`}
        />

        <Link
          href={`/admin-v2/projects/${task.project.id}?tab=tasks&taskId=${task.id}`}
          className="min-w-0 grid grid-cols-1 sm:contents transition hover:brightness-95"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCyclePriority}
                disabled={pending}
                className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider transition hover:brightness-110 disabled:opacity-50"
                style={{
                  backgroundColor: prio.bg,
                  color: prio.color,
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                {effectivePriority}
              </button>
              <span
                className="text-[10px] font-bold tracking-wider tabular-nums truncate"
                style={{ color: T.accentPrimary }}
              >
                PRJ-{task.project.slug.toUpperCase().slice(0, 8)}
              </span>
              {task.status && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: task.status.color
                      ? `${task.status.color}22`
                      : T.panelSoft,
                    color: task.status.color ?? T.textSecondary,
                  }}
                >
                  {task.status.name}
                </span>
              )}
            </div>
            <div
              className="text-[13px] font-semibold mt-0.5 truncate"
              style={{
                color: T.textPrimary,
                textDecoration: effectiveDone ? "line-through" : "none",
              }}
              title={task.title}
            >
              {task.title}
            </div>
            <div
              className="text-[11px] mt-0.5 truncate"
              style={{ color: T.textMuted }}
            >
              {task.project.title}
              {task.checklistCount > 0 && ` · ${task.checklistCount} підзадач`}
              {task.attachmentCount > 0 && ` · 📎 ${task.attachmentCount}`}
            </div>
          </div>
        </Link>

        <div>
          {dueTier ? (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ backgroundColor: dueTier.bg, color: dueTier.fg }}
            >
              <dueTier.icon size={11} />
              {dueTier.label}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без дедлайну
            </span>
          )}
        </div>

        <div>
          {task.assignees.length > 0 ? (
            <div className="flex items-center gap-1">
              <AvatarStack assignees={task.assignees} />
              {task.assignees.length === 1 && task.assignees[0].user?.name && (
                <span
                  className="text-[11px] font-semibold truncate"
                  style={{ color: T.textSecondary }}
                >
                  {task.assignees[0].user.name}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              не призначено
            </span>
          )}
        </div>

        <div className="text-right">
          {estimated > 0 ? (
            <>
              <div
                className="text-[12px] font-bold tabular-nums"
                style={{
                  color:
                    actual > estimated
                      ? T.danger
                      : actual > estimated * 0.8
                        ? T.warning
                        : T.textPrimary,
                }}
              >
                {actual.toFixed(1)} / {estimated.toFixed(0)}
              </div>
              <div className="text-[10px]" style={{ color: T.textMuted }}>
                год
              </div>
            </>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              —
            </span>
          )}
        </div>

        <ChevronRight
          size={14}
          style={{ color: T.textMuted }}
          className="hidden md:block"
        />

        {/* Error toast */}
        {error && (
          <div
            className="absolute top-1 right-12 z-10 rounded-md px-2 py-1 text-[10px] font-semibold shadow-md animate-in slide-in-from-top-2"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}`,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </li>
  );
}

function AvatarStack({
  assignees,
}: {
  assignees: ClientTaskRow["assignees"];
}) {
  const visible = assignees.slice(0, 3);
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((a, i) => (
        <div
          key={a.user?.id ?? `idx-${i}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
            color: "#FFFFFF",
            border: `2px solid ${T.panel}`,
          }}
          title={a.user?.name ?? ""}
        >
          {(a.user?.name ?? "?")
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </div>
      ))}
      {assignees.length > 3 && (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold"
          style={{
            backgroundColor: T.panelSoft,
            color: T.textSecondary,
            border: `2px solid ${T.panel}`,
          }}
        >
          +{assignees.length - 3}
        </div>
      )}
    </div>
  );
}

const PRIORITY_MAP: Record<string, { bg: string; color: string }> = {
  URGENT: { bg: T.dangerSoft, color: T.danger },
  HIGH: { bg: T.warningSoft, color: T.warning },
  NORMAL: { bg: T.accentPrimarySoft, color: T.accentPrimary },
  LOW: { bg: T.panelSoft, color: T.textMuted },
};

const AVATAR_COLORS = [T.violet, T.sky, T.accentPrimary, T.amber, T.emerald, T.rose];

function getDueTier(
  due: Date | null,
  isDone: boolean,
): { bg: string; fg: string; icon: typeof Clock; label: string } | null {
  if (!due) return null;
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (isDone) {
    return { bg: T.successSoft, fg: T.success, icon: CheckCircle2, label: "виконано" };
  }
  if (days < 0) {
    return {
      bg: T.dangerSoft,
      fg: T.danger,
      icon: AlertOctagon,
      label: `${Math.abs(days)} дн просрочки`,
    };
  }
  if (days === 0) {
    return { bg: T.warningSoft, fg: T.warning, icon: AlertTriangle, label: "сьогодні" };
  }
  if (days <= 3) {
    return { bg: T.warningSoft, fg: T.warning, icon: Clock, label: `${days} дн` };
  }
  if (days <= 14) {
    return { bg: T.skySoft, fg: T.sky, icon: Clock, label: `${days} дн` };
  }
  return { bg: T.panelSoft, fg: T.textMuted, icon: Calendar, label: `${days} дн` };
}
