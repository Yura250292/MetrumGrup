"use client";

import { useMemo } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";

type PeopleTask = {
  id: string;
  title: string;
  dueDate: string | null;
  status: { name: string; color: string; isDone: boolean };
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  assignees: { user: { id: string; name: string; avatar: string | null } }[];
};

const PRIORITY_COLOR: Record<PeopleTask["priority"], string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

export function TaskPeopleView({
  tasks,
  onOpen,
}: {
  tasks: PeopleTask[];
  onOpen: (id: string) => void;
}) {
  // Group tasks by assignee. Tasks without assignee go into "Unassigned"
  const groups = useMemo(() => {
    const m = new Map<
      string,
      { user: { id: string; name: string; avatar: string | null } | null; tasks: PeopleTask[] }
    >();
    const UNASSIGNED_KEY = "__unassigned__";
    for (const t of tasks) {
      if (t.assignees.length === 0) {
        const g = m.get(UNASSIGNED_KEY) ?? { user: null, tasks: [] };
        g.tasks.push(t);
        m.set(UNASSIGNED_KEY, g);
        continue;
      }
      for (const a of t.assignees) {
        const g = m.get(a.user.id) ?? { user: a.user, tasks: [] };
        g.tasks.push(t);
        m.set(a.user.id, g);
      }
    }
    const arr = Array.from(m.entries()).map(([key, v]) => ({ key, ...v }));
    arr.sort((a, b) =>
      a.user && b.user ? a.user.name.localeCompare(b.user.name) : a.user ? -1 : 1,
    );
    return arr;
  }, [tasks]);

  if (groups.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        Немає задач для відображення
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const open = g.tasks.filter((t) => !t.status.isDone);
        const done = g.tasks.filter((t) => t.status.isDone);
        return (
          <section
            key={g.key}
            className="rounded-2xl p-4"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <header className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {g.user ? (
                  <UserAvatar src={g.user.avatar} name={g.user.name} userId={g.user.id} size={32} />
                ) : (
                  <span
                    className="inline-flex items-center justify-center rounded-full h-8 w-8 text-[11px] font-bold"
                    style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                  >
                    —
                  </span>
                )}
                <div>
                  <h4 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                    {g.user ? g.user.name : "Без виконавця"}
                  </h4>
                  <p className="text-[10px]" style={{ color: T.textMuted }}>
                    {open.length} активних · {done.length} завершених
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <Bar count={open.length} max={20} color={T.accentPrimary} label="active" />
                <Bar count={done.length} max={20} color="#10b981" label="done" />
              </div>
            </header>
            <ul className="flex flex-col gap-1.5">
              {g.tasks.map((t) => (
                <li
                  key={t.id + g.key}
                  onClick={() => onOpen(t.id)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer"
                  style={{
                    backgroundColor: T.panelElevated,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: PRIORITY_COLOR[t.priority] }}
                  />
                  <span
                    className="text-sm flex-1 truncate"
                    style={{
                      color: t.status.isDone ? T.textMuted : T.textPrimary,
                      textDecoration: t.status.isDone ? "line-through" : "none",
                    }}
                  >
                    {t.title}
                  </span>
                  {t.dueDate && (
                    <span className="text-[10px] flex-shrink-0" style={{ color: T.textMuted }}>
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
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Bar({ count, max, color, label }: { count: number; max: number; color: string; label: string }) {
  const pct = Math.min(100, (count / max) * 100);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div
        className="h-1.5 w-16 rounded-full overflow-hidden"
        style={{ backgroundColor: color + "22" }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[9px]" style={{ color: T.textMuted }}>
        {label}
      </span>
    </div>
  );
}
