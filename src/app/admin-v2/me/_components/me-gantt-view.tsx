"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useDrillDown } from "@/components/drawer/use-drill-down";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const TaskGantt = dynamic(
  () =>
    import("@/app/admin-v2/projects/[id]/_components/task-gantt").then(
      (m) => m.TaskGantt,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-2xl bg-t-panel-soft" />
    ),
  },
);

type GanttItem = {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies: string;
  custom_class?: string;
  _meta?: {
    status: string;
    statusColor: string;
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    isDone: boolean;
    checklistCount: number;
  };
};

/**
 * Особистий Gantt: задачі, де поточний користувач = assignee.
 * Cross-project (firm-scoped). Клік на бар відкриває drill-down drawer.
 */
export function MeGanttView() {
  const drawer = useDrillDown();
  const [items, setItems] = useState<GanttItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/me/gantt");
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.data?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="h-64 w-full animate-pulse rounded-2xl"
        style={{ backgroundColor: T.panelSoft }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        Немає задач з датами. Додайте startDate / dueDate щоб побачити Gantt.
      </div>
    );
  }

  return (
    <TaskGantt
      items={items}
      onTaskClick={(id) => drawer.open({ type: "task", id })}
      onDateChange={async (id, start, end) => {
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
          alert(
            j.message ?? "Baseline зафіксовано — попросіть PM розморозити проєкт.",
          );
        }
        void load();
      }}
    />
  );
}
