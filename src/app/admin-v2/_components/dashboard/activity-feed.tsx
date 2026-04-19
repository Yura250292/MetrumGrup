import Link from "next/link";
import {
  CheckCircle2,
  Plus,
  Wallet,
  Activity,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export type FeedEvent = {
  type: "task_completed" | "task_created" | "payment_received" | "project_updated";
  date: Date;
  title: string;
  subtitle: string;
  href: string;
};

const eventConfig = {
  task_completed: {
    icon: CheckCircle2,
    color: T.success,
    softColor: T.successSoft,
  },
  task_created: {
    icon: Plus,
    color: T.accentPrimary,
    softColor: T.accentPrimarySoft,
  },
  payment_received: {
    icon: Wallet,
    color: T.emerald,
    softColor: T.emeraldSoft,
  },
  project_updated: {
    icon: Activity,
    color: T.sky,
    softColor: T.skySoft,
  },
} as const;

export function ActivityFeed({ events }: { events: FeedEvent[] }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[10px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            АКТИВНІСТЬ
          </span>
          <h2
            className="text-base font-bold"
            style={{ color: T.textPrimary }}
          >
            Остання активність
          </h2>
        </div>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          7 днів
        </span>
      </div>

      {events.length === 0 ? (
        <p className="text-[12px]" style={{ color: T.textMuted }}>
          Немає активності за останні 7 днів
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {events.map((event, i) => {
            const config = eventConfig[event.type];
            const Icon = config.icon;

            return (
              <Link
                key={`${event.type}-${i}`}
                href={event.href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:brightness-[0.97]"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                  style={{
                    backgroundColor: config.softColor,
                  }}
                >
                  <Icon size={14} style={{ color: config.color }} />
                </div>
                <div className="flex flex-1 flex-col gap-0 min-w-0">
                  <span
                    className="text-[13px] font-semibold truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {event.title}
                  </span>
                  <span
                    className="text-[11px] truncate"
                    style={{ color: T.textMuted }}
                  >
                    {event.subtitle}
                  </span>
                </div>
                <span
                  className="text-[10px] flex-shrink-0"
                  style={{ color: T.textMuted }}
                >
                  {formatRelativeTime(event.date)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function buildFeedEvents({
  completedTasks,
  createdTasks,
  paidPayments,
  updatedProjects,
}: {
  completedTasks: Array<{
    id: string;
    title: string;
    completedAt: Date | null;
    project: { id: string; title: string };
  }>;
  createdTasks: Array<{
    id: string;
    title: string;
    createdAt: Date;
    project: { id: string; title: string };
    createdBy: { name: string | null };
  }>;
  paidPayments: Array<{
    id: string;
    amount: unknown;
    paidDate: Date | null;
    project: { id: string; title: string };
  }>;
  updatedProjects: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    currentStage: string;
  }>;
}): FeedEvent[] {
  const events: FeedEvent[] = [];

  for (const t of completedTasks) {
    if (!t.completedAt) continue;
    events.push({
      type: "task_completed",
      date: t.completedAt,
      title: `Завершено: ${t.title}`,
      subtitle: t.project.title,
      href: `/admin-v2/projects/${t.project.id}?tab=tasks`,
    });
  }

  for (const t of createdTasks) {
    events.push({
      type: "task_created",
      date: t.createdAt,
      title: `Нова задача: ${t.title}`,
      subtitle: t.createdBy.name ? `Створив: ${t.createdBy.name}` : t.project.title,
      href: `/admin-v2/projects/${t.project.id}?tab=tasks`,
    });
  }

  for (const p of paidPayments) {
    if (!p.paidDate) continue;
    events.push({
      type: "payment_received",
      date: p.paidDate,
      title: `Оплата: ${formatCurrency(Number(p.amount))}`,
      subtitle: p.project.title,
      href: `/admin-v2/projects/${p.project.id}?tab=finance`,
    });
  }

  for (const p of updatedProjects) {
    events.push({
      type: "project_updated",
      date: p.updatedAt,
      title: `Оновлено: ${p.title}`,
      subtitle: p.currentStage,
      href: `/admin-v2/projects/${p.id}`,
    });
  }

  events.sort((a, b) => b.date.getTime() - a.date.getTime());
  return events.slice(0, 15);
}
