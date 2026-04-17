"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  ExternalLink,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type PeopleTask = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  project: { id: string; title: string };
  status: { name: string; color: string; isDone: boolean };
};

type PersonGroup = {
  user: { id: string; name: string; avatar: string | null };
  counts: { total: number; overdue: number };
  tasks: PeopleTask[];
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

export function TaskPeopleGlobal({
  onOpenDrawer,
}: {
  onOpenDrawer: (taskId: string) => void;
}) {
  const [people, setPeople] = useState<PersonGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me/people")
      .then((r) => (r.ok ? r.json() : { data: { people: [] } }))
      .then((j) => setPeople(j.data?.people ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-8 text-center text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin inline mr-2" />
        Завантаження…
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center text-[12px]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        Немає відкритих задач
      </div>
    );
  }

  const totalTasks = people.reduce((s, p) => s + p.counts.total, 0);
  const totalOverdue = people.reduce((s, p) => s + p.counts.overdue, 0);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-center gap-4 rounded-xl px-4 py-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Stat label="Людей" value={people.length} color={T.accentPrimary} />
        <Stat label="Задач" value={totalTasks} color={T.textPrimary} />
        <Stat label="Прострочено" value={totalOverdue} color="#ef4444" />
      </div>

      {people.map((p) => (
        <PersonCard key={p.user.id} group={p} onOpenDrawer={onOpenDrawer} />
      ))}
    </div>
  );
}

function PersonCard({
  group,
  onOpenDrawer,
}: {
  group: PersonGroup;
  onOpenDrawer: (taskId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

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
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          {group.user.avatar ? (
            <img
              src={group.user.avatar}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <User size={14} />
          )}
        </div>
        <span className="text-[13px] font-bold flex-1" style={{ color: T.textPrimary }}>
          {group.user.name}
        </span>
        <span className="text-[10px] font-semibold" style={{ color: T.textMuted }}>
          {group.counts.total} задач
        </span>
        {group.counts.overdue > 0 && (
          <span
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ color: "#ef4444" }}
          >
            <AlertTriangle size={10} />
            {group.counts.overdue}
          </span>
        )}
      </button>

      {!collapsed && (
        <ul className="flex flex-col gap-1 p-3">
          {group.tasks.map((t) => {
            const overdue =
              t.dueDate && new Date(t.dueDate) < new Date() && !t.status.isDone;
            return (
              <li
                key={t.id}
                onClick={() => onOpenDrawer(t.id)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition hover:brightness-95"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${overdue ? "#ef4444" : T.borderSoft}`,
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PRIORITY_DOT[t.priority] ?? "#64748b" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: T.textPrimary }}>
                    {t.title}
                  </div>
                  <div
                    className="text-[10px] truncate flex items-center gap-1"
                    style={{ color: T.textMuted }}
                  >
                    <ExternalLink size={9} />
                    {t.project.title}
                  </div>
                </div>
                {t.dueDate && (
                  <span
                    className="text-[10px] font-semibold flex-shrink-0"
                    style={{ color: overdue ? "#ef4444" : T.textMuted }}
                  >
                    {new Date(t.dueDate).toLocaleDateString("uk-UA")}
                  </span>
                )}
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold flex-shrink-0"
                  style={{
                    backgroundColor: t.status.color + "22",
                    color: t.status.color,
                  }}
                >
                  {t.status.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      <span className="text-lg font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
