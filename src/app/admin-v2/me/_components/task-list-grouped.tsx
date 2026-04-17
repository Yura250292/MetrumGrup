"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderKanban } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { TaskItem } from "./use-me-tasks";
import { TaskRow } from "./task-list-flat";

type ProjectGroup = {
  projectId: string;
  projectTitle: string;
  tasks: TaskItem[];
  doneCount: number;
};

export function TaskListGrouped({
  tasks,
  loading,
  activeTimerTaskId,
  pendingId,
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
  onOpenDrawer: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onMarkDone: (task: TaskItem) => void;
  onDelete: (taskId: string, title: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, ProjectGroup>();
    for (const t of tasks) {
      const key = t.project?.id ?? "__no_project__";
      if (!map.has(key)) {
        map.set(key, {
          projectId: key,
          projectTitle: t.project?.title ?? "Без проєкту",
          tasks: [],
          doneCount: 0,
        });
      }
      const g = map.get(key)!;
      g.tasks.push(t);
      if (t.status.isDone) g.doneCount++;
    }
    return [...map.values()].sort((a, b) =>
      a.projectTitle.localeCompare(b.projectTitle, "uk")
    );
  }, [tasks]);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        Завантаження…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-[12px]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        Немає задач
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <ProjectGroupCard
          key={g.projectId}
          group={g}
          activeTimerTaskId={activeTimerTaskId}
          pendingId={pendingId}
          onOpenDrawer={onOpenDrawer}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
          onMarkDone={onMarkDone}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function ProjectGroupCard({
  group,
  activeTimerTaskId,
  pendingId,
  onOpenDrawer,
  onStartTimer,
  onStopTimer,
  onMarkDone,
  onDelete,
}: {
  group: ProjectGroup;
  activeTimerTaskId: string | null;
  pendingId: string | null;
  onOpenDrawer: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onMarkDone: (task: TaskItem) => void;
  onDelete: (taskId: string, title: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const total = group.tasks.length;
  const done = group.doneCount;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:brightness-95 transition"
        style={{ backgroundColor: T.panelElevated }}
      >
        {collapsed ? (
          <ChevronRight size={14} style={{ color: T.textMuted }} />
        ) : (
          <ChevronDown size={14} style={{ color: T.textMuted }} />
        )}
        <FolderKanban size={16} style={{ color: T.accentPrimary }} />
        <span className="text-[13px] font-bold flex-1" style={{ color: T.textPrimary }}>
          {group.projectTitle}
        </span>
        <span
          className="text-[10px] font-semibold"
          style={{ color: T.textMuted }}
        >
          {done}/{total}
        </span>
        <div
          className="h-1.5 w-16 rounded-full overflow-hidden"
          style={{ backgroundColor: T.borderSoft }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              backgroundColor: pct === 100 ? "#10b981" : T.accentPrimary,
            }}
          />
        </div>
      </button>

      {!collapsed && (
        <ul className="flex flex-col gap-1.5 p-3">
          {group.tasks.map((t) => (
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
