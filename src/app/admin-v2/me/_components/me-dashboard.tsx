"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Bell,
  ListChecks,
  Plus,
  List,
  FolderKanban,
  Users,
  Table2,
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
import { FocusBanner, KpiTiles, FOCUS_DEFS } from "./dashboard-kpi";
import { TaskListFlat } from "./task-list-flat";
import { TaskListGrouped } from "./task-list-grouped";
import { ProjectFilter } from "./project-filter";
import { TaskPeopleGlobal } from "./task-people-global";
import { NewTaskModal } from "./new-task-modal";
import { SelfContainedTaskDrawer } from "./task-drawer-shared";
import { SavedViewBar, type SavedViewFilters } from "./saved-view-bar";
import { TaskTableView } from "./task-table-view";

const SCOPE_DEFS: { id: Scope; label: string }[] = [
  { id: "assigned", label: "Призначені мені" },
  { id: "created", label: "Створені мною" },
  { id: "watching", label: "Стежу" },
  { id: "all", label: "Всі мої" },
];

const VIEW_DEFS: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: "table", label: "Таблиця", icon: Table2 },
  { id: "flat", label: "Список", icon: List },
  { id: "by-project", label: "По проєктах", icon: FolderKanban },
  { id: "by-people", label: "По людях", icon: Users },
];

export function MeDashboard({ currentUserId }: { currentUserId: string }) {
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

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

  const counts = dashboard?.counts;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
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

      {/* Focus banner */}
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
      <KpiTiles counts={counts} onFocusChange={setFocus} />

      {/* View mode + Focus + Scope controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* View mode toggle */}
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {VIEW_DEFS.map((v) => {
            const Icon = v.icon;
            const active = viewMode === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textMuted,
                }}
              >
                <Icon size={12} />
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Focus filters */}
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

        {/* Scope tabs */}
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {SCOPE_DEFS.map((s) => {
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

        {/* Include completed */}
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

      {/* Saved views */}
      <SavedViewBar
        currentFilters={{ scope, focus, viewMode, projectIds, includeCompleted }}
        onApply={(f: SavedViewFilters) => {
          if (f.scope) setScope(f.scope);
          if (f.focus) setFocus(f.focus);
          if (f.viewMode) setViewMode(f.viewMode);
          if (f.projectIds) setProjectIds(f.projectIds);
          if (f.includeCompleted !== undefined) setIncludeCompleted(f.includeCompleted);
        }}
      />

      {/* Project filter */}
      <ProjectFilter selectedIds={projectIds} onChange={setProjectIds} />

      {/* Task views */}
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
