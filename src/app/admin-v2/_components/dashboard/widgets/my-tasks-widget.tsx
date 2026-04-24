"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Calendar, AlertCircle, Flame } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatDateShort } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

type MyTask = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string | null;
  projectId: string;
  project: { id: string; title: string } | null;
  status: { id: string; name: string; color?: string | null; isDone: boolean } | null;
};

const MY_TASKS_KEY = ["me", "tasks", "dashboard-widget"] as const;

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: T.danger,
  HIGH: T.warning,
  NORMAL: T.accentPrimary,
  LOW: T.textMuted,
};

export function MyTasksWidget() {
  const { data, isLoading } = useQuery({
    queryKey: MY_TASKS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/me/tasks?scope=assigned");
      if (!res.ok) throw new Error("Не вдалося завантажити задачі");
      return (await res.json()) as { data: { items: MyTask[] } };
    },
    refetchInterval: 60_000,
  });

  const items = (data?.data?.items ?? []).slice(0, 8);
  const overdueCount = items.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date(),
  ).length;
  const todayCount = items.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;

  return (
    <WidgetShell
      icon={<CheckSquare size={14} />}
      title="Мої завдання"
      subtitle={
        items.length === 0
          ? "Готовий до нових задач"
          : `${items.length} активних${todayCount ? ` · ${todayCount} на сьогодні` : ""}`
      }
      badge={
        overdueCount > 0
          ? { label: `${overdueCount} простр.`, tone: "danger" }
          : undefined
      }
      action={{ href: "/admin-v2/me", label: "Усі мої" }}
    >
      {isLoading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
          {items.map((t) => {
            const isDone = t.status?.isDone ?? false;
            const overdue =
              !!t.dueDate && !isDone && new Date(t.dueDate) < new Date();
            const priorityColor =
              PRIORITY_COLORS[t.priority ?? "NORMAL"] ?? T.accentPrimary;
            const isUrgent = t.priority === "URGENT";
            return (
              <li key={t.id}>
                <Link
                  href={
                    t.project
                      ? `/admin-v2/projects/${t.project.id}?tab=tasks&task=${t.id}`
                      : "/admin-v2/me"
                  }
                  className="group/row relative flex min-h-[48px] items-start gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 transition-colors duration-150 touch-manipulation"
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = T.panelElevated;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {/* Priority bar */}
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r"
                    style={{ backgroundColor: priorityColor, opacity: isDone ? 0.3 : 0.85 }}
                  />

                  <span
                    className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] transition-colors"
                    style={{
                      borderWidth: 1.5,
                      borderStyle: "solid",
                      borderColor: isDone ? T.success : T.borderSoft,
                      backgroundColor: isDone ? T.success : "transparent",
                    }}
                  >
                    {isDone && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6L4.5 8.5L10 3"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1.5">
                      {isUrgent && !isDone && (
                        <Flame
                          size={12}
                          className="mt-0.5 flex-shrink-0"
                          style={{ color: T.danger }}
                        />
                      )}
                      <span
                        className="block truncate text-[13px] leading-tight tracking-[-0.01em]"
                        style={{
                          color: isDone ? T.textMuted : T.textPrimary,
                          fontWeight: isDone ? 400 : 600,
                          textDecoration: isDone ? "line-through" : "none",
                        }}
                      >
                        {t.title}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      {t.project && (
                        <span
                          className="inline-flex items-center gap-1 truncate text-[10.5px] font-medium"
                          style={{ color: T.textMuted }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: priorityColor }}
                          />
                          {t.project.title}
                        </span>
                      )}
                      {t.dueDate && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                          style={{
                            color: overdue ? T.danger : T.textSecondary,
                            backgroundColor: overdue ? T.danger + "14" : "transparent",
                          }}
                        >
                          {overdue ? <AlertCircle size={10} /> : <Calendar size={10} />}
                          {formatDateShort(t.dueDate)}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetShell>
  );
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <li
          key={i}
          className="h-10 animate-pulse rounded-xl"
          style={{
            backgroundColor: T.panelElevated,
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: `linear-gradient(135deg, ${T.success}14, ${T.accentPrimary}14)`,
        }}
      >
        <CheckSquare size={18} style={{ color: T.success }} />
      </span>
      <span className="text-[12.5px] font-semibold" style={{ color: T.textPrimary }}>
        Inbox Zero ✨
      </span>
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        Немає активних задач
      </span>
    </div>
  );
}
