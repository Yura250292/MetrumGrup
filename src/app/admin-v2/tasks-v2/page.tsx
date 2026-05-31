import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  AlertOctagon,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Flag,
  ListChecks,
} from "lucide-react";
import { InteractiveTaskRow, type ClientTaskRow } from "./_components/task-row-client";

export const dynamic = "force-dynamic";

export default async function TasksV2Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; priority?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);

  const sp = await searchParams;
  const filter = sp.filter ?? "mine";
  const priorityFilter = sp.priority ?? null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);

  const projectScope = firmId ? { project: { firmId } } : {};

  const baseWhere: Record<string, unknown> = { ...projectScope };
  if (filter === "mine") {
    baseWhere.assignees = { some: { userId: session.user.id } };
  } else if (filter === "overdue") {
    baseWhere.dueDate = { lt: now };
    baseWhere.completedAt = null;
  } else if (filter === "today") {
    baseWhere.dueDate = { gte: startOfToday, lt: endOfToday };
  }
  if (priorityFilter) baseWhere.priority = priorityFilter;

  const [tasks, myCount, overdueCount, todayCount, totalCount, myCompletedThisWeek] =
    await Promise.all([
      prisma.task.findMany({
        where: baseWhere,
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
          startDate: true,
          completedAt: true,
          estimatedHours: true,
          actualHours: true,
          status: { select: { id: true, name: true, color: true, isDone: true } },
          project: { select: { id: true, title: true, slug: true } },
          assignees: {
            select: {
              user: { select: { id: true, name: true, avatar: true } },
            },
            take: 4,
          },
          _count: { select: { checklist: true, attachments: true } },
        },
        orderBy: [
          { completedAt: { sort: "asc", nulls: "first" } },
          { dueDate: { sort: "asc", nulls: "last" } },
        ],
        take: 50,
      }),
      prisma.task.count({
        where: {
          ...projectScope,
          assignees: { some: { userId: session.user.id } },
          completedAt: null,
        },
      }),
      prisma.task.count({
        where: {
          ...projectScope,
          dueDate: { lt: now },
          completedAt: null,
        },
      }),
      prisma.task.count({
        where: {
          ...projectScope,
          dueDate: { gte: startOfToday, lt: endOfToday },
        },
      }),
      prisma.task.count({ where: projectScope }),
      prisma.task.count({
        where: {
          ...projectScope,
          assignees: { some: { userId: session.user.id } },
          completedAt: {
            gte: new Date(now.getTime() - 7 * 86_400_000),
          },
        },
      }),
    ]);

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Задачі
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {myCount}
            </span>{" "}
            відкритих на мені{" "}
            {overdueCount > 0 && (
              <>
                · <span className="font-semibold" style={{ color: T.danger }}>{overdueCount}</span>{" "}
                прострочених
              </>
            )}
            {" · "}
            <span className="font-semibold" style={{ color: T.success }}>
              {myCompletedThisWeek}
            </span>{" "}
            завершено за тиждень
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
            style={{ backgroundColor: T.violetSoft, color: T.violet }}
          >
            V2 PREVIEW
          </span>
          <Link
            href="/admin-v2"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
              color: T.textSecondary,
            }}
          >
            На дашборд
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </header>

      <KpiStrip
        myCount={myCount}
        overdueCount={overdueCount}
        todayCount={todayCount}
        totalCount={totalCount}
        completedThisWeek={myCompletedThisWeek}
      />

      <Toolbar
        activeFilter={filter}
        activePriority={priorityFilter}
        myCount={myCount}
        overdueCount={overdueCount}
        todayCount={todayCount}
        totalCount={totalCount}
      />

      <TaskList tasks={tasks.map(toClientRow)} />
    </div>
  );
}

function toClientRow(t: TaskRow): ClientTaskRow {
  return {
    id: t.id,
    title: t.title,
    priority: t.priority,
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    startDate: t.startDate ? new Date(t.startDate).toISOString() : null,
    completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
    estimatedHours: Number(t.estimatedHours ?? 0),
    actualHours: Number(t.actualHours ?? 0),
    status: t.status,
    project: t.project,
    assignees: t.assignees,
    checklistCount: t._count.checklist,
    attachmentCount: t._count.attachments,
  };
}

function KpiStrip({
  myCount,
  overdueCount,
  todayCount,
  totalCount,
  completedThisWeek,
}: {
  myCount: number;
  overdueCount: number;
  todayCount: number;
  totalCount: number;
  completedThisWeek: number;
}) {
  const cards: Array<{
    icon: typeof ListChecks;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    dark?: boolean;
  }> = [
    {
      icon: ListChecks,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "НА МЕНІ",
      value: String(myCount),
      sub: "відкритих задач",
    },
    {
      icon: AlertOctagon,
      iconBg: overdueCount > 0 ? T.dangerSoft : T.successSoft,
      iconColor: overdueCount > 0 ? T.danger : T.success,
      label: "ПРОСТРОЧЕНІ",
      value: String(overdueCount),
      sub: overdueCount > 0 ? "потребують уваги" : "усе вчасно",
      dark: overdueCount > 0,
    },
    {
      icon: Calendar,
      iconBg: T.warningSoft,
      iconColor: T.warning,
      label: "СЬОГОДНІ ДЕДЛАЙН",
      value: String(todayCount),
      sub: todayCount > 0 ? "закрити до вечора" : "немає на сьогодні",
    },
    {
      icon: CheckCircle2,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "ЗА ТИЖДЕНЬ",
      value: String(completedThisWeek),
      sub: "завершено мною",
    },
    {
      icon: Flag,
      iconBg: T.skySoft,
      iconColor: T.sky,
      label: "ВСЬОГО У СИСТЕМІ",
      value: String(totalCount),
      sub: "по всіх проєктах",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <article
          key={i}
          className="rounded-xl p-3.5"
          style={{
            backgroundColor: c.dark ? "#7F1D1D" : T.panel,
            border: c.dark ? "none" : `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: c.dark ? "#FFFFFF" : c.iconBg }}
            >
              <c.icon size={16} style={{ color: c.iconColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[9.5px] font-bold tracking-wider"
                style={{ color: c.dark ? "#FECACA" : T.textMuted }}
              >
                {c.label}
              </div>
              <div
                className="text-[22px] font-bold tabular-nums leading-none mt-0.5"
                style={{ color: c.dark ? "#FFFFFF" : T.textPrimary }}
              >
                {c.value}
              </div>
              <div
                className="text-[11px] mt-1 truncate"
                style={{ color: c.dark ? "#FECACA" : T.textMuted }}
              >
                {c.sub}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Toolbar({
  activeFilter,
  activePriority,
  myCount,
  overdueCount,
  todayCount,
  totalCount,
}: {
  activeFilter: string;
  activePriority: string | null;
  myCount: number;
  overdueCount: number;
  todayCount: number;
  totalCount: number;
}) {
  const segments = [
    { key: "mine", label: "На мені", count: myCount, color: T.accentPrimary },
    { key: "overdue", label: "Прострочені", count: overdueCount, color: T.danger },
    { key: "today", label: "Сьогодні", count: todayCount, color: T.warning },
    { key: "all", label: "Всі", count: totalCount, color: T.textPrimary },
  ];
  const priorities = [
    { key: "URGENT", label: "URGENT", color: T.danger },
    { key: "HIGH", label: "HIGH", color: T.warning },
    { key: "NORMAL", label: "NORMAL", color: T.accentPrimary },
    { key: "LOW", label: "LOW", color: T.textMuted },
  ];
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s) => {
          const isActive = activeFilter === s.key;
          const href =
            s.key === "all" ? "/admin-v2/tasks-v2?filter=all" : `/admin-v2/tasks-v2?filter=${s.key}`;
          return (
            <Link
              key={s.key}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? "#0F172A" : T.panel,
                border: isActive ? "none" : `1px solid ${T.borderSoft}`,
                color: isActive ? "#FFFFFF" : T.textSecondary,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="tabular-nums opacity-70">{s.count}</span>
            </Link>
          );
        })}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {priorities.map((p) => {
          const isActive = activePriority === p.key;
          const href = isActive
            ? `/admin-v2/tasks-v2?filter=${activeFilter}`
            : `/admin-v2/tasks-v2?filter=${activeFilter}&priority=${p.key}`;
          return (
            <Link
              key={p.key}
              href={href}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold tracking-wider transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? p.color : T.panelSoft,
                color: isActive ? "#FFFFFF" : p.color,
              }}
            >
              <Flag size={10} />
              {p.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  startDate: Date | null;
  completedAt: Date | null;
  estimatedHours: unknown;
  actualHours: unknown;
  status: { id: string; name: string; color: string | null; isDone: boolean } | null;
  project: { id: string; title: string; slug: string };
  assignees: Array<{
    user: { id: string; name: string | null; avatar: string | null } | null;
  }>;
  _count: { checklist: number; attachments: number };
};

function TaskList({ tasks }: { tasks: ClientTaskRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <ul className="flex flex-col">
        {tasks.length === 0 && (
          <li
            className="px-5 py-16 text-center"
            style={{ color: T.textMuted }}
          >
            <CheckCircle2
              size={32}
              style={{ color: T.success, opacity: 0.5 }}
              className="mx-auto mb-2"
            />
            <p className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Нічого тут немає
            </p>
            <p className="text-[12px] mt-1" style={{ color: T.textMuted }}>
              Усі задачі у цьому фільтрі закриті — добра робота!
            </p>
          </li>
        )}
        {tasks.map((t, idx) => (
          <InteractiveTaskRow
            key={t.id}
            task={t}
            isLast={idx === tasks.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

// (TaskRow / AvatarStack / getDueTier helpers лишились у Client Component
// — _components/task-row-client.tsx)
