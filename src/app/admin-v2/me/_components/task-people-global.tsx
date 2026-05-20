"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  UserPlus,
  ExternalLink,
  Search,
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
  user: {
    id: string;
    name: string;
    avatar: string | null;
    isExternal?: boolean;
  };
  counts: { total: number; overdue: number };
  tasks: PeopleTask[];
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

/** Релативна дата ("сьогодні", "завтра", "за 3 д", "прострочено 2 д"). */
function formatDueRelative(
  dueIso: string | null,
  isDone: boolean,
): { label: string; tone: "danger" | "warn" | "muted" } {
  if (!dueIso) return { label: "—", tone: "muted" };
  const now = new Date();
  const due = new Date(dueIso);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const diffDays = Math.round((b - a) / (24 * 60 * 60 * 1000));
  if (isDone) return { label: "виконано", tone: "muted" };
  if (diffDays < 0) {
    return { label: `прострочено ${Math.abs(diffDays)}д`, tone: "danger" };
  }
  if (diffDays === 0) return { label: "сьогодні", tone: "warn" };
  if (diffDays === 1) return { label: "завтра", tone: "warn" };
  if (diffDays <= 7) return { label: `за ${diffDays}д`, tone: "muted" };
  return {
    label: due.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
    tone: "muted",
  };
}

export function TaskPeopleGlobal({
  onOpenDrawer,
}: {
  onOpenDrawer: (taskId: string) => void;
}) {
  const [people, setPeople] = useState<PersonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/me/people")
      .then((r) => (r.ok ? r.json() : { data: { people: [] } }))
      .then((j) => setPeople(j.data?.people ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredPeople = useMemo(() => {
    if (!search.trim()) return people;
    const q = search.trim().toLowerCase();
    return people.filter((p) => p.user.name.toLowerCase().includes(q));
  }, [people, search]);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-8 text-center text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
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
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        Немає відкритих задач
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Compact search input. Лічильники людей/задач/прострочено вже є у KPI
          зверху — окрему stat-смугу прибрали, аби не дублювати. */}
      {people.length > 3 && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <Search size={14} style={{ color: T.textMuted }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук по виконавцю…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: T.textPrimary }}
          />
        </div>
      )}

      {filteredPeople.map((p) => (
        <PersonCard key={p.user.id} group={p} onOpenDrawer={onOpenDrawer} />
      ))}

      {filteredPeople.length === 0 && (
        <div
          className="rounded-2xl p-6 text-center text-[12px]"
          style={{ color: T.textMuted }}
        >
          Не знайдено
        </div>
      )}
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
  const accent = group.counts.overdue > 0 ? "#ef4444" : T.accentPrimary;
  const initials = group.user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-3 w-full px-3 py-2 text-left hover:brightness-95 transition"
      >
        {collapsed ? (
          <ChevronRight size={14} style={{ color: T.textMuted }} />
        ) : (
          <ChevronDown size={14} style={{ color: T.textMuted }} />
        )}

        {/* Avatar */}
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0"
          style={
            group.user.isExternal
              ? {
                  backgroundColor: T.panelElevated,
                  color: T.textSecondary,
                  border: `1px dashed ${T.borderStrong}`,
                }
              : { backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }
          }
        >
          {group.user.avatar ? (
            <img
              src={group.user.avatar}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : group.user.isExternal ? (
            <UserPlus size={14} />
          ) : initials ? (
            initials
          ) : (
            <User size={14} />
          )}
        </div>

        {/* Name + tag */}
        <span
          className="text-[13px] font-semibold flex-1 flex items-center gap-1.5 truncate"
          style={{ color: T.textPrimary }}
        >
          <span className="truncate">{group.user.name}</span>
          {group.user.isExternal && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textMuted,
                border: `1px dashed ${T.borderSoft}`,
              }}
              title="Зовнішній виконавець (не користувач CRM)"
            >
              ЗОВНІШНІЙ
            </span>
          )}
        </span>

        {/* Counts */}
        <span
          className="text-[11px] font-semibold whitespace-nowrap"
          style={{ color: T.textMuted }}
        >
          {group.counts.total} {pluralizeTasks(group.counts.total)}
        </span>
        {group.counts.overdue > 0 && (
          <span
            className="flex items-center gap-1 text-[11px] font-bold whitespace-nowrap"
            style={{ color: "#ef4444" }}
          >
            <AlertTriangle size={12} />
            {group.counts.overdue}
          </span>
        )}
      </button>

      {!collapsed && (
        <ul className="flex flex-col gap-1 p-2 pt-0">
          {group.tasks.map((t) => {
            const due = formatDueRelative(t.dueDate, t.status.isDone);
            const dueColor =
              due.tone === "danger"
                ? "#ef4444"
                : due.tone === "warn"
                  ? "#f59e0b"
                  : T.textMuted;
            const overdue = due.tone === "danger";
            return (
              <li
                key={t.id}
                onClick={() => onOpenDrawer(t.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition hover:brightness-95"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${overdue ? "#ef444433" : T.borderSoft}`,
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: PRIORITY_DOT[t.priority] ?? "#64748b",
                  }}
                  title={`Пріоритет: ${t.priority}`}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {t.title}
                  </div>
                  <div
                    className="text-[11px] truncate flex items-center gap-1.5"
                    style={{ color: T.textMuted }}
                  >
                    <ExternalLink size={9} />
                    <span className="truncate">{t.project.title}</span>
                    <span>·</span>
                    <span style={{ color: dueColor }} className="font-medium">
                      {due.label}
                    </span>
                  </div>
                </div>
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

function pluralizeTasks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "задач";
  if (mod10 === 1) return "задача";
  if (mod10 >= 2 && mod10 <= 4) return "задачі";
  return "задач";
}
