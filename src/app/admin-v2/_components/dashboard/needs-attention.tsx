"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";

// ───────── Types (unchanged — preserve data flow) ─────────
type OverdueTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  project: { id: string; title: string };
};
type OverduePayment = {
  id: string;
  amount: unknown;
  scheduledDate: Date;
  project: { title: string };
};
type StaleProject = {
  id: string;
  title: string;
  updatedAt: Date;
  manager: { name: string | null } | null;
};
type DueTodayTask = {
  id: string;
  title: string;
  project: { id: string; title: string };
  status: { name: string; color: string };
};

type TabId = "overdue" | "payments" | "today" | "stale";
type ListRow = {
  id: string;
  title: string;
  sub: string;
  meta: string;
  severity: "danger" | "warn" | "ok";
  href: string;
};

const TAB_DEFS: { id: TabId; label: string }[] = [
  { id: "overdue",  label: "Прострочено" },
  { id: "payments", label: "Платежі" },
  { id: "today",    label: "На сьогодні" },
  { id: "stale",    label: "Затихлі" },
];

const TAB_HREF: Record<TabId, string> = {
  overdue:  "/admin-v2/me",
  payments: "/admin-v2/finance",
  today:    "/admin-v2/me",
  stale:    "/admin-v2/projects",
};

export function NeedsAttention({
  overdueTasks,
  overduePayments,
  staleProjects,
  dueTodayTasks,
}: {
  overdueTasks: OverdueTask[];
  overduePayments: OverduePayment[];
  staleProjects: StaleProject[];
  dueTodayTasks: DueTodayTask[];
}) {
  const counts = {
    overdue:  overdueTasks.length,
    payments: overduePayments.length,
    today:    dueTodayTasks.length,
    stale:    staleProjects.length,
  };
  const totalIssues = counts.overdue + counts.payments + counts.today + counts.stale;

  // Preserve original behavior: do not render if no issues at all
  if (totalIssues === 0) return null;

  // Default tab: first non-empty in TAB_DEFS order
  const defaultTab: TabId =
    (TAB_DEFS.find((t) => counts[t.id] > 0)?.id) ?? "overdue";
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  const rows = useMemo<ListRow[]>(() => {
    switch (activeTab) {
      case "overdue":
        return overdueTasks.slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          sub: t.project.title,
          meta: t.dueDate ? `−${daysDiff(t.dueDate, new Date())} дн` : "—",
          severity: "danger" as const,
          href: TAB_HREF.overdue,
        }));
      case "payments":
        return overduePayments.slice(0, 5).map((p) => ({
          id: p.id,
          title: p.project.title,
          sub: formatDateShort(p.scheduledDate),
          meta: formatCurrency(Number(p.amount)),
          severity: "danger" as const,
          href: TAB_HREF.payments,
        }));
      case "today":
        return dueTodayTasks.slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          sub: t.project.title,
          meta: "сьогодні",
          severity: "warn" as const,
          href: TAB_HREF.today,
        }));
      case "stale":
        return staleProjects.slice(0, 5).map((p) => ({
          id: p.id,
          title: p.title,
          sub: p.manager?.name ?? "—",
          meta: `оновлено ${formatDateShort(p.updatedAt)}`,
          severity: "warn" as const,
          href: TAB_HREF.stale,
        }));
    }
  }, [activeTab, overdueTasks, overduePayments, dueTodayTasks, staleProjects]);

  return (
    <section
      className="premium-card rounded-2xl overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="section-head">
        <h2>Потребує уваги</h2>
        <span className="sub">{totalIssues} елементів</span>
        <Link href={TAB_HREF[activeTab]} className="action">
          Усе →
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-1 flex-wrap">
        {TAB_DEFS.map((t) => {
          const c = counts[t.id];
          if (c === 0) return null;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: isActive ? T.panelElevated : "transparent",
                color: isActive ? T.textPrimary : T.textMuted,
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {t.label}
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded text-[10px] font-bold tabular-nums"
                style={{
                  backgroundColor: T.danger,
                  color: "#fff",
                }}
              >
                {c}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="pb-1">
        {rows.length === 0 ? (
          <div
            className="px-5 py-6 text-center text-[12.5px]"
            style={{ color: T.textMuted }}
          >
            Нічого тут немає.
          </div>
        ) : (
          rows.map((row, i) => (
            <Link
              key={row.id}
              href={row.href}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--t-panel-soft)]"
              style={{
                borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
              }}
            >
              <span className={`status-dot ${row.severity}`} />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: T.textPrimary }}
                >
                  {row.title}
                </div>
                <div
                  className="text-[11.5px] truncate"
                  style={{ color: T.textMuted, marginTop: 1 }}
                >
                  {row.sub}
                </div>
              </div>
              <span
                className="text-[11.5px] font-medium tabular-nums whitespace-nowrap"
                style={{
                  color: row.severity === "danger" ? T.danger : T.textMuted,
                }}
              >
                {row.meta}
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function daysDiff(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}
