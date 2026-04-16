"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Bell,
  ListChecks,
  ExternalLink,
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

const PRIORITY_COLOR: Record<TaskItem["priority"], string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

type Scope = "assigned" | "created" | "watching" | "all";

export function MeDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [scope, setScope] = useState<Scope>("assigned");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, tRes] = await Promise.all([
        fetch(`/api/admin/me/dashboard`),
        fetch(`/api/admin/me/tasks?scope=${scope}&includeCompleted=${includeCompleted}`),
      ]);
      if (dRes.ok) {
        const j = await dRes.json();
        setDashboard(j.data);
      }
      if (tRes.ok) {
        const j = await tRes.json();
        setTasks(j.data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [scope, includeCompleted]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = dashboard?.counts;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile
          label="Активних"
          value={counts?.assigned ?? 0}
          icon={<ListChecks size={16} />}
          color={T.accentPrimary}
        />
        <Tile
          label="Прострочено"
          value={counts?.overdue ?? 0}
          icon={<AlertTriangle size={16} />}
          color="#ef4444"
        />
        <Tile
          label="Сьогодні"
          value={counts?.dueToday ?? 0}
          icon={<Clock size={16} />}
          color="#f59e0b"
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

      {/* Scope tabs */}
      <div className="flex flex-wrap gap-2 items-center">
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
          {loading ? "Завантаження…" : `Задачі (${tasks.length})`}
        </h3>
        {tasks.length === 0 && !loading ? (
          <p className="text-[12px]" style={{ color: T.textMuted }}>
            Немає задач у цій категорії
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>

      {/* Upcoming (next 10 by due date) */}
      {dashboard?.upcoming && dashboard.upcoming.length > 0 && (
        <section
          className="rounded-2xl p-4"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <h3 className="mb-3 text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Найближчі дедлайни
          </h3>
          <ul className="flex flex-col gap-1.5">
            {dashboard.upcoming.map((t) => (
              <TaskRow
                key={"u-" + t.id}
                task={t as unknown as TaskItem}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: TaskItem }) {
  const overdue =
    task.dueDate && new Date(task.dueDate) < new Date() && !task.status.isDone;
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:brightness-110"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${overdue ? "#ef4444" : T.borderSoft}`,
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
        <div
          className="text-sm truncate"
          style={{ color: T.textPrimary }}
        >
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
    </li>
  );
}

function Tile({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-3 py-3"
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
    </div>
  );
}
