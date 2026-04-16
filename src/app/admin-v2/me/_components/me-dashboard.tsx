"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { STAGE_LABELS } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Bell,
  ListChecks,
  ExternalLink,
  Play,
  Square,
  Zap,
  CalendarDays,
  Plus,
  X,
  Loader2,
} from "lucide-react";

type TaskStatus = {
  id: string;
  name: string;
  color: string;
  isDone: boolean;
};

type TaskItem = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  project: { id: string; title: string };
  status: TaskStatus;
  stage: { stage: string };
  labels: { label: { id: string; name: string; color: string } }[];
  _count: { checklist: number; subtasks: number };
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  relatedEntity: string;
  relatedId: string;
};

type Dashboard = {
  counts: {
    assigned: number;
    overdue: number;
    dueToday: number;
    completed: number;
    unread: number;
  };
  upcoming: TaskItem[];
  recent: NotificationItem[];
};

type ActiveTimer = {
  id: string;
  startedAt: string;
  task: { id: string; title: string; project: { id: string; title: string } };
};

const PRIORITY_COLOR: Record<TaskItem["priority"], string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

type Scope = "assigned" | "created" | "watching" | "all";
type Focus = "all" | "overdue" | "today" | "next";

const FOCUS_DEFS: { id: Focus; label: string; icon: typeof AlertTriangle }[] = [
  { id: "all", label: "Всі", icon: ListChecks },
  { id: "overdue", label: "Прострочено", icon: AlertTriangle },
  { id: "today", label: "Сьогодні", icon: Clock },
  { id: "next", label: "Далі", icon: CalendarDays },
];

function isOverdue(t: TaskItem): boolean {
  return Boolean(t.dueDate && new Date(t.dueDate) < new Date() && !t.status.isDone);
}

function isDueToday(t: TaskItem): boolean {
  if (!t.dueDate) return false;
  const d = new Date(t.dueDate);
  const now = new Date();
  return (
    !t.status.isDone &&
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function MeDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [scope, setScope] = useState<Scope>("assigned");
  const [focus, setFocus] = useState<Focus>("all");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, tRes, timerRes] = await Promise.all([
        fetch(`/api/admin/me/dashboard`),
        fetch(`/api/admin/me/tasks?scope=${scope}&includeCompleted=${includeCompleted}`),
        fetch(`/api/admin/time/timer/current`),
      ]);
      if (dRes.ok) setDashboard((await dRes.json()).data);
      if (tRes.ok) setTasks((await tRes.json()).data.items ?? []);
      if (timerRes.ok) setActiveTimer((await timerRes.json()).data ?? null);
    } finally {
      setLoading(false);
    }
  }, [scope, includeCompleted]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTasks = useMemo(() => {
    switch (focus) {
      case "overdue":
        return tasks.filter(isOverdue);
      case "today":
        return tasks.filter(isDueToday);
      case "next":
        return tasks
          .filter((t) => !t.status.isDone && t.dueDate)
          .sort(
            (a, b) =>
              new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
          )
          .slice(0, 10);
      default:
        return tasks;
    }
  }, [tasks, focus]);

  const startTimer = async (taskId: string) => {
    setPendingId(taskId);
    try {
      await fetch("/api/admin/time/timer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      window.dispatchEvent(new Event("timer:refresh"));
      await load();
    } finally {
      setPendingId(null);
    }
  };

  const stopTimer = async () => {
    setPendingId("__stop__");
    try {
      await fetch("/api/admin/time/timer/stop", { method: "POST" });
      window.dispatchEvent(new Event("timer:refresh"));
      await load();
    } finally {
      setPendingId(null);
    }
  };

  const markDone = async (task: TaskItem) => {
    // Fetch statuses for this project, pick a status where isDone=true, PATCH task
    setPendingId(task.id);
    try {
      const r = await fetch(
        `/api/admin/projects/${task.project.id}/statuses`,
      );
      if (!r.ok) return;
      const statuses = (await r.json()).data as TaskStatus[];
      const done = statuses.find((s) => s.isDone);
      if (!done) return;
      await fetch(`/api/admin/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: done.id }),
      });
      await load();
    } finally {
      setPendingId(null);
    }
  };

  const counts = dashboard?.counts;

  return (
    <div className="flex flex-col gap-5">
      {/* Header with New Task button */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          ОСОБИСТИЙ ДАШБОРД
        </span>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
        >
          <Plus size={14} />
          Нова задача
        </button>
      </div>

      {/* Focus banner — active timer OR first overdue/today task */}
      <FocusBanner
        activeTimer={activeTimer}
        nextTask={
          tasks.filter(isOverdue)[0] ??
          tasks.filter(isDueToday)[0] ??
          dashboard?.upcoming?.[0] ??
          null
        }
        onStop={() => void stopTimer()}
        onStart={(id) => void startTimer(id)}
        stopping={pendingId === "__stop__"}
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile
          label="Активних"
          value={counts?.assigned ?? 0}
          icon={<ListChecks size={16} />}
          color={T.accentPrimary}
          onClick={() => setFocus("all")}
        />
        <Tile
          label="Прострочено"
          value={counts?.overdue ?? 0}
          icon={<AlertTriangle size={16} />}
          color="#ef4444"
          onClick={() => setFocus("overdue")}
        />
        <Tile
          label="Сьогодні"
          value={counts?.dueToday ?? 0}
          icon={<Clock size={16} />}
          color="#f59e0b"
          onClick={() => setFocus("today")}
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

      {/* Focus filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {FOCUS_DEFS.map((f) => {
            const Icon = f.icon;
            const active = focus === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFocus(f.id)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textMuted,
                }}
              >
                <Icon size={12} />
                {f.label}
              </button>
            );
          })}
        </div>

        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {(
            [
              { id: "assigned", label: "Призначені мені" },
              { id: "created", label: "Створені мною" },
              { id: "watching", label: "Стежу" },
              { id: "all", label: "Всі мої" },
            ] as { id: Scope; label: string }[]
          ).map((s) => {
            const active = scope === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textMuted,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <label
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textMuted,
          }}
        >
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(e) => setIncludeCompleted(e.target.checked)}
          />
          Показати завершені
        </label>
      </div>

      {/* Tasks list */}
      <section
        className="rounded-2xl p-4"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <h3
          className="mb-3 text-[13px] font-bold"
          style={{ color: T.textPrimary }}
        >
          {loading ? "Завантаження…" : `Задачі (${filteredTasks.length})`}
        </h3>
        {filteredTasks.length === 0 && !loading ? (
          <p className="text-[12px]" style={{ color: T.textMuted }}>
            {focus === "all"
              ? "Немає задач у цій категорії"
              : "Немає задач за обраним фокусом"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {filteredTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                isTimerActive={activeTimer?.task.id === t.id}
                pending={pendingId === t.id}
                onStartTimer={() => void startTimer(t.id)}
                onStopTimer={() => void stopTimer()}
                onMarkDone={() => void markDone(t)}
              />
            ))}
          </ul>
        )}
      </section>

      {createOpen && (
        <NewTaskModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function FocusBanner({
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
          <Link
            href={`/admin-v2/projects/${activeTimer.task.project.id}?tab=tasks`}
            className="text-[14px] font-semibold truncate block"
            style={{ color: T.textPrimary }}
          >
            {activeTimer.task.title}
          </Link>
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
          <Link
            href={`/admin-v2/projects/${nextTask.project.id}?tab=tasks`}
            className="text-[14px] font-semibold truncate block"
            style={{ color: T.textPrimary }}
          >
            {nextTask.title}
          </Link>
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

function TaskRow({
  task,
  isTimerActive,
  pending,
  onStartTimer,
  onStopTimer,
  onMarkDone,
}: {
  task: TaskItem;
  isTimerActive: boolean;
  pending: boolean;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onMarkDone: () => void;
}) {
  const overdue = isOverdue(task);
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:brightness-110"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${isTimerActive ? T.accentPrimary : overdue ? "#ef4444" : T.borderSoft}`,
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
      />
      <Link
        href={`/admin-v2/projects/${task.project.id}?tab=tasks`}
        className="flex-1 min-w-0"
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
      </Link>
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
      {/* Quick actions */}
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
            style={{
              backgroundColor: "#10b98122",
              color: "#10b981",
            }}
          >
            <CheckCircle2 size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

function Tile({
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
      className="flex flex-col gap-1 rounded-xl px-3 py-3 text-left transition hover:brightness-110 disabled:cursor-default"
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

type MyProject = {
  id: string;
  title: string;
  currentStage: string;
  stages: { id: string; stage: ProjectStage; status: string }[];
};

function NewTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [stageId, setStageId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [assignToMe, setAssignToMe] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/me/projects");
        if (r.ok) {
          const j = await r.json();
          const items = (j.data ?? []) as MyProject[];
          setProjects(items);
          if (items.length > 0) {
            const first = items[0]!;
            setProjectId(first.id);
            // Pick the stage matching currentStage, or the first one
            const currentStageRecord =
              first.stages.find((s) => s.stage === first.currentStage) ??
              first.stages[0];
            if (currentStageRecord) setStageId(currentStageRecord.id);
          }
        }
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!selectedProject) return;
    const currentStageRecord =
      selectedProject.stages.find((s) => s.stage === selectedProject.currentStage) ??
      selectedProject.stages[0];
    if (currentStageRecord) setStageId(currentStageRecord.id);
  }, [selectedProject]);

  const submit = async () => {
    if (!projectId || !stageId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const assigneeIds = assignToMe && currentUserId ? [currentUserId] : [];
      const res = await fetch(`/api/admin/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          stageId,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Не вдалося створити задачу");
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mt-10 rounded-2xl p-5 flex flex-col gap-4"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Нова задача
          </h2>
          <button onClick={onClose} style={{ color: T.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {loadingProjects ? (
          <p className="text-sm text-center py-6" style={{ color: T.textMuted }}>
            Завантаження проєктів…
          </p>
        ) : projects.length === 0 ? (
          <p className="text-sm py-6" style={{ color: T.textMuted }}>
            У вас немає проєктів, де ви маєте право створювати задачі. Зверніться до
            адміністратора, щоб додав вас учасником проєкту.
          </p>
        ) : (
          <>
            <Field label="ПРОЄКТ">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>

            {selectedProject && (
              <Field label="СТАДІЯ">
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {selectedProject.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {STAGE_LABELS[s.stage as ProjectStage]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="НАЗВА">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Коротко опишіть задачу…"
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </Field>

            <Field label="ОПИС (необовʼязково)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={inputStyle}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ПРІОРИТЕТ">
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as typeof priority)
                  }
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="LOW">Низький</option>
                  <option value="NORMAL">Нормальний</option>
                  <option value="HIGH">Високий</option>
                  <option value="URGENT">Терміновий</option>
                </select>
              </Field>
              <Field label="ДЕДЛАЙН">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </Field>
            </div>

            <label
              className="flex items-center gap-2 text-xs"
              style={{ color: T.textSecondary }}
            >
              <input
                type="checkbox"
                checked={assignToMe}
                onChange={(e) => setAssignToMe(e.target.checked)}
              />
              Призначити мені
            </label>

            {error && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                Скасувати
              </button>
              <button
                onClick={() => void submit()}
                disabled={saving || !title.trim() || !projectId || !stageId}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Створити
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: T.panelElevated,
  color: T.textPrimary,
  border: `1px solid ${T.borderSoft}`,
};
