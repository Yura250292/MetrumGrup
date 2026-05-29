import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flag,
  ListChecks,
  Plus,
  User,
} from "lucide-react";

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
          status: { select: { id: true, name: true, color: true } },
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

      <TaskList tasks={tasks} />
    </div>
  );
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
  status: { id: string; name: string; color: string | null } | null;
  project: { id: string; title: string; slug: string };
  assignees: Array<{
    user: { id: string; name: string | null; avatar: string | null } | null;
  }>;
  _count: { checklist: number; attachments: number };
};

function TaskList({ tasks }: { tasks: TaskRow[] }) {
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
          <TaskRow key={t.id} task={t} isLast={idx === tasks.length - 1} />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({ task, isLast }: { task: TaskRow; isLast: boolean }) {
  const now = new Date();
  const isDone = !!task.completedAt;
  const isOverdue =
    !isDone && task.dueDate !== null && new Date(task.dueDate) < now;
  const dueTier = getDueTier(task.dueDate, isDone);
  const prio = PRIORITY_MAP[task.priority] ?? PRIORITY_MAP.NORMAL;
  const estimated = Number(task.estimatedHours ?? 0);
  const actual = Number(task.actualHours ?? 0);

  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
        opacity: isDone ? 0.55 : 1,
      }}
    >
      <Link
        href={`/admin-v2/projects/${task.project.id}?tab=tasks&taskId=${task.id}`}
        className="grid grid-cols-1 md:grid-cols-[28px_3px_1fr_160px_140px_120px_20px] items-center gap-3 px-5 py-3 transition hover:brightness-95"
      >
        <div
          className="flex h-5 w-5 items-center justify-center rounded"
          style={{
            backgroundColor: isDone ? T.success : "transparent",
            border: `2px solid ${isDone ? T.success : T.borderSoft}`,
          }}
        >
          {isDone && <CheckCircle2 size={12} style={{ color: "#FFFFFF" }} />}
        </div>
        <div
          className="hidden md:block w-[3px] h-7 rounded-full"
          style={{ backgroundColor: prio.color }}
          title={`Priority: ${task.priority}`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
              style={{ backgroundColor: prio.bg, color: prio.color }}
            >
              {task.priority}
            </span>
            <Link
              href={`/admin-v2/projects/${task.project.id}`}
              className="text-[10px] font-bold tracking-wider tabular-nums truncate"
              style={{ color: T.accentPrimary }}
              onClick={(e) => e.stopPropagation()}
            >
              PRJ-{task.project.slug.toUpperCase().slice(0, 8)}
            </Link>
            {task.status && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: task.status.color
                    ? `${task.status.color}22`
                    : T.panelSoft,
                  color: task.status.color ?? T.textSecondary,
                }}
              >
                {task.status.name}
              </span>
            )}
          </div>
          <div
            className="text-[13px] font-semibold mt-0.5 truncate"
            style={{
              color: T.textPrimary,
              textDecoration: isDone ? "line-through" : "none",
            }}
            title={task.title}
          >
            {task.title}
          </div>
          <div
            className="text-[11px] mt-0.5 truncate"
            style={{ color: T.textMuted }}
          >
            {task.project.title}
            {task._count.checklist > 0 && ` · ${task._count.checklist} підзадач`}
            {task._count.attachments > 0 && ` · 📎 ${task._count.attachments}`}
          </div>
        </div>
        <div>
          {dueTier ? (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ backgroundColor: dueTier.bg, color: dueTier.fg }}
            >
              <dueTier.icon size={11} />
              {dueTier.label}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без дедлайну
            </span>
          )}
        </div>
        <div>
          {task.assignees.length > 0 ? (
            <div className="flex items-center gap-1">
              <AvatarStack assignees={task.assignees} />
              {task.assignees.length === 1 && task.assignees[0].user?.name && (
                <span
                  className="text-[11px] font-semibold truncate"
                  style={{ color: T.textSecondary }}
                >
                  {task.assignees[0].user.name}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              не призначено
            </span>
          )}
        </div>
        <div className="text-right">
          {estimated > 0 ? (
            <>
              <div
                className="text-[12px] font-bold tabular-nums"
                style={{
                  color:
                    actual > estimated
                      ? T.danger
                      : actual > estimated * 0.8
                        ? T.warning
                        : T.textPrimary,
                }}
              >
                {actual.toFixed(1)} / {estimated.toFixed(0)}
              </div>
              <div className="text-[10px]" style={{ color: T.textMuted }}>
                год
              </div>
            </>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              —
            </span>
          )}
        </div>
        <ChevronRight
          size={14}
          style={{ color: T.textMuted }}
          className="hidden md:block"
        />
      </Link>
    </li>
  );
}

function AvatarStack({
  assignees,
}: {
  assignees: TaskRow["assignees"];
}) {
  const visible = assignees.slice(0, 3);
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((a, i) => (
        <div
          key={a.user?.id ?? `idx-${i}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
            color: "#FFFFFF",
            border: `2px solid ${T.panel}`,
          }}
          title={a.user?.name ?? ""}
        >
          {(a.user?.name ?? "?")
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </div>
      ))}
      {assignees.length > 3 && (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold"
          style={{
            backgroundColor: T.panelSoft,
            color: T.textSecondary,
            border: `2px solid ${T.panel}`,
          }}
        >
          +{assignees.length - 3}
        </div>
      )}
    </div>
  );
}

const PRIORITY_MAP: Record<string, { bg: string; color: string }> = {
  URGENT: { bg: T.dangerSoft, color: T.danger },
  HIGH: { bg: T.warningSoft, color: T.warning },
  NORMAL: { bg: T.accentPrimarySoft, color: T.accentPrimary },
  LOW: { bg: T.panelSoft, color: T.textMuted },
};

const AVATAR_COLORS = [T.violet, T.sky, T.accentPrimary, T.amber, T.emerald, T.rose];

function getDueTier(
  due: Date | null,
  isDone: boolean,
): { bg: string; fg: string; icon: typeof Clock; label: string } | null {
  if (!due) return null;
  const days = Math.round(
    (new Date(due).getTime() - Date.now()) / 86_400_000,
  );
  if (isDone) {
    return { bg: T.successSoft, fg: T.success, icon: CheckCircle2, label: "виконано" };
  }
  if (days < 0) {
    return {
      bg: T.dangerSoft,
      fg: T.danger,
      icon: AlertOctagon,
      label: `${Math.abs(days)} дн просрочки`,
    };
  }
  if (days === 0) {
    return { bg: T.warningSoft, fg: T.warning, icon: AlertTriangle, label: "сьогодні" };
  }
  if (days <= 3) {
    return { bg: T.warningSoft, fg: T.warning, icon: Clock, label: `${days} дн` };
  }
  if (days <= 14) {
    return { bg: T.skySoft, fg: T.sky, icon: Clock, label: `${days} дн` };
  }
  return { bg: T.panelSoft, fg: T.textMuted, icon: Calendar, label: `${days} дн` };
}
