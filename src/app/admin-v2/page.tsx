import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrency, formatCurrencyCompact, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, STAGE_LABELS } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import {
  FolderKanban,
  Users,
  Calculator,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Plus,
  CheckCircle2,
  ListTodo,
  Clock,
  Activity,
  Wallet,
  Zap,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2Dashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [
    projectsCount,
    activeProjectsCount,
    clientsCount,
    estimatesCount,
    totalRevenuePaid,
    portfolioBudget,
    recentProjects,
    overduePayments,
    // Tasks
    activeTasksCount,
    overdueTasksCount,
    dueTodayTasksCount,
    completedWeekTasksCount,
    // Finance (this month)
    monthIncome,
    monthExpense,
    // Stages distribution
    stageDistribution,
    // Time logs this week
    weekTimeLogs,
    // Upcoming tasks (next 7 days)
    upcomingTasks,
    // Recent AI estimates
    aiEstimatesMonth,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "CLIENT" } }),
    prisma.estimate.count(),
    prisma.payment.aggregate({
      where: { status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.project.aggregate({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      _sum: { totalBudget: true },
    }),
    prisma.project.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { name: true } },
        manager: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: now },
      },
      include: { project: { select: { title: true } } },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),
    // Tasks counts
    prisma.task.count({
      where: { isArchived: false, status: { isDone: false } },
    }),
    prisma.task.count({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { lt: now },
      },
    }),
    prisma.task.count({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { gte: startOfToday, lte: endOfToday },
      },
    }),
    prisma.task.count({
      where: {
        status: { isDone: true },
        completedAt: { gte: startOfWeek },
      },
    }),
    // Finance this month
    prisma.financeEntry.aggregate({
      where: {
        type: "INCOME",
        isArchived: false,
        occurredAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: {
        type: "EXPENSE",
        isArchived: false,
        occurredAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    }),
    // Stages
    prisma.project.groupBy({
      by: ["currentStage"],
      where: { status: "ACTIVE" },
      _count: { currentStage: true },
    }),
    // Time logs this week
    prisma.timeLog.groupBy({
      by: ["userId"],
      where: {
        endedAt: { not: null },
        startedAt: { gte: startOfWeek },
      },
      _sum: { minutes: true },
      orderBy: { _sum: { minutes: "desc" } },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        },
      },
      include: {
        project: { select: { id: true, title: true } },
        status: { select: { name: true, color: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.estimate.count({
      where: { createdAt: { gte: startOfMonth } },
    }),
  ]);

  const revenue = Number(totalRevenuePaid._sum.amount || 0);
  const portfolio = Number(portfolioBudget._sum.totalBudget || 0);
  const income = Number(monthIncome._sum.amount || 0);
  const expense = Number(monthExpense._sum.amount || 0);
  const netProfit = income - expense;

  // Load user names for time logs
  const userIds = weekTimeLogs.map((l) => l.userId);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const weekHoursTotal = weekTimeLogs.reduce(
    (acc, l) => acc + (l._sum.minutes ?? 0),
    0,
  );

  const today = new Date().toLocaleDateString("uk-UA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const firstName = session.user.name?.split(" ")[0] || "Адміністратор";

  // Stage distribution map (labelled)
  const stageMap = new Map<ProjectStage, number>();
  for (const s of stageDistribution) {
    stageMap.set(s.currentStage, s._count.currentStage);
  }
  const stageOrder: ProjectStage[] = [
    "DESIGN",
    "FOUNDATION",
    "WALLS",
    "ROOF",
    "ENGINEERING",
    "FINISHING",
    "HANDOVER",
  ];
  const stageMax = Math.max(...Array.from(stageMap.values()), 1);

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span
          className="text-[11px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          {today.toUpperCase()}
        </span>
        <h1
          className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight truncate"
          style={{ color: T.textPrimary }}
        >
          Вітаємо, {firstName}
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Огляд показників компанії на сьогодні
        </p>
      </section>

      {/* Row 1 — business KPIs */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label="ПРОЄКТИ"
          value={String(projectsCount)}
          sub={`${activeProjectsCount} активних`}
          icon={FolderKanban}
          accent={T.accentPrimary}
          gradient="var(--kpi-blue)"
          href="/admin-v2/projects"
        />
        <KpiCard
          label="КЛІЄНТИ"
          value={String(clientsCount)}
          sub="облікових записів"
          icon={Users}
          accent={T.teal}
          gradient="var(--kpi-teal)"
          href="/admin-v2/clients"
        />
        <KpiCard
          label="ПОРТФЕЛЬ"
          value={formatCurrencyCompact(portfolio)}
          sub="загальний бюджет"
          icon={Wallet}
          accent={T.violet}
          gradient="var(--kpi-violet)"
          href="/admin-v2/projects"
        />
        <KpiCard
          label="СПЛАЧЕНО"
          value={formatCurrencyCompact(revenue)}
          sub="усього по платежах"
          icon={TrendingUp}
          accent={T.emerald}
          gradient="var(--kpi-emerald)"
        />
      </section>

      {/* Row 2 — Tasks & Time */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label="АКТИВНІ ЗАДАЧІ"
          value={String(activeTasksCount)}
          sub={`${completedWeekTasksCount} завершено за тиждень`}
          icon={ListTodo}
          accent={T.sky}
          gradient="var(--kpi-sky)"
          href="/admin-v2/me"
        />
        <KpiCard
          label="ПРОСТРОЧЕНО"
          value={String(overdueTasksCount)}
          sub={`${dueTodayTasksCount} на сьогодні`}
          icon={AlertCircle}
          accent={overdueTasksCount > 0 ? T.danger : T.textMuted}
          gradient={overdueTasksCount > 0 ? "var(--kpi-danger)" : undefined}
          href="/admin-v2/me"
        />
        <KpiCard
          label="ГОДИН ЗА ТИЖДЕНЬ"
          value={formatHours(weekHoursTotal)}
          sub={`${weekTimeLogs.length} співробітників`}
          icon={Clock}
          accent={T.amber}
          gradient="var(--kpi-amber)"
        />
        <KpiCard
          label="AI КОШТОРИСИ"
          value={String(aiEstimatesMonth)}
          sub="за місяць"
          icon={Sparkles}
          accent={T.indigo}
          gradient="var(--kpi-indigo)"
          href="/ai-estimate-v2"
        />
      </section>

      {/* Row 3 — Finance this month */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <FinanceTile
          label="ДОХІД (МІСЯЦЬ)"
          value={income}
          icon={TrendingUp}
          color={T.success}
        />
        <FinanceTile
          label="ВИТРАТИ (МІСЯЦЬ)"
          value={expense}
          icon={TrendingDown}
          color={T.danger}
        />
        <FinanceTile
          label="ЧИСТИЙ ПРИБУТОК"
          value={netProfit}
          icon={Activity}
          color={netProfit >= 0 ? T.success : T.danger}
          emphasize
        />
      </section>

      {/* Row 4 — Stage distribution + Team this week */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Stages */}
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
                ПОТОК РОБОТИ
              </span>
              <h2
                className="text-base font-bold"
                style={{ color: T.textPrimary }}
              >
                Розподіл активних проєктів
              </h2>
            </div>
            <span
              className="text-[11px]"
              style={{ color: T.textMuted }}
            >
              разом {activeProjectsCount}
            </span>
          </div>
          {activeProjectsCount === 0 ? (
            <p className="text-[12px]" style={{ color: T.textMuted }}>
              Немає активних проєктів
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {stageOrder.map((stage) => {
                const count = stageMap.get(stage) ?? 0;
                const pct = (count / stageMax) * 100;
                const stageColors: Record<string, string> = {
                  DESIGN: T.violet,
                  FOUNDATION: T.sky,
                  WALLS: T.accentPrimary,
                  ROOF: T.teal,
                  ENGINEERING: T.amber,
                  FINISHING: T.indigo,
                  HANDOVER: T.emerald,
                };
                const barColor = stageColors[stage] || T.accentPrimary;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span
                      className="text-[11px] font-semibold w-28 flex-shrink-0"
                      style={{ color: T.textSecondary }}
                    >
                      {STAGE_LABELS[stage]}
                    </span>
                    <div
                      className="flex-1 h-5 rounded-md overflow-hidden"
                      style={{ backgroundColor: barColor + "12" }}
                    >
                      <div
                        className="h-full rounded-md flex items-center justify-end pr-2 text-[10px] font-bold"
                        style={{
                          width: `${Math.max(pct, count > 0 ? 6 : 0)}%`,
                          background: count > 0
                            ? `linear-gradient(90deg, ${barColor}cc, ${barColor})`
                            : "transparent",
                          color: "#fff",
                        }}
                      >
                        {count > 0 ? count : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Team this week */}
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
                НАВАНТАЖЕННЯ
              </span>
              <h2
                className="text-base font-bold"
                style={{ color: T.textPrimary }}
              >
                Команда за 7 днів
              </h2>
            </div>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {formatHours(weekHoursTotal)} · {weekTimeLogs.length} людей
            </span>
          </div>
          {weekTimeLogs.length === 0 ? (
            <p className="text-[12px]" style={{ color: T.textMuted }}>
              Немає залогованого часу за останні 7 днів
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {weekTimeLogs.map((log, idx) => {
                const name = userMap.get(log.userId) ?? "—";
                const minutes = log._sum.minutes ?? 0;
                const pct = weekHoursTotal
                  ? (minutes / weekHoursTotal) * 100
                  : 0;
                const avatarColors = [
                  { bg: T.accentPrimarySoft, fg: T.accentPrimary },
                  { bg: T.tealSoft, fg: T.teal },
                  { bg: T.violetSoft, fg: T.violet },
                  { bg: T.amberSoft, fg: T.amber },
                  { bg: T.roseSoft, fg: T.rose },
                ];
                const ac = avatarColors[idx % avatarColors.length];
                return (
                  <li
                    key={log.userId}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{
                      backgroundColor: T.panelElevated,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center h-7 w-7 rounded-full flex-shrink-0 text-[10px] font-bold"
                      style={{
                        backgroundColor: ac.bg,
                        color: ac.fg,
                      }}
                    >
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                    <span
                      className="flex-1 min-w-0 truncate text-[13px] font-semibold"
                      style={{ color: T.textPrimary }}
                    >
                      {name}
                    </span>
                    <div
                      className="w-20 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: ac.fg + "18" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: ac.fg,
                        }}
                      />
                    </div>
                    <span
                      className="font-mono font-bold text-[12px] w-16 text-right flex-shrink-0"
                      style={{ color: T.textPrimary }}
                    >
                      {formatHours(minutes)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Row 5 — Recent projects + Overdue/Upcoming */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent projects */}
        <div
          className="xl:col-span-2 rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ОСТАННЯ АКТИВНІСТЬ
              </span>
              <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
                Останні проєкти
              </h2>
            </div>
            <Link
              href="/admin-v2/projects"
              className="flex items-center gap-1.5 text-xs font-semibold transition hover:brightness-[0.97]"
              style={{ color: T.accentPrimary }}
            >
              Усі проєкти <ArrowRight size={14} />
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <EmptyProjects />
          ) : (
            <div className="flex flex-col gap-2">
              {recentProjects.map((project, idx) => {
                const projectColors = [
                  { bg: T.accentPrimarySoft, fg: T.accentPrimary },
                  { bg: T.emeraldSoft, fg: T.emerald },
                  { bg: T.violetSoft, fg: T.violet },
                  { bg: T.skySoft, fg: T.sky },
                  { bg: T.amberSoft, fg: T.amber },
                ];
                const pc = projectColors[idx % projectColors.length];
                return (
                <Link
                  key={project.id}
                  href={`/admin-v2/projects/${project.id}`}
                  className="flex items-center gap-3 rounded-xl p-3.5 transition hover:brightness-[0.97]"
                  style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ backgroundColor: pc.bg, color: pc.fg }}
                  >
                    {project.client?.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold" style={{ color: T.textPrimary }}>
                        {project.title}
                      </span>
                      <StatusBadge status={project.status} />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] min-w-0" style={{ color: T.textMuted }}>
                      <span className="truncate flex-shrink min-w-0">{project.client?.name}</span>
                      {project.manager?.name && (
                        <>
                          <span className="flex-shrink-0">·</span>
                          <span className="truncate flex-shrink min-w-0">{project.manager.name}</span>
                        </>
                      )}
                      <span className="flex-shrink-0">·</span>
                      <span className="flex-shrink-0">{STAGE_LABELS[project.currentStage]}</span>
                    </div>
                  </div>
                  <ArrowRight size={16} style={{ color: T.textMuted }} className="flex-shrink-0" />
                </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Overdue payments + upcoming tasks */}
        <div className="flex flex-col gap-4">
          {/* Overdue payments */}
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                Прострочені платежі
              </h3>
              {overduePayments.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                >
                  {overduePayments.length}
                </span>
              )}
            </div>

            {overduePayments.length === 0 ? (
              <div
                className="flex items-center gap-2 rounded-lg p-3"
                style={{ backgroundColor: T.successSoft }}
              >
                <CheckCircle2 size={16} style={{ color: T.success }} />
                <span className="text-[11px] font-semibold" style={{ color: T.success }}>
                  Всі платежі вчасно
                </span>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {overduePayments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-start gap-2 rounded-lg p-2.5"
                    style={{
                      backgroundColor: T.panelElevated,
                      borderLeft: `3px solid ${T.danger}`,
                    }}
                  >
                    <AlertCircle
                      size={12}
                      style={{ color: T.danger }}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className="truncate text-[12px] font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {payment.project.title}
                      </div>
                      <div className="text-[10px]" style={{ color: T.textMuted }}>
                        {formatDateShort(payment.scheduledDate)}
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold flex-shrink-0"
                      style={{ color: T.danger }}
                    >
                      {formatCurrency(Number(payment.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Upcoming tasks */}
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                Найближчі задачі
              </h3>
              <span
                className="text-[10px]"
                style={{ color: T.textMuted }}
              >
                7 днів
              </span>
            </div>
            {upcomingTasks.length === 0 ? (
              <p className="text-[11px]" style={{ color: T.textMuted }}>
                Немає запланованих задач
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {upcomingTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/admin-v2/projects/${t.project.id}?tab=tasks`}
                      className="flex items-start gap-2 rounded-lg p-2.5 transition hover:brightness-[0.97]"
                      style={{
                        backgroundColor: T.panelElevated,
                        borderLeft: `3px solid ${t.status.color}`,
                      }}
                    >
                      <Zap size={12} style={{ color: t.status.color }} className="mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div
                          className="truncate text-[12px] font-semibold"
                          style={{ color: T.textPrimary }}
                        >
                          {t.title}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: T.textMuted }}>
                          {t.project.title}
                        </div>
                      </div>
                      <span
                        className="text-[10px] font-bold flex-shrink-0"
                        style={{ color: T.textMuted }}
                      >
                        {t.dueDate ? formatDateShort(t.dueDate) : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section
        className="rounded-2xl p-6"
        style={{
          background: "var(--kpi-banner)",
          border: `1px solid ${T.accentPrimary}25`,
          boxShadow: `0 4px 16px ${T.accentPrimary}12`,
        }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})` }}
            >
              <Sparkles size={20} color="#FFFFFF" />
            </div>
            <div className="flex flex-col gap-0">
              <div className="text-sm font-bold" style={{ color: T.textPrimary }}>
                Спробуйте AI генератор кошторисів
              </div>
              <div className="text-[12px]" style={{ color: T.textSecondary }}>
                Створіть детальний кошторис із PDF-документів за ~3 хвилини
              </div>
            </div>
          </div>
          <Link
            href="/ai-estimate-v2"
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
            style={{ background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})` }}
          >
            <Sparkles size={16} /> Згенерувати
          </Link>
        </div>
      </section>

      <p className="text-[11px] text-center" style={{ color: T.textMuted }}>
        Кошторисів у системі: {estimatesCount}
      </p>
    </div>
  );
}

function formatHours(minutes: number): string {
  if (!minutes) return "0год";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}хв`;
  if (m === 0) return `${h}год`;
  return `${h}год ${m}хв`;
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  gradient,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  accent: string;
  gradient?: string;
  href?: string;
}) {
  const content = (
    <div
      className="flex flex-col gap-1.5 rounded-xl sm:rounded-2xl p-3 sm:p-6 h-full transition"
      style={{
        background: gradient || T.panel,
        border: `1px solid ${accent}20`,
        boxShadow: `0 2px 8px ${accent}12`,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] sm:text-[10px] font-bold tracking-wider"
          style={{ color: T.textSecondary }}
        >
          {label}
        </span>
        <div
          className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: accent + "18", border: `1px solid ${accent}30` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <div
        className="text-xl sm:text-3xl md:text-4xl font-bold mt-1 sm:mt-2 truncate"
        style={{ color: T.textPrimary }}
      >
        {value}
      </div>
      <div
        className="text-[10px] sm:text-xs hidden sm:block truncate"
        style={{ color: T.textSecondary }}
      >
        {sub}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="hover:brightness-[0.97] transition">
        {content}
      </Link>
    );
  }
  return content;
}

function FinanceTile({
  label,
  value,
  icon: Icon,
  color,
  emphasize,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-4 rounded-2xl p-5"
      style={{
        background: emphasize
          ? `linear-gradient(135deg, ${color}08 0%, ${color}18 100%)`
          : T.panel,
        border: `1px solid ${emphasize ? color : color + "30"}`,
        boxShadow: emphasize ? `0 4px 12px ${color}18` : `0 1px 4px ${color}10`,
      }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0"
        style={{ backgroundColor: color + "18", border: `1px solid ${color}30` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: T.textSecondary }}
        >
          {label}
        </span>
        <span
          className="text-xl font-bold truncate"
          style={{ color }}
        >
          {formatCurrencyCompact(value)}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: keyof typeof PROJECT_STATUS_LABELS }) {
  const label = PROJECT_STATUS_LABELS[status] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    ACTIVE: { bg: T.successSoft, fg: T.success },
    ON_HOLD: { bg: T.warningSoft, fg: T.warning },
    COMPLETED: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    CANCELLED: { bg: T.dangerSoft, fg: T.danger },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide flex-shrink-0"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function EmptyProjects() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl p-8 text-center"
      style={{ backgroundColor: T.panelElevated }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FolderKanban size={24} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
        Немає проєктів
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Створіть перший проєкт, щоб почати роботу
      </span>
      <Link
        href="/admin-v2/projects/new"
        className="mt-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
        style={{ backgroundColor: T.accentPrimary }}
      >
        <Plus size={16} /> Створити проєкт
      </Link>
    </div>
  );
}
