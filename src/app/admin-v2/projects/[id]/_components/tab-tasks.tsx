"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { STAGE_LABELS } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import {
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Circle,
  List,
  Columns,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  Download,
  Play,
  Square,
  Clock,
  GanttChartSquare,
  Link2,
  Trash2,
} from "lucide-react";
import { TaskKanban, type KanbanCard, type KanbanStatus } from "./task-kanban";
import { TaskCalendar } from "./task-calendar";
import { TaskPeopleView } from "./task-people";
import { TaskGantt } from "./task-gantt";
import { useProjectRealtime } from "@/hooks/useProjectRealtime";
import { CommentThread } from "@/components/collab/CommentThread";

type StageLite = {
  id: string;
  stage: ProjectStage;
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
  const [error, setError] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickStageId, setQuickStageId] = useState(stages[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Open TaskDrawer if ?task=<id> is in URL (e.g. from notification deep-link)
  useEffect(() => {
    const taskParam = searchParams.get("task");
    if (taskParam) {
      setActiveTaskId(taskParam);
    }
  }, [searchParams]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, statusesRes, labelsRes] = await Promise.all([
        fetch(`/api/admin/projects/${projectId}/tasks?take=200`),
        fetch(`/api/admin/projects/${projectId}/statuses`),
        fetch(`/api/admin/projects/${projectId}/labels`),
      ]);
      if (tasksRes.status === 404) {
        setError("Модуль задач вимкнений для цього проєкту");
        setTasks([]);
        return;
      }
      if (!tasksRes.ok || !statusesRes.ok || !labelsRes.ok) {
        throw new Error("Не вдалось завантажити дані");
      }
      const tasksJson = await tasksRes.json();
      const statusesJson = await statusesRes.json();
      const labelsJson = await labelsRes.json();
      setTasks(tasksJson.data?.items ?? []);
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
              {STAGE_LABELS[s.stage]}
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

      {/* View body */}
      {loading ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ color: T.textMuted }}>
          Завантаження…
        </div>
      ) : view === "kanban" ? (
        <TaskKanban
          statuses={kanbanStatuses}
          cards={kanbanCards}
          onMove={(id, s, p) => void moveCard(id, s, p)}
          onOpen={(id) => setActiveTaskId(id)}
        />
      ) : view === "gantt" ? (
        gantt ? (
          <TaskGantt
            items={gantt.items}
            onTaskClick={(id) => setActiveTaskId(id)}
            onDateChange={async (id, start, end) => {
              await fetch(`/api/admin/tasks/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  startDate: start.toISOString(),
                  dueDate: end.toISOString(),
                }),
              });
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
          onOpen={(id) => setActiveTaskId(id)}
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
          onOpen={(id) => setActiveTaskId(id)}
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
                  {STAGE_LABELS[stage.stage]}
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
                      onOpen={() => setActiveTaskId(t.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      {activeTaskId && (
        <TaskDrawer
          taskId={activeTaskId}
          projectId={projectId}
          statuses={statuses}
          labels={labels}
          onClose={() => {
            setActiveTaskId(null);
            void loadAll();
          }}
        />
      )}
    </div>
  );
}

function TaskRow({ task, onOpen }: { task: TaskListItem; onOpen: () => void }) {
  const statusColor = task.status.color ?? T.textMuted;
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
      <span
        className="rounded-full px-2.5 py-1 text-[10px] font-bold flex-shrink-0"
        style={{
          backgroundColor: statusColor + "22",
          color: statusColor,
        }}
      >
        {task.status.name}
      </span>
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

type TaskDetail = TaskListItem & {
  description: string | null;
  checklist: {
    id: string;
    content: string;
    isDone: boolean;
    position: number;
  }[];
  stage: { stage: ProjectStage };
  customFields: Record<string, unknown> | null;
};

type TimeLogEntry = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  description: string | null;
  billable: boolean;
  costSnapshot: string | null;
  user: { id: string; name: string; avatar: string | null };
};

type DependencyEntry = {
  id: string;
  type: "FS" | "SS" | "FF" | "SF";
  lagDays: number;
  predecessor?: { id: string; title: string; status: { name: string; color: string } };
  successor?: { id: string; title: string; status: { name: string; color: string } };
};

type CustomFieldDef = {
  id: string;
  name: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "MULTI_SELECT" | "URL" | "USER";
  options: { values?: string[] } | null;
  isRequired: boolean;
};

function TaskDrawer({
  taskId,
  projectId,
  statuses,
  labels: _labels,
  onClose,
}: {
  taskId: string;
  projectId: string;
  statuses: TaskStatus[];
  labels: TaskLabel[];
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [logs, setLogs] = useState<TimeLogEntry[]>([]);
  const [deps, setDeps] = useState<{ incoming: DependencyEntry[]; outgoing: DependencyEntry[] }>({
    incoming: [],
    outgoing: [],
  });
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [activeTimerId, setActiveTimerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const [depPickerOpen, setDepPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detailRes, logsRes, currentRes, depsRes, cfRes] = await Promise.all([
        fetch(`/api/admin/tasks/${taskId}`),
        fetch(`/api/admin/tasks/${taskId}/time`),
        fetch(`/api/admin/time/timer/current`),
        fetch(`/api/admin/tasks/${taskId}/dependencies`),
        fetch(`/api/admin/projects/${projectId}/custom-fields`),
      ]);
      if (detailRes.ok) {
        const j = await detailRes.json();
        setDetail(j.data);
      }
      if (logsRes.ok) {
        const j = await logsRes.json();
        setLogs(j.data ?? []);
      }
      if (currentRes.ok) {
        const j = await currentRes.json();
        setActiveTimerId(
          j.data && j.data.task?.id === taskId ? j.data.id : null,
        );
      }
      if (depsRes.ok) {
        const j = await depsRes.json();
        setDeps(j.data ?? { incoming: [], outgoing: [] });
      }
      if (cfRes.ok) {
        const j = await cfRes.json();
        setCustomFieldDefs(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (statusId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addChecklist = async () => {
    if (!newChecklistItem.trim()) return;
    await fetch(`/api/admin/tasks/${taskId}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newChecklistItem }),
    });
    setNewChecklistItem("");
    await load();
  };

  const toggleChecklist = async (itemId: string) => {
    await fetch(`/api/admin/tasks/${taskId}/checklist/${itemId}`, {
      method: "PATCH",
    });
    await load();
  };

  const addDependency = async (otherTaskId: string, role: "predecessor" | "successor") => {
    const res = await fetch(`/api/admin/tasks/${taskId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherTaskId, role, type: "FS", lagDays: 0 }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Не вдалось додати залежність");
      return;
    }
    setDepPickerOpen(false);
    await load();
  };

  const removeDependency = async (depId: string) => {
    await fetch(`/api/admin/tasks/${taskId}/dependencies/${depId}`, {
      method: "DELETE",
    });
    await load();
  };

  const startTimer = async () => {
    setTimerBusy(true);
    try {
      await fetch(`/api/admin/time/timer/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      window.dispatchEvent(new Event("timer:refresh"));
      await load();
    } finally {
      setTimerBusy(false);
    }
  };

  const stopTimer = async () => {
    setTimerBusy(true);
    try {
      await fetch(`/api/admin/time/timer/stop`, { method: "POST" });
      window.dispatchEvent(new Event("timer:refresh"));
      await load();
    } finally {
      setTimerBusy(false);
    }
  };

  const setCustomField = async (fieldId: string, value: unknown) => {
    const currentCf = detail?.customFields ?? {};
    const next = { ...currentCf, [fieldId]: value };
    await fetch(`/api/admin/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFields: next }),
    });
    await load();
  };

  const totalMinutes = logs.reduce((sum, l) => sum + (l.minutes ?? 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(2);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full sm:w-[560px] overflow-y-auto"
        style={{
          backgroundColor: T.panel,
          borderLeft: `1px solid ${T.borderStrong}`,
        }}
      >
        <div
          className="sticky top-0 flex items-center justify-between p-4 z-10"
          style={{
            backgroundColor: T.panel,
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <h2 className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Задача
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 tap-highlight-none"
            style={{ color: T.textMuted }}
          >
            <X size={18} />
          </button>
        </div>

        {loading || !detail ? (
          <div
            className="p-8 text-center text-sm"
            style={{ color: T.textMuted }}
          >
            Завантаження…
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-5">
            <h3
              className="text-lg font-bold"
              style={{ color: T.textPrimary }}
            >
              {detail.title}
            </h3>

            {detail.description && (
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: T.textSecondary }}
              >
                {detail.description}
              </p>
            )}

            {/* Status selector */}
            <div className="flex flex-col gap-2">
              <label
                className="text-[11px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                СТАТУС
              </label>
              <div className="flex flex-wrap gap-2">
                {statuses.map((s) => {
                  const active = s.id === detail.status.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => void setStatus(s.id)}
                      disabled={saving}
                      className="rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                      style={{
                        backgroundColor: active
                          ? s.color + "33"
                          : T.panelElevated,
                        color: active ? s.color : T.textMuted,
                        border: `1px solid ${active ? s.color : T.borderSoft}`,
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checklist */}
            <div className="flex flex-col gap-2">
              <label
                className="text-[11px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                ЧЕК-ЛИСТ
              </label>
              <ul className="flex flex-col gap-1">
                {detail.checklist.map((ci) => (
                  <li
                    key={ci.id}
                    onClick={() => void toggleChecklist(ci.id)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer"
                    style={{
                      color: ci.isDone ? T.textMuted : T.textPrimary,
                      textDecoration: ci.isDone ? "line-through" : "none",
                    }}
                  >
                    {ci.isDone ? (
                      <CheckCircle2 size={14} color={T.success} />
                    ) : (
                      <Circle size={14} color={T.textMuted} />
                    )}
                    {ci.content}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addChecklist();
                  }}
                  placeholder="Новий пункт…"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                />
                <button
                  onClick={() => void addChecklist()}
                  className="rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Assignees */}
            {detail.assignees.length > 0 && (
              <div className="flex flex-col gap-2">
                <label
                  className="text-[11px] font-bold tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  ВИКОНАВЦІ
                </label>
                <div className="flex flex-wrap gap-2">
                  {detail.assignees.map((a) => (
                    <span
                      key={a.user.id}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textPrimary,
                      }}
                    >
                      {a.user.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  <Link2 size={11} />
                  ЗАЛЕЖНОСТІ
                </label>
                <button
                  onClick={() => setDepPickerOpen((v) => !v)}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  {depPickerOpen ? "Скасувати" : "+ Додати"}
                </button>
              </div>
              {depPickerOpen && (
                <DepPicker
                  projectId={projectId}
                  currentTaskId={taskId}
                  onPick={(otherId, role) => void addDependency(otherId, role)}
                />
              )}
              {deps.incoming.length === 0 && deps.outgoing.length === 0 && !depPickerOpen ? (
                <p className="text-[11px]" style={{ color: T.textMuted }}>
                  Без залежностей
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {deps.incoming.map((d) => (
                    <DepRow
                      key={"in-" + d.id}
                      label="← залежить від"
                      task={d.predecessor}
                      onRemove={() => void removeDependency(d.id)}
                    />
                  ))}
                  {deps.outgoing.map((d) => (
                    <DepRow
                      key={"out-" + d.id}
                      label="блокує →"
                      task={d.successor}
                      onRemove={() => void removeDependency(d.id)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* Custom fields */}
            {customFieldDefs.length > 0 && (
              <div className="flex flex-col gap-2">
                <label
                  className="text-[11px] font-bold tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  КАСТОМНІ ПОЛЯ
                </label>
                <div className="flex flex-col gap-2">
                  {customFieldDefs.map((def) => (
                    <CustomFieldInput
                      key={def.id}
                      def={def}
                      value={(detail.customFields ?? {})[def.id]}
                      onChange={(v) => void setCustomField(def.id, v)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Time tracking */}
            <div className="flex flex-col gap-2">
              <label
                className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                <Clock size={11} />
                ТАЙМ-ТРЕКІНГ · {totalHours} год
              </label>
              <div className="flex gap-2">
                {activeTimerId ? (
                  <button
                    onClick={() => void stopTimer()}
                    disabled={timerBusy}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: "#ef4444", color: "#fff" }}
                  >
                    {timerBusy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Square size={14} />
                    )}
                    Зупинити таймер
                  </button>
                ) : (
                  <button
                    onClick={() => void startTimer()}
                    disabled={timerBusy}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                    style={{
                      backgroundColor: T.accentPrimary,
                      color: "#fff",
                    }}
                  >
                    {timerBusy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    Старт
                  </button>
                )}
              </div>
              {logs.length > 0 && (
                <ul className="flex flex-col gap-1 mt-1">
                  {logs.slice(0, 10).map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px]"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textSecondary,
                      }}
                    >
                      <span className="truncate flex-1">
                        {l.user.name} ·{" "}
                        {new Date(l.startedAt).toLocaleDateString("uk-UA")}
                        {l.description ? ` · ${l.description}` : ""}
                      </span>
                      <span
                        className="font-mono font-bold ml-2"
                        style={{ color: T.textPrimary }}
                      >
                        {l.minutes !== null
                          ? `${Math.floor(l.minutes / 60)}:${(l.minutes % 60).toString().padStart(2, "0")}`
                          : "⏱️"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Task discussion thread */}
            <div className="flex flex-col gap-2">
              <CommentThread entityType="TASK" entityId={taskId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DepRow({
  label,
  task,
  onRemove,
}: {
  label: string;
  task?: { id: string; title: string; status: { name: string; color: string } };
  onRemove: () => void;
}) {
  if (!task) return null;
  return (
    <li
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <span
        className="text-[9px] font-bold uppercase flex-shrink-0"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span className="flex-1 truncate" style={{ color: T.textPrimary }}>
        {task.title}
      </span>
      <span
        className="rounded-full px-2 py-0.5 text-[9px] font-bold flex-shrink-0"
        style={{
          backgroundColor: task.status.color + "22",
          color: task.status.color,
        }}
      >
        {task.status.name}
      </span>
      <button
        onClick={onRemove}
        className="p-1 rounded-md flex-shrink-0"
        style={{ color: T.textMuted }}
        title="Видалити залежність"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
}

function DepPicker({
  projectId,
  currentTaskId,
  onPick,
}: {
  projectId: string;
  currentTaskId: string;
  onPick: (taskId: string, role: "predecessor" | "successor") => void;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ id: string; title: string }[]>([]);
  const [role, setRole] = useState<"predecessor" | "successor">("predecessor");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch(
        `/api/admin/projects/${projectId}/tasks?take=30${q ? `&search=${encodeURIComponent(q)}` : ""}`,
      );
      if (!r.ok) return;
      const j = await r.json();
      if (cancelled) return;
      const items = (j.data?.items ?? [])
        .filter((t: { id: string }) => t.id !== currentTaskId)
        .slice(0, 15);
      setList(items);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, currentTaskId, q]);

  return (
    <div
      className="rounded-lg p-2 flex flex-col gap-2"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex gap-1">
        {(["predecessor", "successor"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className="rounded-md px-2 py-1 text-[10px] font-semibold"
            style={{
              backgroundColor: role === r ? T.accentPrimarySoft : "transparent",
              color: role === r ? T.accentPrimary : T.textMuted,
              border: `1px solid ${role === r ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            {r === "predecessor" ? "Поточна ← залежить від" : "Поточна блокує →"}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Пошук задачі…"
        className="rounded-md px-2 py-1.5 text-sm outline-none"
        style={{
          backgroundColor: T.panel,
          color: T.textPrimary,
          border: `1px solid ${T.borderSoft}`,
        }}
      />
      <ul className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
        {list.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onPick(t.id, role)}
              className="w-full rounded-md px-2 py-1.5 text-left text-[12px]"
              style={{ color: T.textPrimary }}
            >
              {t.title}
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="text-[11px] text-center" style={{ color: T.textMuted }}>
            Немає задач
          </li>
        )}
      </ul>
    </div>
  );
}

function CustomFieldInput({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const labelEl = (
    <label
      className="text-[10px] font-semibold uppercase"
      style={{ color: T.textMuted }}
    >
      {def.name}
      {def.isRequired && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );

  const inputStyle: React.CSSProperties = {
    backgroundColor: T.panelElevated,
    color: T.textPrimary,
    border: `1px solid ${T.borderSoft}`,
  };

  if (def.type === "TEXT" || def.type === "URL") {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <input
          type={def.type === "URL" ? "url" : "text"}
          defaultValue={typeof value === "string" ? value : ""}
          onBlur={(e) => onChange(e.target.value || null)}
          className="rounded-md px-2 py-1.5 text-sm outline-none"
          style={inputStyle}
        />
      </div>
    );
  }
  if (def.type === "NUMBER") {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <input
          type="number"
          defaultValue={typeof value === "number" ? value : ""}
          onBlur={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          className="rounded-md px-2 py-1.5 text-sm outline-none"
          style={inputStyle}
        />
      </div>
    );
  }
  if (def.type === "DATE") {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <input
          type="date"
          defaultValue={typeof value === "string" ? value.slice(0, 10) : ""}
          onBlur={(e) => onChange(e.target.value || null)}
          className="rounded-md px-2 py-1.5 text-sm outline-none"
          style={inputStyle}
        />
      </div>
    );
  }
  if (def.type === "SELECT") {
    const opts = def.options?.values ?? [];
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <select
          defaultValue={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="rounded-md px-2 py-1.5 text-sm outline-none"
          style={inputStyle}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  // MULTI_SELECT / USER render as comma-separated text as a simple fallback
  return (
    <div className="flex flex-col gap-1">
      {labelEl}
      <input
        type="text"
        defaultValue={Array.isArray(value) ? (value as string[]).join(", ") : ""}
        placeholder="val1, val2"
        onBlur={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        className="rounded-md px-2 py-1.5 text-sm outline-none"
        style={inputStyle}
      />
    </div>
  );
}
