"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Search,
  Archive,
  ArchiveRestore,
  ChevronRight,
  ChevronDown,
  Table2,
  Layers,
} from "lucide-react";
import { TaskKanban, type KanbanCard, type KanbanStatus } from "./task-kanban";
import { TaskCalendar } from "./task-calendar";
import { TaskPeopleView } from "./task-people";
import { InlineStatusPicker } from "./inline-status-picker";
import { PriorityPicker, DueDatePicker } from "./task-inline-pickers";
import { TaskTable } from "./task-table";
import { formatCurrencyCompact } from "@/lib/utils";
import {
  groupTasks,
  buildTaskTree,
  flattenTree,
  type GroupKey,
  type TaskTreeNode,
} from "@/lib/tasks/grouping";
import { rollupTaskCosts, sumGroupCost, type TaskCost } from "@/lib/tasks/cost";
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
  parentTaskId: string | null;
  status: TaskStatus;
  isArchived: boolean;
  progressPercent?: number;
  assignees: { user: { id: string; name: string; avatar: string | null } }[];
  labels: { label: TaskLabel }[];
  _count: { subtasks: number; checklist: number };
  /** Долучається лише для фінанс-ролей (RBAC). SELF-значення; rollup рахуємо на клієнті. */
  costPlanned?: number | null;
  costActual?: number;
};

export type TaskTableItem = TaskListItem;

type ViewMode = "list" | "kanban" | "gantt" | "calendar" | "people" | "table";

const VIEW_DEFS: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: "list", label: "Список", icon: List },
  { id: "table", label: "Таблиця", icon: Table2 },
  { id: "kanban", label: "Kanban", icon: Columns },
  { id: "gantt", label: "Gantt", icon: GanttChartSquare },
  { id: "calendar", label: "Календар", icon: CalendarIcon },
  { id: "people", label: "По людях", icon: UsersIcon },
];

const GROUP_DEFS: { id: GroupKey; label: string }[] = [
  { id: "stage", label: "Етап" },
  { id: "status", label: "Статус" },
  { id: "assignee", label: "Виконавець" },
  { id: "priority", label: "Пріоритет" },
  { id: "none", label: "Без груп" },
];

export function TabTasks({
  projectId,
  stages,
  canViewCost = false,
}: {
  projectId: string;
  stages: StageLite[];
  canViewCost?: boolean;
}) {
  const [view, setView] = useState<ViewMode>("list");
  const [groupBy, setGroupBy] = useState<GroupKey>("stage");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
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
    tasksWithoutDates: {
      id: string;
      title: string;
      status: { name: string; color: string };
    }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickStageId, setQuickStageId] = useState(stages[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  // Debounce — щоб не дьоргати API на кожен символ.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
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
    const baseParams = new URLSearchParams();
    baseParams.set("take", String(PAGE_SIZE));
    if (search) baseParams.set("search", search);
    if (includeArchived) baseParams.set("includeArchived", "true");
    if (canViewCost) baseParams.set("withCost", "1");
    try {
      const [firstTasksRes, statusesRes, labelsRes] = await Promise.all([
        fetch(`/api/admin/projects/${projectId}/tasks?${baseParams.toString()}`),
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
        const pagedParams = new URLSearchParams(baseParams);
        pagedParams.set("cursor", nextCursor);
        const res = await fetch(
          `/api/admin/projects/${projectId}/tasks?${pagedParams.toString()}`,
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
  }, [projectId, search, includeArchived, canViewCost]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadGantt = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/gantt`);
      if (r.ok) {
        const j = await r.json();
        setGantt({
          items: j.data.items,
          criticalIds: j.data.criticalIds,
          tasksWithoutDates: j.data.tasksWithoutDates ?? [],
        });
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

  // Rollup витрат: SELF-значення з API → дерево підсумків (батько = self + Σ дітей).
  const costMap = useMemo<Map<string, TaskCost>>(() => {
    if (!canViewCost) return new Map();
    return rollupTaskCosts(
      tasks.map((t) => ({
        id: t.id,
        parentTaskId: t.parentTaskId,
        estimatePlanned: t.costPlanned ?? null,
        manualPlanned: null,
        financeFact: t.costActual ?? 0,
        timeLogCost: 0,
      })),
    );
  }, [tasks, canViewCost]);

  // Контекст групування (етапи + статуси).
  const groupingCtx = useMemo(
    () => ({
      stages: stages.map((s) => ({
        id: s.id,
        name: stageDisplayName({ stage: s.stage, customName: s.customName ?? null }),
      })),
      statuses: statuses.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    }),
    [stages, statuses],
  );

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleTask = useCallback((id: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const patchTask = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      const prev = tasks;
      setTasks((p) =>
        p.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) as TaskListItem[],
      );
      try {
        const res = await fetch(`/api/admin/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("patch failed");
      } catch {
        setTasks(prev);
      }
    },
    [tasks],
  );

  const restoreTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch(`/api/admin/tasks/${taskId}/restore`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("restore failed");
        await loadAll();
      } catch {
        // silent
      }
    },
    [loadAll],
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
        {(view === "list" || view === "table") && (
          <div
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            title="Групувати задачі"
          >
            <Layers size={13} style={{ color: T.textMuted }} />
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupKey)}
              className="bg-transparent outline-none text-xs font-semibold cursor-pointer"
              style={{ color: T.textPrimary }}
            >
              {GROUP_DEFS.map((g) => (
                <option key={g.id} value={g.id} style={{ color: "#000" }}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div
          className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <Search size={13} style={{ color: T.textMuted }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Пошук по задачах…"
            className="bg-transparent outline-none placeholder:opacity-60 w-44"
            style={{ color: T.textPrimary }}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              title="Очистити"
              style={{ color: T.textMuted }}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIncludeArchived((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition"
          style={{
            backgroundColor: includeArchived ? T.accentPrimarySoft : T.panel,
            color: includeArchived ? T.accentPrimary : T.textMuted,
            border: `1px solid ${includeArchived ? T.accentPrimary + "55" : T.borderSoft}`,
          }}
          title="Показати архівні задачі"
        >
          <Archive size={13} />
          Архів
        </button>
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
            tasksWithoutDates={gantt.tasksWithoutDates}
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
              id: t.status.id,
              name: t.status.name,
              color: t.status.color,
              isDone: t.status.isDone,
            },
            priority: t.priority,
            assignees: t.assignees,
          }))}
          statuses={statuses}
          onOpen={openTask}
          onChangeStatus={(taskId, statusId) => void changeStatus(taskId, statusId)}
        />
      ) : view === "table" ? (
        <TaskTable
          tasks={tasks}
          statuses={statuses}
          projectId={projectId}
          groupBy={groupBy}
          groupingCtx={groupingCtx}
          expandedTasks={expandedTasks}
          collapsedGroups={collapsedGroups}
          costMap={costMap}
          canViewCost={canViewCost}
          onToggleGroup={toggleGroup}
          onToggleTask={toggleTask}
          onOpen={openTask}
          onChangeStatus={(id, sid) => void changeStatus(id, sid)}
          onChangePriority={(id, p) => void patchTask(id, { priority: p })}
          onChangeDueDate={(id, d) => void patchTask(id, { dueDate: d })}
        />
      ) : (
        // list — групування (Етап/Статус/Виконавець/Пріоритет) + вкладені підзадачі
        (() => {
          const tree = buildTaskTree(tasks);
          const rootNodeById = new Map<string, TaskTreeNode<TaskListItem>>(
            tree.map((n) => [n.task.id, n]),
          );
          const groups = groupTasks(
            tree.map((n) => n.task),
            groupBy,
            groupingCtx,
          );
          if (groups.length === 0) {
            return (
              <div
                className="rounded-2xl p-8 text-center text-sm"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
              >
                Немає задач
              </div>
            );
          }
          return groups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            const subtotal = canViewCost
              ? sumGroupCost(
                  group.items
                    .map((it) => costMap.get(it.id))
                    .filter((c): c is TaskCost => !!c),
                )
              : null;
            return (
              <section
                key={group.key}
                className="rounded-2xl p-4"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center gap-2 mb-3"
                >
                  {collapsed ? (
                    <ChevronRight size={15} style={{ color: T.textMuted }} />
                  ) : (
                    <ChevronDown size={15} style={{ color: T.textMuted }} />
                  )}
                  {group.color && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: group.color + "22", color: group.color }}
                    >
                      {group.label}
                    </span>
                  )}
                  {!group.color && (
                    <h3 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                      {group.label}
                    </h3>
                  )}
                  <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
                    {group.items.length}
                  </span>
                  {subtotal && (
                    <span className="ml-auto text-[11px] font-semibold" style={{ color: T.textMuted }}>
                      план {formatCurrencyCompact(subtotal.planned)} · факт{" "}
                      {formatCurrencyCompact(subtotal.actual)}
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <ul className="flex flex-col gap-2">
                    {group.items.flatMap((it) => {
                      const node = rootNodeById.get(it.id);
                      if (!node) return [];
                      return flattenTree([node], (n) => expandedTasks.has(n.task.id)).map((n) => (
                        <TaskRow
                          key={n.task.id}
                          task={n.task}
                          depth={n.depth}
                          hasSubtasks={n.children.length > 0}
                          expanded={expandedTasks.has(n.task.id)}
                          onToggleExpand={() => toggleTask(n.task.id)}
                          cost={canViewCost ? costMap.get(n.task.id) : undefined}
                          canViewCost={canViewCost}
                          statuses={statuses}
                          onOpen={() => openTask(n.task.id)}
                          onChangeStatus={(sid) => void changeStatus(n.task.id, sid)}
                          onChangePriority={(p) => void patchTask(n.task.id, { priority: p })}
                          onChangeDueDate={(d) => void patchTask(n.task.id, { dueDate: d })}
                          onRestore={() => void restoreTask(n.task.id)}
                        />
                      ));
                    })}
                  </ul>
                )}
              </section>
            );
          });
        })()
      )}

    </div>
  );
}

function TaskRow({
  task,
  statuses,
  depth = 0,
  hasSubtasks = false,
  expanded = false,
  onToggleExpand,
  cost,
  canViewCost = false,
  onOpen,
  onChangeStatus,
  onChangePriority,
  onChangeDueDate,
  onRestore,
}: {
  task: TaskListItem;
  statuses: TaskStatus[];
  depth?: number;
  hasSubtasks?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  cost?: TaskCost;
  canViewCost?: boolean;
  onOpen: () => void;
  onChangeStatus: (statusId: string) => void;
  onChangePriority: (priority: TaskListItem["priority"]) => void;
  onChangeDueDate: (iso: string | null) => void;
  onRestore: () => void;
}) {
  return (
    <li
      onClick={onOpen}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition hover:brightness-95"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
        opacity: task.isArchived ? 0.6 : 1,
        marginLeft: depth * 22,
      }}
    >
      {hasSubtasks ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center"
          title={expanded ? "Згорнути підзадачі" : "Розгорнути підзадачі"}
          style={{ color: T.textMuted }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}
      <PriorityPicker current={task.priority} onChange={onChangePriority} />
      <span
        className="text-sm truncate flex-1"
        style={{
          color: T.textPrimary,
          textDecoration: task.isArchived ? "line-through" : "none",
        }}
      >
        {task.title}
        {task._count.subtasks > 0 && (
          <span className="ml-1.5 text-[10px] font-semibold" style={{ color: T.textMuted }}>
            ({task._count.subtasks})
          </span>
        )}
      </span>
      {canViewCost && cost && (
        <span
          className="text-[11px] font-semibold flex-shrink-0 tabular-nums"
          style={{ color: T.textMuted }}
          title={`Витрати план / факт${depth || hasSubtasks ? " (з підзадачами)" : ""}`}
        >
          {formatCurrencyCompact(cost.plannedRollup)} / {formatCurrencyCompact(cost.actualRollup)}
        </span>
      )}
      {task.isArchived && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
          style={{
            backgroundColor: T.textMuted + "22",
            color: T.textMuted,
          }}
        >
          Архів
        </span>
      )}
      <DueDatePicker current={task.dueDate} onChange={onChangeDueDate} />
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
      <InlineStatusPicker
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
      {task.isArchived && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:brightness-110 flex-shrink-0"
          style={{
            backgroundColor: T.panel,
            color: T.accentPrimary,
            border: `1px solid ${T.accentPrimary}55`,
          }}
          title="Відновити з архіву"
        >
          <ArchiveRestore size={11} />
          Відновити
        </button>
      )}
    </li>
  );
}
