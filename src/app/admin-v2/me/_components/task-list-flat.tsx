"use client";

import {
  CheckCircle2,
  ExternalLink,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { TaskItem } from "./use-me-tasks";
import { isOverdue, PRIORITY_COLOR } from "./use-me-tasks";

export function TaskListFlat({
  tasks,
  loading,
  activeTimerTaskId,
  pendingId,
  focus,
  onOpenDrawer,
  onStartTimer,
  onStopTimer,
  onMarkDone,
  onDelete,
}: {
  tasks: TaskItem[];
  loading: boolean;
  activeTimerTaskId: string | null;
  pendingId: string | null;
  focus: string;
  onOpenDrawer: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onMarkDone: (task: TaskItem) => void;
  onDelete: (taskId: string, title: string) => void;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <h3 className="mb-3 text-[13px] font-bold" style={{ color: T.textPrimary }}>
        {loading ? "Завантаження…" : `Задачі (${tasks.length})`}
      </h3>
      {loading && tasks.length === 0 ? (
        <ul className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-11 rounded-xl animate-pulse"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
                opacity: 0.6,
              }}
            />
          ))}
        </ul>
      ) : tasks.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 py-8"
          style={{ color: T.textMuted }}
        >
          <CheckCircle2 size={28} style={{ color: T.success }} />
          <p className="text-sm font-semibold" style={{ color: T.textSecondary }}>
            Все прозоро — задач немає
          </p>
          <p className="text-[11px] text-center max-w-xs">
            {focus === "all"
              ? "Немає задач у цій категорії. Створіть нову через кнопку «Нова задача» вгорі."
              : "Немає задач за обраним фокусом. Змініть фільтр або створіть нову задачу."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              isTimerActive={activeTimerTaskId === t.id}
              pending={pendingId === t.id}
              onOpen={() => onOpenDrawer(t.id)}
              onStartTimer={() => onStartTimer(t.id)}
              onStopTimer={onStopTimer}
              onMarkDone={() => onMarkDone(t)}
              onDelete={() => onDelete(t.id, t.title)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function TaskRow({
  task,
  isTimerActive,
  pending,
  onOpen,
  onStartTimer,
  onStopTimer,
  onMarkDone,
  onDelete,
}: {
  task: TaskItem;
  isTimerActive: boolean;
  pending: boolean;
  onOpen: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onMarkDone: () => void;
  onDelete: () => void;
}) {
  const overdue = isOverdue(task);
  const isUrgent = task.priority === "URGENT";
  const highlight = overdue || isUrgent;
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:brightness-95"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${isTimerActive ? T.accentPrimary : highlight ? "#ef4444" : T.borderSoft}`,
        borderLeft: highlight ? "3px solid #ef4444" : undefined,
      }}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${highlight ? "animate-pulse" : ""}`}
        style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
      />
      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm truncate" style={{ color: T.textPrimary }}>
          {task.title}
        </div>
        <div
          className="text-[10px] truncate flex items-center gap-1"
          style={{ color: T.textMuted }}
        >
          <ExternalLink size={10} />
          {task.project.title}
        </div>
      </button>
      {task.dueDate && (
        <span
          className="text-[10px] font-semibold flex-shrink-0"
          style={{ color: overdue ? "#ef4444" : T.textMuted }}
        >
          {new Date(task.dueDate).toLocaleDateString("uk-UA")}
        </span>
      )}
      <span
        className="rounded-full px-2 py-0.5 text-[9px] font-bold flex-shrink-0"
        style={{
          backgroundColor: task.status.color + "22",
          color: task.status.color,
        }}
      >
        {task.status.name}
      </span>
      <div className="flex gap-1 flex-shrink-0">
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
            style={{
              backgroundColor: T.accentPrimarySoft,
              color: T.accentPrimary,
            }}
          >
            <Play size={12} />
          </button>
        )}
        {!task.status.isDone && (
          <button
            onClick={onMarkDone}
            disabled={pending}
            title="Позначити виконаною"
            className="rounded-md p-1.5 disabled:opacity-50"
            style={{ backgroundColor: "#10b98122", color: "#10b981" }}
          >
            <CheckCircle2 size={12} />
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={pending}
          title="Видалити задачу"
          className="rounded-md p-1.5 disabled:opacity-50"
          style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </li>
  );
}
