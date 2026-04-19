import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrency, formatCurrencyCompact, formatDateShort, formatHours } from "@/lib/utils";
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
import { AiDashboardWidgetWrapper } from "./_components/ai-widget-wrapper";
import { HeroBlock } from "./_components/dashboard/hero-block";
import { NeedsAttention } from "./_components/dashboard/needs-attention";
import { ProjectsAtRisk } from "./_components/dashboard/projects-at-risk";
import { ActivityFeed, buildFeedEvents } from "./_components/dashboard/activity-feed";
import { KpiCard } from "./_components/dashboard/kpi-card";
import { FinanceTile } from "./_components/dashboard/finance-tile";
import { StatusBadge } from "./_components/dashboard/status-badge";
import { EmptyProjects } from "./_components/dashboard/empty-projects";

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
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);

  const [
    projectsCount,
    activeProjectsCount,
    clientsCount,
    estimatesCount,
    totalRevenuePaid,
    portfolioBudget,
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
    // --- NEW: Needs Attention data ---
    overdueTasksDetailed,
    staleProjects,
    dueTodayTasksDetailed,
    // --- NEW: Projects at Risk data ---
    activeProjects,
    overdueTasksByProject,
    overduePaymentsByProject,
    // --- NEW: Activity Feed data ---
    recentCompletedTasks,
    recentCreatedTasks,
    recentPaidPayments,
    recentUpdatedProjects,
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
    prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: now },
      },
      include: { project: { select: { id: true, title: true } } },
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
    // --- NEW: Overdue tasks detailed ---
    prisma.task.findMany({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { lt: now },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        project: { select: { id: true, title: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    // --- NEW: Stale projects (no updates 14+ days) ---
    prisma.project.findMany({
      where: {
        status: "ACTIVE",
        updatedAt: { lt: fourteenDaysAgo },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        manager: { select: { name: true } },
      },
      take: 5,
    }),
    // --- NEW: Due today tasks detailed ---
    prisma.task.findMany({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { gte: startOfToday, lte: endOfToday },
      },
      select: {
        id: true,
        title: true,
        project: { select: { id: true, title: true } },
        status: { select: { name: true, color: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    // --- NEW: Active projects for risk scoring ---
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      include: {
        client: { select: { name: true } },
        manager: { select: { name: true } },
      },
    }),
    // --- NEW: Overdue tasks grouped by project ---
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { lt: now },
      },
      _count: { id: true },
    }),
    // --- NEW: Overdue payments grouped by project ---
    prisma.payment.groupBy({
      by: ["projectId"],
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: now },
      },
      _count: { id: true },
    }),
    // --- NEW: Activity Feed - completed tasks ---
    prisma.task.findMany({
      where: {
        status: { isDone: true },
        completedAt: { gte: startOfWeek },
      },
      select: {
        id: true,
        title: true,
        completedAt: true,
        project: { select: { id: true, title: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 10,
    }),
    // --- NEW: Activity Feed - created tasks ---
    prisma.task.findMany({
      where: {
        isArchived: false,
        createdAt: { gte: startOfWeek },
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        project: { select: { id: true, title: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // --- NEW: Activity Feed - paid payments ---
    prisma.payment.findMany({
      where: {
        paidDate: { gte: startOfWeek },
        status: "PAID",
      },
      select: {
        id: true,
        amount: true,
        paidDate: true,
        project: { select: { id: true, title: true } },
      },
      orderBy: { paidDate: "desc" },
      take: 10,
    }),
    // --- NEW: Activity Feed - updated projects ---
    prisma.project.findMany({
      where: {
        updatedAt: { gte: startOfWeek },
      },
      select: {
        id: true,
        title: true,
        currentStage: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
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

  // Stage distribution map
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

  // --- Build Projects at Risk ---
  const overdueTaskMap = new Map(
    overdueTasksByProject.map((g) => [g.projectId, g._count.id]),
  );
  const overduePaymentMap = new Map(
    overduePaymentsByProject.map((g) => [g.projectId, g._count.id]),
  );
  const projectsAtRisk = activeProjects
    .map((p) => {
      const overdueTaskCount = overdueTaskMap.get(p.id) ?? 0;
      const overduePaymentCount = overduePaymentMap.get(p.id) ?? 0;
      const isStale = p.updatedAt < fourteenDaysAgo;
      const riskScore =
        overdueTaskCount * 3 + overduePaymentCount * 5 + (isStale ? 1 : 0);
      return {
        ...p,
        overdueTaskCount,
        overduePaymentCount,
        isStale,
        riskScore,
      };
    })
    .filter((p) => p.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);

  // --- Build Activity Feed ---
  const feedEvents = buildFeedEvents({
    completedTasks: recentCompletedTasks,
    createdTasks: recentCreatedTasks,
    paidPayments: recentPaidPayments,
    updatedProjects: recentUpdatedProjects,
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Hero / State of Business */}
      <HeroBlock
        firstName={firstName}
        today={today}
        activeProjectsCount={activeProjectsCount}
        overdueTasksCount={overdueTasksCount}
        overduePaymentsCount={overduePayments.length}
        netProfit={netProfit}
      />

      {/* Needs Attention */}
      <NeedsAttention
        overdueTasks={overdueTasksDetailed}
        overduePayments={overduePayments}
        staleProjects={staleProjects}
        dueTodayTasks={dueTodayTasksDetailed}
      />

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

      {/* Activity Feed */}
      <ActivityFeed events={feedEvents} />

      {/* Row 5 — Projects at Risk + Overdue/Upcoming */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Projects at Risk */}
        <ProjectsAtRisk projects={projectsAtRisk} />

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

      {/* AI Insights Widget */}
      <AiDashboardWidgetWrapper />

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
