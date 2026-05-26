"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { stageDisplayName } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import {
  Plus,
  X,
  List,
  Columns,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  Download,
  GanttChartSquare,
  Loader2,
  CheckCircle2,
  Circle,
  Link2,
  Clock,
  Square,
  Play,
  Trash2,
} from "lucide-react";
import { TaskKanban, type KanbanCard, type KanbanStatus } from "./task-kanban";
import { TaskCalendar } from "./task-calendar";
import { TaskPeopleView } from "./task-people";
// Gantt is heavy (frappe-gantt + vendor CSS) and only mounted when the
// "gantt" tab is selected — defer the bundle.
const TaskGantt = dynamic(() => import("./task-gantt").then((m) => m.TaskGantt), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-lg bg-t-panel-soft" />
  ),
});
import { useProjectRealtime } from "@/hooks/useProjectRealtime";
import { useDrillDown } from "@/components/drawer/use-drill-down";
import { TASK_UPDATED_EVENT } from "@/components/drawer/renderers/TaskDrawerContent";

type StageLite = {
  id: string;
  stage: ProjectStage | null;
  customName?: string | null;
};

type TaskStatus = {
  id: string;
  name: string;
  color: string;
  isDone: boolean;
  position: number;
};

type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

type TaskListItem = {
  id: string;
  title: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate: string | null;
  stageId: string;
  statusId: string;
  status: TaskStatus;
  assignees: { user: { id: string; name: string; avatar: string | null } }[];
  labels: { label: TaskLabel }[];
  _count: { subtasks: number; checklist: number };
};

const PRIORITY_COLOR: Record<TaskListItem["priority"], string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

type ViewMode = "list" | "kanban" | "gantt" | "calendar" | "people";

const VIEW_DEFS: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: "list", label: "Список", icon: List },
  { id: "kanban", label: "Kanban", icon: Columns },
  { id: "gantt", label: "Gantt", icon: GanttChartSquare },
  { id: "calendar", label: "Календар", icon: CalendarIcon },
  { id: "people", label: "По людях", icon: UsersIcon },
];

export function TabTasks({
  projectId,
  stages,
}: {
  projectId: string;
  stages: StageLite[];
}) {
  const [view, setView] = useState<ViewMode>("list");
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [labels, setLabels] = useState<TaskLabel[]>([]);
  const [gantt, setGantt] = useState<{
    items: {
      id: string;
      name: string;
      start: string;
      end: string;
      progress: number;
      dependencies: string;
      custom_class?: string;
    }[];
    criticalIds: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickStageId, setQuickStageId] = useState(stages[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const drawer = useDrillDown();
  const openTask = useCallback(
    (id: string) => drawer.open({ type: "task", id }),
    [drawer],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadedCount(0);
    setTruncated(false);
    setError(null);
    const PAGE_SIZE = 200;
    const MAX_PAGES = 50; // hard safety cap = 10 000 tasks
    try {
      const [firstTasksRes, statusesRes, labelsRes] = await Promise.all([
        fetch(`/api/admin/projects/${projectId}/tasks?take=${PAGE_SIZE}`),
        fetch(`/api/admin/projects/${projectId}/statuses`),
        fetch(`/api/admin/projects/${projectId}/labels`),
      ]);
      if (firstTasksRes.status === 404) {
        setError("Модуль задач вимкнений для цього проєкту");
        setTasks([]);
        return;
      }
      if (!firstTasksRes.ok || !statusesRes.ok || !labelsRes.ok) {
        throw new Error("Не вдалось завантажити дані");
      }

      const firstJson = await firstTasksRes.json();
      const collected: TaskListItem[] = firstJson.data?.items ?? [];
      let nextCursor: string | null = firstJson.data?.nextCursor ?? null;
      setLoadedCount(collected.length);

      for (let page = 1; page < MAX_PAGES && nextCursor; page++) {
        const res = await fetch(
          `/api/admin/projects/${projectId}/tasks?take=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        );
        if (!res.ok) break;
        const json = await res.json();
        const items: TaskListItem[] = json.data?.items ?? [];
        collected.push(...items);
        nextCursor = json.data?.nextCursor ?? null;
        setLoadedCount(collected.length);
      }
      if (nextCursor) setTruncated(true);

      const statusesJson = await statusesRes.json();
      const labelsJson = await labelsRes.json();
      setTasks(collected);
      setStatuses(statusesJson.data ?? []);
      setLabels(labelsJson.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadGantt = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/gantt`);
      if (r.ok) {
        const j = await r.json();
        setGantt({ items: j.data.items, criticalIds: j.data.criticalIds });
      }
    } catch {}
  }, [projectId]);

  useEffect(() => {
    if (view === "gantt") void loadGantt();
  }, [view, loadGantt]);

  // Drawer (TaskDrawerContent) кидає `metrum:task-updated` після кожної мутації —
  // перезавантажуємо список і Gantt, щоб підхопити зміни.
  useEffect(() => {
    const handler = () => {
      void loadAll();
      if (view === "gantt") void loadGantt();
    };
    window.addEventListener(TASK_UPDATED_EVENT, handler);
    return () => window.removeEventListener(TASK_UPDATED_EVENT, handler);
  }, [loadAll, loadGantt, view]);

  // Real-time updates — refresh list when task events fire
  useProjectRealtime(projectId, (evt) => {
    if (
      evt.type === "task.created" ||
      evt.type === "task.updated" ||
      evt.type === "task.archived"
    ) {
      void loadAll();
      if (view === "gantt") void loadGantt();
    }
  });

  const tasksByStage = useMemo(() => {
    const map = new Map<string, TaskListItem[]>();
    for (const t of tasks) {
      const arr = map.get(t.stageId) ?? [];
      arr.push(t);
      map.set(t.stageId, arr);
    }
    return map;
  }, [tasks]);

  const createQuick = useCallback(async () => {
    if (!quickTitle.trim() || !quickStageId) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: quickTitle, stageId: quickStageId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Не вдалося створити задачу");
      }
      setQuickTitle("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setCreating(false);
    }
  }, [quickTitle, quickStageId, projectId, loadAll]);

  const moveCard = useCallback(
    async (cardId: string, statusId: string, position: number) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== cardId) return t;
          const newStatus = statuses.find((s) => s.id === statusId) ?? t.status;
          return { ...t, statusId, status: newStatus };
        }),
      );
      try {
        await fetch(`/api/admin/tasks/${cardId}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statusId, position }),
        });
      } catch {
        // Silent — server truth will be re-fetched
      }
    },
    [statuses],
  );

  const changeStatus = useCallback(
    async (taskId: string, statusId: string) => {
      const prevTasks = tasks;
      const newStatus = statuses.find((s) => s.id === statusId);
      if (!newStatus) return;
      setTasks((p) =>
        p.map((t) => (t.id === taskId ? { ...t, statusId, status: newStatus } : t)),
      );
      try {
        const res = await fetch(`/api/admin/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statusId }),
        });
        if (!res.ok) throw new Error("patch failed");
      } catch {
        setTasks(prevTasks);
      }
    },
    [tasks, statuses],
  );

  const kanbanStatuses: KanbanStatus[] = useMemo(
    () =>
      statuses.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        isDone: s.isDone,
        position: s.position,
      })),
    [statuses],
  );

  const kanbanCards: KanbanCard[] = useMemo(
    () =>
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        statusId: t.statusId,
        priority: t.priority,
        dueDate: t.dueDate,
        assignees: t.assignees,
        labels: t.labels,
        _count: t._count,
      })),
    [tasks],
  );

  if (error) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* View switcher + export */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {VIEW_DEFS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textMuted,
                }}
              >
                <Icon size={13} />
                {v.label}
              </button>
            );
          })}
        </div>
        <a
          href={`/api/admin/projects/${projectId}/tasks/export?format=xlsx`}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <Download size={13} />
          Excel
        </a>
      </div>

      {/* Quick create */}
      <div
        className="rounded-2xl p-4 flex flex-col sm:flex-row gap-2"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createQuick();
          }}
          placeholder="Назва нової задачі…"
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        />
        <select
          value={quickStageId}
          onChange={(e) => setQuickStageId(e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {stageDisplayName({ stage: s.stage, customName: s.customName ?? null })}
            </option>
          ))}
        </select>
        <button
          onClick={() => void createQuick()}
          disabled={creating || !quickTitle.trim() || !quickStageId}
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{
            backgroundColor: T.accentPrimary,
            color: "#fff",
          }}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Додати
        </button>
      </div>

      {/* Task count / truncation banner */}
      {!loading && tasks.length > 0 && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]"
          style={{ color: T.textMuted }}
        >
          <span>Задач: {tasks.length}</span>
          {truncated && (
            <span style={{ color: T.danger ?? "#ef4444" }}>
              Показано перші {tasks.length}. Звузьте фільтр статусом, щоб побачити решту.
            </span>
          )}
        </div>
      )}

      {/* View body */}
      {loading ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ color: T.textMuted }}>
          {loadedCount > 0
            ? `Завантажено ${loadedCount} задач…`
            : "Завантаження…"}
        </div>
      ) : view === "kanban" ? (
        <TaskKanban
          statuses={kanbanStatuses}
          cards={kanbanCards}
          onMove={(id, s, p) => void moveCard(id, s, p)}
          onOpen={openTask}
        />
      ) : view === "gantt" ? (
        gantt ? (
          <TaskGantt
            items={gantt.items}
            projectId={projectId}
            onTaskClick={openTask}
            onDateChange={async (id, start, end) => {
              // PUT /dates: snap-to-day + перевірка baseline lock на сервері.
              const res = await fetch(`/api/admin/tasks/${id}/dates`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  startDate: start.toISOString(),
                  dueDate: end.toISOString(),
                }),
              });
              if (res.status === 409) {
                const j = await res.json().catch(() => ({}));
                alert(j.message ?? "Baseline зафіксовано — розморозьте перш ніж рухати бар.");
              }
              void loadGantt();
            }}
          />
        ) : (
          <div
            className="rounded-2xl p-8 text-center text-sm"
            style={{ color: T.textMuted }}
          >
            Завантаження Gantt…
          </div>
        )
      ) : view === "calendar" ? (
        <TaskCalendar
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            status: { name: t.status.name, color: t.status.color },
            priority: t.priority,
          }))}
          onOpen={openTask}
        />
      ) : view === "people" ? (
        <TaskPeopleView
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            status: {
              name: t.status.name,
              color: t.status.color,
              isDone: t.status.isDone,
            },
            priority: t.priority,
            assignees: t.assignees,
          }))}
          onOpen={openTask}
        />
      ) : (
        // list
        stages.map((stage) => {
          const items = tasksByStage.get(stage.id) ?? [];
          return (
            <section
              key={stage.id}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3
                  className="text-[13px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {stageDisplayName({ stage: stage.stage, customName: stage.customName ?? null })}
                </h3>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: T.textMuted }}
                >
                  {items.length}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-[12px]" style={{ color: T.textMuted }}>
                  Немає задач
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      statuses={statuses}
                      onOpen={() => openTask(t.id)}
                      onChangeStatus={(sid) => void changeStatus(t.id, sid)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

    </div>
  );
}

function TaskRow({
  task,
  statuses,
  onOpen,
  onChangeStatus,
}: {
  task: TaskListItem;
  statuses: TaskStatus[];
  onOpen: () => void;
  onChangeStatus: (statusId: string) => void;
}) {
  return (
    <li
      onClick={onOpen}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition hover:brightness-95"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
        title={task.priority}
      />
      <span className="text-sm truncate flex-1" style={{ color: T.textPrimary }}>
        {task.title}
      </span>
      {task.labels.length > 0 && (
        <div className="flex gap-1 flex-shrink-0">
          {task.labels.slice(0, 3).map((l) => (
            <span
              key={l.label.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: l.label.color + "22",
                color: l.label.color,
              }}
            >
              {l.label.name}
            </span>
          ))}
        </div>
      )}
      <StatusPicker
        current={task.status}
        statuses={statuses}
        onChange={onChangeStatus}
      />
      {task._count.checklist > 0 && (
        <span
          className="text-[10px] font-semibold flex-shrink-0"
          style={{ color: T.textMuted }}
        >
          ☑ {task._count.checklist}
        </span>
      )}
    </li>
  );
}

function StatusPicker({
  current,
  statuses,
  onChange,
}: {
  current: TaskStatus;
  statuses: TaskStatus[];
  onChange: (statusId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const color = current.color ?? T.textMuted;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-2.5 py-1 text-[10px] font-bold transition hover:brightness-110"
        style={{
          backgroundColor: color + "22",
          color,
          border: `1px solid ${color}33`,
        }}
        title="Змінити статус"
      >
        {current.name}
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 flex min-w-[160px] flex-col gap-0.5 rounded-xl p-1 shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {statuses.map((s) => {
            const active = s.id === current.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (!active) onChange(s.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition hover:brightness-110"
                style={{
                  backgroundColor: active ? s.color + "22" : "transparent",
                  color: active ? s.color : T.textPrimary,
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate">{s.name}</span>
                {active && <span style={{ color: s.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
