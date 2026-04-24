"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Calendar, AlertCircle } from "lucide-react";
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

  return (
    <WidgetShell
      icon={<CheckSquare size={14} />}
      title="Мої завдання"
      badge={overdueCount > 0 ? `${overdueCount} простр.` : undefined}
      action={{ href: "/admin-v2/me", label: "Усі мої" }}
    >
      {isLoading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
          {items.map((t) => {
            const isDone = t.status?.isDone ?? false;
            const overdue =
              !!t.dueDate && !isDone && new Date(t.dueDate) < new Date();
            return (
              <li key={t.id}>
                <Link
                  href={`/admin-v2/tasks/${t.id}`}
                  className="flex min-h-[44px] items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:brightness-[0.97] touch-manipulation"
                >
                  <span
                    className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-[1.5px]"
                    style={{
                      borderColor: isDone ? T.success : T.borderSoft,
                      backgroundColor: isDone ? T.success : "transparent",
                    }}
                  >
                    {isDone && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
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
                    <span
                      className="block truncate text-[12.5px] font-semibold"
                      style={{
                        color: isDone ? T.textMuted : T.textPrimary,
                        textDecoration: isDone ? "line-through" : "none",
                      }}
                    >
                      {t.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      {t.project && (
                        <span
                          className="truncate text-[10.5px]"
                          style={{ color: T.textMuted }}
                        >
                          {t.project.title}
                        </span>
                      )}
                      {t.dueDate && (
                        <span
                          className="inline-flex items-center gap-1 text-[10.5px] font-medium"
                          style={{ color: overdue ? T.danger : T.textMuted }}
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
          className="h-8 rounded-lg"
          style={{ backgroundColor: T.panelElevated, opacity: 0.5 }}
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-6 text-center">
      <CheckSquare size={20} style={{ color: T.textMuted }} />
      <span className="mt-1 text-[12px]" style={{ color: T.textMuted }}>
        Немає активних задач
      </span>
    </div>
  );
}
