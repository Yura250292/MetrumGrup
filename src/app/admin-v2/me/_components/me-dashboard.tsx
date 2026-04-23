"use client";

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  ListChecks,
  Plus,
  List,
  FolderKanban,
  Users,
  Table2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  LayoutGrid,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  useMeTasks,
  isOverdue,
  isDueToday,
  type Scope,
  type Focus,
  type ViewMode,
} from "./use-me-tasks";
import { FocusBanner } from "./dashboard-kpi";
import { TaskListFlat } from "./task-list-flat";
import { TaskListGrouped } from "./task-list-grouped";
import { TaskPeopleGlobal } from "./task-people-global";
import { NewTaskModal } from "./new-task-modal";
import { SelfContainedTaskDrawer } from "./task-drawer-shared";
import { TaskTableView } from "./task-table-view";
import { SectionsView } from "./sections-view";
import { AiDaySummary } from "./ai-day-summary";

const SCOPE_DEFS: { id: Scope; label: string }[] = [
  { id: "assigned", label: "Мої" },
  { id: "created", label: "Створені" },
  { id: "watching", label: "Стежу" },
  { id: "all", label: "Всі" },
];

const VIEW_DEFS: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: "sections", label: "Секції", icon: LayoutGrid },
  { id: "table", label: "Таблиця", icon: Table2 },
  { id: "flat", label: "Список", icon: List },
  { id: "by-project", label: "По проєктах", icon: FolderKanban },
  { id: "by-people", label: "По людях", icon: Users },
];

/* ─── Project filter with search + collapsible ─── */

type ProjectOption = { id: string; title: string; isInternal?: boolean };

function ProjectFilterInline({
  projects,
  selectedIds,
  onChange,
}: {
  projects: ProjectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, search]);

  const internal = filtered.filter((p) => p.isInternal);
  const regular = filtered.filter((p) => !p.isInternal);
  const VISIBLE_LIMIT = 6;
  const needsExpand = projects.length > VISIBLE_LIMIT;
  const visibleRegular = expanded ? regular : regular.slice(0, Math.max(0, VISIBLE_LIMIT - internal.length));
  const hiddenCount = regular.length - visibleRegular.length;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  if (projects.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Search + label */}
      <div className="flex items-center gap-2">
        <FolderKanban size={13} style={{ color: T.textMuted }} />
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: T.textMuted }}>
          Проєкти
        </span>
        {selectedIds.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="flex items-center gap-1 text-[10px] font-medium"
            style={{ color: T.accentPrimary }}
          >
            <X size={10} />
            Скинути ({selectedIds.length})
          </button>
        )}
        {needsExpand && (
          <div className="relative ml-auto" style={{ width: 160 }}>
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: T.textMuted }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук..."
              className="w-full rounded-lg pl-7 pr-2 py-1.5 text-[11px] outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: "1px solid " + T.borderSoft,
                color: T.textPrimary,
              }}
            />
          </div>
        )}
      </div>

      {/* Pills */}
      <div className="flex flex-wrap gap-1.5">
        <Pill active={selectedIds.length === 0} onClick={() => onChange([])}>
          Всі
        </Pill>
        {internal.map((p) => (
          <Pill key={p.id} active={selectedIds.includes(p.id)} onClick={() => toggle(p.id)} accent>
            {p.title}
          </Pill>
        ))}
        {visibleRegular.map((p) => (
          <Pill key={p.id} active={selectedIds.includes(p.id)} onClick={() => toggle(p.id)}>
            {p.title}
          </Pill>
        ))}
        {hiddenCount > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ color: T.textMuted, border: "1px dashed " + T.borderStrong }}
          >
            <ChevronDown size={10} />
            ще {hiddenCount}
          </button>
        )}
        {expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ color: T.textMuted, border: "1px dashed " + T.borderStrong }}
          >
            <ChevronUp size={10} />
            згорнути
          </button>
        )}
      </div>
    </div>
  );
}

function Pill({
  children,
  active,
  onClick,
  accent,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
      style={{
        backgroundColor: active
          ? accent
            ? T.accentSecondarySoft
            : T.accentPrimarySoft
          : "transparent",
        color: active
          ? accent
            ? T.accentSecondary
            : T.accentPrimary
          : T.textMuted,
        border: "1px solid " + (active ? (accent ? T.accentSecondary : T.accentPrimary) + "40" : T.borderSoft),
      }}
    >
      {children}
    </button>
  );
}

/* ─── KPI strip (compact inline) ─── */

function KpiStrip({
  counts,
  focus,
  onFocusChange,
}: {
  counts: { assigned: number; overdue: number; dueToday: number; completed: number; unread: number } | undefined;
  focus: Focus;
  onFocusChange: (f: Focus) => void;
}) {
  const items: { id: Focus; label: string; value: number; icon: React.ReactNode; color: string }[] = [
    { id: "all", label: "Активних", value: counts?.assigned ?? 0, icon: <ListChecks size={13} />, color: T.accentPrimary },
    { id: "overdue", label: "Прострочено", value: counts?.overdue ?? 0, icon: <AlertTriangle size={13} />, color: "#ef4444" },
    { id: "today", label: "Сьогодні", value: counts?.dueToday ?? 0, icon: <Clock size={13} />, color: "#f59e0b" },
  ];

  return (
    <div className="flex items-center gap-2">
      {items.map((item) => {
        const active = focus === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onFocusChange(item.id)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
            style={{
              backgroundColor: active ? item.color + "15" : "transparent",
              color: active ? item.color : T.textMuted,
              border: "1px solid " + (active ? item.color + "40" : "transparent"),
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            <span className="font-bold" style={{ color: item.value > 0 ? item.color : T.textMuted }}>
              {item.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main dashboard ─── */

export function MeDashboard({ currentUserId }: { currentUserId: string }) {
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([]);

  const {
    dashboard,
    tasks,
    filteredTasks,
    activeTimer,
    scope,
    setScope,
    focus,
    setFocus,
    viewMode,
    setViewMode,
    includeCompleted,
    setIncludeCompleted,
    loading,
    pendingId,
    load,
    startTimer,
    stopTimer,
    markDone,
    deleteTask,
  } = useMeTasks({ projectIds: projectIds.length > 0 ? projectIds : undefined });

  // Load projects for filter
  useState(() => {
    fetch("/api/admin/me/projects")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) =>
        setAllProjects(
          (j.data ?? []).map((p: any) => ({ id: p.id, title: p.title, isInternal: p.isInternal }))
        )
      )
      .catch(() => {});
  });

  const counts = dashboard?.counts;
  const hasActiveFilters = projectIds.length > 0 || scope !== "assigned" || includeCompleted;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Row 1: Title + KPI counters + New task button ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold mr-auto" style={{ color: T.textPrimary }}>
          Мої задачі
        </h1>

        <KpiStrip counts={counts} focus={focus} onFocusChange={setFocus} />

        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
        >
          <Plus size={14} />
          Нова задача
        </button>
      </div>

      {/* ── Row 1.5: AI day summary ── */}
      <AiDaySummary />

      {/* ── Row 2: Focus banner (timer or urgent task) ── */}
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

      {/* ── Row 3: Toolbar — view toggle + scope + filter button ── */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
        style={{ backgroundColor: T.panel, border: "1px solid " + T.borderSoft }}
      >
        {/* View mode */}
        <div className="flex gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: T.panelElevated }}>
          {VIEW_DEFS.map((v) => {
            const Icon = v.icon;
            const active = viewMode === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                title={v.label}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition"
                style={{
                  backgroundColor: active ? T.panel : "transparent",
                  color: active ? T.accentPrimary : T.textMuted,
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : undefined,
                }}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="h-5 w-px mx-1" style={{ backgroundColor: T.borderSoft }} />

        {/* Scope */}
        {SCOPE_DEFS.map((s) => {
          const active = scope === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: active ? T.accentPrimarySoft : "transparent",
                color: active ? T.accentPrimary : T.textMuted,
              }}
            >
              {s.label}
            </button>
          );
        })}

        {/* Separator */}
        <div className="h-5 w-px mx-1" style={{ backgroundColor: T.borderSoft }} />

        {/* Completed toggle */}
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: T.textMuted }}>
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(e) => setIncludeCompleted(e.target.checked)}
            className="rounded"
          />
          Завершені
        </label>

        {/* Filter toggle (projects) */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition"
          style={{
            backgroundColor: showFilters || hasActiveFilters ? T.accentPrimarySoft : T.panelElevated,
            color: showFilters || hasActiveFilters ? T.accentPrimary : T.textMuted,
          }}
        >
          <Filter size={12} />
          Фільтр
          {projectIds.length > 0 && (
            <span
              className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full text-[9px] font-bold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              {projectIds.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Row 3b: Active filter chips — visible only when collapsed ── */}
      {!showFilters && projectIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: T.textMuted }}>
            Активні фільтри:
          </span>
          {projectIds.map((pid) => {
            const project = allProjects.find((p) => p.id === pid);
            if (!project) return null;
            return (
              <span
                key={pid}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: T.accentPrimarySoft,
                  color: T.accentPrimary,
                  border: `1px solid ${T.accentPrimary}33`,
                }}
              >
                <span className="truncate max-w-[160px]">{project.title}</span>
                <button
                  onClick={() => setProjectIds(projectIds.filter((x) => x !== pid))}
                  className="hover:opacity-70"
                  aria-label={`Прибрати фільтр ${project.title}`}
                >
                  ×
                </button>
              </span>
            );
          })}
          <button
            onClick={() => setProjectIds([])}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: T.textMuted, textDecoration: "underline" }}
          >
            Очистити
          </button>
        </div>
      )}

      {/* ── Row 4 (collapsible): Project filter ── */}
      {showFilters && (
        <div
          className="rounded-xl px-4 py-3"
          style={{ backgroundColor: T.panel, border: "1px solid " + T.borderSoft }}
        >
          <ProjectFilterInline
            projects={allProjects}
            selectedIds={projectIds}
            onChange={setProjectIds}
          />
        </div>
      )}

      {/* ── Task views ── */}
      {viewMode === "sections" && (
        <SectionsView
          tasks={filteredTasks}
          currentUserId={currentUserId}
          loading={loading}
          activeTimerTaskId={activeTimer?.task.id ?? null}
          pendingId={pendingId}
          onOpenDrawer={setDrawerTaskId}
          onStartTimer={(id) => void startTimer(id)}
          onStopTimer={() => void stopTimer()}
          onMarkDone={(t) => void markDone(t)}
        />
      )}

      {viewMode === "table" && (
        <TaskTableView
          tasks={filteredTasks}
          loading={loading}
          activeTimerTaskId={activeTimer?.task.id ?? null}
          pendingId={pendingId}
          onOpenDrawer={setDrawerTaskId}
          onStartTimer={(id) => void startTimer(id)}
          onStopTimer={() => void stopTimer()}
          onMarkDone={(t) => void markDone(t)}
        />
      )}

      {viewMode === "flat" && (
        <TaskListFlat
          tasks={filteredTasks}
          loading={loading}
          activeTimerTaskId={activeTimer?.task.id ?? null}
          pendingId={pendingId}
          focus={focus}
          onOpenDrawer={setDrawerTaskId}
          onStartTimer={(id) => void startTimer(id)}
          onStopTimer={() => void stopTimer()}
          onMarkDone={(t) => void markDone(t)}
          onDelete={(id, title) => void deleteTask(id, title)}
        />
      )}

      {viewMode === "by-project" && (
        <TaskListGrouped
          tasks={filteredTasks}
          loading={loading}
          activeTimerTaskId={activeTimer?.task.id ?? null}
          pendingId={pendingId}
          onOpenDrawer={setDrawerTaskId}
          onStartTimer={(id) => void startTimer(id)}
          onStopTimer={() => void stopTimer()}
          onMarkDone={(t) => void markDone(t)}
          onDelete={(id, title) => void deleteTask(id, title)}
        />
      )}

      {viewMode === "by-people" && (
        <TaskPeopleGlobal onOpenDrawer={setDrawerTaskId} />
      )}

      {/* Task drawer */}
      {drawerTaskId && (
        <SelfContainedTaskDrawer
          taskId={drawerTaskId}
          onClose={() => setDrawerTaskId(null)}
          onUpdate={() => void load()}
        />
      )}

      {/* New task modal */}
      {createOpen && (
        <NewTaskModal
          currentUserId={currentUserId}
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
