"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ───────── shared types (re-exported for sibling components) ───────── */

export type TaskStatus = {
  id: string;
  name: string;
  color: string;
  isDone: boolean;
};

export type TaskItem = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  project: { id: string; title: string };
  status: TaskStatus;
  stage: { stage: string };
  labels: { label: { id: string; name: string; color: string } }[];
  assignees?: { user: { id: string; name: string; avatar: string | null } }[];
  _count: { checklist: number; subtasks: number };
  createdById?: string;
  createdBy?: { id: string; name: string; avatar: string | null } | null;
  watchers?: { userId: string }[];
  firstUndoneChecklistItem?: string | null;
  incomingDepsCount?: number;
  outgoingDepsCount?: number;
  hasAiSpec?: boolean;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  relatedEntity: string;
  relatedId: string;
};

export type Dashboard = {
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

export type ActiveTimer = {
  id: string;
  startedAt: string;
  task: { id: string; title: string; project: { id: string; title: string } };
};

export type Scope = "assigned" | "created" | "watching" | "all";
export type Focus = "all" | "overdue" | "today" | "next";
export type ViewMode = "sections" | "flat" | "by-project" | "by-people" | "table";

export const PRIORITY_COLOR: Record<TaskItem["priority"], string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

export function isOverdue(t: TaskItem): boolean {
  return Boolean(t.dueDate && new Date(t.dueDate) < new Date() && !t.status.isDone);
}

export function isDueToday(t: TaskItem): boolean {
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

/* ───────── hook ───────── */

export function useMeTasks({ projectIds }: { projectIds?: string[] } = {}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [scope, setScope] = useState<Scope>("assigned");
  const [focus, setFocus] = useState<Focus>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("sections");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scope,
        includeCompleted: String(includeCompleted),
      });
      if (projectIds && projectIds.length > 0) {
        params.set("projectIds", projectIds.join(","));
      }
      const [dRes, tRes, timerRes] = await Promise.all([
        fetch("/api/admin/me/dashboard"),
        fetch(`/api/admin/me/tasks?${params}`),
        fetch("/api/admin/time/timer/current"),
      ]);
      if (dRes.ok) setDashboard((await dRes.json()).data);
      if (tRes.ok) setTasks((await tRes.json()).data.items ?? []);
      if (timerRes.ok) setActiveTimer((await timerRes.json()).data ?? null);
    } finally {
      setLoading(false);
    }
  }, [scope, includeCompleted, projectIds?.join(",")]);

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
    setPendingId(task.id);
    try {
      const r = await fetch(`/api/admin/projects/${task.project.id}/statuses`);
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

  const deleteTask = async (taskId: string, title: string) => {
    if (!confirm(`Видалити задачу «${title}»?`)) return;
    setPendingId(taskId);
    try {
      await fetch(`/api/admin/tasks/${taskId}`, { method: "DELETE" });
      await load();
    } finally {
      setPendingId(null);
    }
  };

  return {
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
  };
}
