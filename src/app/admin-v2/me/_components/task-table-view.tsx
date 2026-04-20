"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Play,
  Square,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { TaskItem } from "./use-me-tasks";
import { isOverdue, PRIORITY_COLOR } from "./use-me-tasks";

const PRIORITY_LABEL: Record<TaskItem["priority"], string> = {
  LOW: "Низький",
  NORMAL: "Нормальний",
  HIGH: "Високий",
  URGENT: "Терміновий",
};

type Props = {
  tasks: TaskItem[];
  loading: boolean;
  activeTimerTaskId: string | null;
  pendingId: string | null;
  onOpenDrawer: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onMarkDone: (task: TaskItem) => void;
};

export function TaskTableView({
  tasks,
  loading,
  activeTimerTaskId,
  pendingId,
  onOpenDrawer,
  onStartTimer,
  onStopTimer,
  onMarkDone,
}: Props) {
  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, { project: TaskItem["project"]; tasks: TaskItem[] }>();
    for (const t of tasks) {
      const key = t.project.id;
      if (!map.has(key)) map.set(key, { project: t.project, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    return Array.from(map.values());
  }, [tasks]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (projectId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  if (loading) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-[13px]"
        style={{ backgroundColor: T.panel, border: "1px solid " + T.borderSoft, color: T.textMuted }}
      >
        Завантаження задач…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-[13px]"
        style={{ backgroundColor: T.panel, border: "1px solid " + T.borderSoft, color: T.textMuted }}
      >
        Немає задач
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: "1px solid " + T.borderSoft }}
    >
      {/* Table header */}
      <div
        className="grid items-center gap-3 px-4 py-2.5"
        style={{
          gridTemplateColumns: "16px 1fr 140px 100px 120px 100px 90px 72px",
          borderBottom: "1px solid " + T.borderSoft,
          backgroundColor: T.panelElevated,
        }}
      >
        <span />
        <HeaderCell>Задача</HeaderCell>
        <HeaderCell className="hidden md:block">Проєкт</HeaderCell>
        <HeaderCell>Виконавці</HeaderCell>
        <HeaderCell className="hidden lg:block">Мітки</HeaderCell>
        <HeaderCell>Статус</HeaderCell>
        <HeaderCell>Дата</HeaderCell>
        <HeaderCell />
      </div>

      {/* Grouped rows */}
      {grouped.map((group) => {
        const isCollapsed = collapsed.has(group.project.id);
        const doneCount = group.tasks.filter((t) => t.status.isDone).length;

        return (
          <div key={group.project.id}>
            {/* Project group header */}
            <button
              onClick={() => toggleCollapse(group.project.id)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left transition hover:brightness-[0.97]"
              style={{
                backgroundColor: T.accentPrimarySoft,
                borderBottom: "1px solid " + T.borderSoft,
              }}
            >
              {isCollapsed ? (
                <ChevronRight size={14} style={{ color: T.accentPrimary }} />
              ) : (
                <ChevronDown size={14} style={{ color: T.accentPrimary }} />
              )}
              <span className="text-[13px] font-bold" style={{ color: T.accentPrimary }}>
                {group.project.title}
              </span>
              <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>
                {doneCount}/{group.tasks.length}
              </span>
              {/* Mini progress bar */}
              <div
                className="h-1 flex-1 max-w-[80px] rounded-full overflow-hidden"
                style={{ backgroundColor: T.borderSoft }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: (group.tasks.length > 0 ? (doneCount / group.tasks.length) * 100 : 0) + "%",
                    backgroundColor: T.success,
                  }}
                />
              </div>
            </button>

            {/* Task rows */}
            {!isCollapsed &&
              group.tasks.map((task, i) => (
                <TaskTableRow
                  key={task.id}
                  task={task}
                  odd={i % 2 === 1}
                  isTimerActive={activeTimerTaskId === task.id}
                  pending={pendingId === task.id}
                  onOpen={() => onOpenDrawer(task.id)}
                  onStartTimer={() => onStartTimer(task.id)}
                  onStopTimer={onStopTimer}
                  onMarkDone={() => onMarkDone(task)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

function HeaderCell({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={"text-[10px] font-bold tracking-wider uppercase " + className}
      style={{ color: T.textMuted }}
    >
      {children}
    </span>
  );
}

function TaskTableRow({
  task,
  odd,
  isTimerActive,
  pending,
  onOpen,
  onStartTimer,
  onStopTimer,
  onMarkDone,
}: {
  task: TaskItem;
  odd: boolean;
  isTimerActive: boolean;
  pending: boolean;
  onOpen: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onMarkDone: () => void;
}) {
  const overdue = isOverdue(task);

  return (
    <div
      className="grid items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
      style={{
        gridTemplateColumns: "16px 1fr 140px 100px 120px 100px 90px 72px",
        backgroundColor: isTimerActive
          ? T.accentPrimarySoft
          : odd
          ? T.panelSoft
          : T.panel,
        borderBottom: "1px solid " + T.borderSoft,
        borderLeft: isTimerActive ? "3px solid " + T.accentPrimary : overdue ? "3px solid #ef4444" : "3px solid transparent",
      }}
      onClick={onOpen}
    >
      {/* Priority dot */}
      <span
        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
        title={PRIORITY_LABEL[task.priority]}
        style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
      />

      {/* Title */}
      <span
        className="text-[13px] truncate font-medium"
        style={{
          color: task.status.isDone ? T.textMuted : T.textPrimary,
          textDecoration: task.status.isDone ? "line-through" : undefined,
        }}
      >
        {task.title}
        {task._count.subtasks > 0 && (
          <span className="ml-1.5 text-[10px] font-normal" style={{ color: T.textMuted }}>
            ({task._count.subtasks})
          </span>
        )}
      </span>

      {/* Project (hidden on mobile) */}
      <span
        className="text-[11px] truncate hidden md:block"
        style={{ color: T.textMuted }}
      >
        {task.project.title}
      </span>

      {/* Assignees */}
      <div className="flex -space-x-1.5" onClick={(e) => e.stopPropagation()}>
        {(task.assignees || []).slice(0, 3).map((a) => (
          <UserAvatar key={a.user.id} src={a.user.avatar} name={a.user.name} userId={a.user.id} size={24} />
        ))}
        {(task.assignees || []).length > 3 && (
          <span
            className="inline-flex items-center justify-center rounded-full h-6 w-6 text-[9px] font-bold"
            style={{ backgroundColor: T.panelElevated, color: T.textMuted, border: "1px solid " + T.borderSoft }}
          >
            +{(task.assignees || []).length - 3}
          </span>
        )}
        {(!task.assignees || task.assignees.length === 0) && (
          <span className="text-[10px]" style={{ color: T.textMuted }}>—</span>
        )}
      </div>

      {/* Labels (hidden on small screens) */}
      <div className="flex gap-1 overflow-hidden hidden lg:flex">
        {task.labels.slice(0, 2).map((l) => (
          <span
            key={l.label.id}
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold truncate max-w-[52px]"
            style={{
              backgroundColor: l.label.color + "20",
              color: l.label.color,
            }}
          >
            {l.label.name}
          </span>
        ))}
        {task.labels.length > 2 && (
          <span className="text-[9px] font-medium" style={{ color: T.textMuted }}>
            +{task.labels.length - 2}
          </span>
        )}
      </div>

      {/* Status badge */}
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-bold truncate text-center"
        style={{
          backgroundColor: task.status.color + "20",
          color: task.status.color,
        }}
      >
        {task.status.name}
      </span>

      {/* Due date */}
      <span
        className="text-[11px] font-medium flex-shrink-0"
        style={{ color: overdue ? "#ef4444" : T.textMuted }}
      >
        {task.dueDate
          ? new Date(task.dueDate).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })
          : "—"}
      </span>

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {isTimerActive ? (
          <button
            onClick={onStopTimer}
            disabled={pending}
            title="Зупинити таймер"
            className="rounded-md p-1.5 disabled:opacity-50"
            style={{ backgroundColor: "#ef4444", color: "#fff" }}
          >
            <Square size={12} />
          </button>
        ) : (
          <button
            onClick={onStartTimer}
            disabled={pending || task.status.isDone}
            title="Старт таймера"
            className="rounded-md p-1.5 disabled:opacity-30"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            <Play size={12} />
          </button>
        )}
        {!task.status.isDone && (
          <button
            onClick={onMarkDone}
            disabled={pending}
            title="Виконано"
            className="rounded-md p-1.5 disabled:opacity-50"
            style={{ backgroundColor: "#10b98122", color: "#10b981" }}
          >
            <CheckCircle2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
