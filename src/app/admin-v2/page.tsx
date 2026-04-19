import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrencyCompact, formatHours } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import {
  FolderKanban,
  Users,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Sparkles,
  ListTodo,
  Clock,
  Activity,
  Wallet,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiDashboardWidgetWrapper } from "./_components/ai-widget-wrapper";
import { HeroBlock } from "./_components/dashboard/hero-block";
import { NeedsAttention } from "./_components/dashboard/needs-attention";
import { ProjectsAtRisk } from "./_components/dashboard/projects-at-risk";
import { ActivityFeed, buildFeedEvents } from "./_components/dashboard/activity-feed";
import { KpiCard } from "./_components/dashboard/kpi-card";
import { FinanceTile } from "./_components/dashboard/finance-tile";
import { DashboardTabs, type DashboardTabId } from "./_components/dashboard/dashboard-tabs";
import { PeriodSwitcher, type PeriodId } from "./_components/dashboard/period-switcher";
import { TeamPulse } from "./_components/dashboard/team-pulse";
import { UtilityRail } from "./_components/dashboard/utility-rail";

export const dynamic = "force-dynamic";

// --- Period date helpers ---
function getPeriodRange(period: PeriodId, now: Date) {
  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: "сьогодні" };
    }
    case "week": {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { start, end: now, label: "7 днів" };
    }
    case "quarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);
      const end = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999);
      return { start, end, label: "квартал" };
    }
    default: { // month
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end, label: "місяць" };
    }
  }
}

function getPrevPeriodRange(period: PeriodId, now: Date) {
  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "week": {
      const end = new Date(now);
      end.setDate(end.getDate() - 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      return { start, end };
    }
    case "quarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth - 3, 1);
      const end = new Date(now.getFullYear(), qMonth, 0, 23, 59, 59, 999);
      return { start, end };
    }
    default: { // month
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
  }
}

function calcDelta(current: number, previous: number): { value: number; label: string } | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return { value: 100, label: "новий" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return undefined;
  return { value: Math.round(pct * 10) / 10, label: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}% до попереднього періоду` };
}

export default async function AdminV2Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const activeTab = (sp.tab || "overview") as DashboardTabId;
  const activePeriod = (sp.period || "month") as PeriodId;

  const now = new Date();
  const { start: periodStart, end: periodEnd, label: periodLabel } = getPeriodRange(activePeriod, now);
  const { start: prevStart, end: prevEnd } = getPrevPeriodRange(activePeriod, now);
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
    // Finance (current period)
    periodIncome,
    periodExpense,
    // Finance (previous period)
    prevPeriodIncome,
    prevPeriodExpense,
    // Stages distribution
    stageDistribution,
    // Time logs this week
    weekTimeLogs,
    // Upcoming tasks (next 7 days)
    upcomingTasks,
    // Recent AI estimates
    aiEstimatesMonth,
    // Needs Attention data
    overdueTasksDetailed,
    staleProjects,
    dueTodayTasksDetailed,
    // Projects at Risk data
    activeProjects,
    overdueTasksByProject,
    overduePaymentsByProject,
    // Activity Feed data
    recentCompletedTasks,
    recentCreatedTasks,
    recentPaidPayments,
    recentUpdatedProjects,
    // Team Pulse: active tasks per user
    activeTasksByUser,
    // Team Pulse: overdue tasks per user
    overdueTasksByUser,
    // Project deadlines
    projectDeadlines,
    // Previous period time
    prevWeekTimeLogs,
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
    // Finance (current period)
    prisma.financeEntry.aggregate({
      where: {
        type: "INCOME",
        isArchived: false,
        occurredAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: {
        type: "EXPENSE",
        isArchived: false,
        occurredAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    }),
    // Finance (previous period for delta)
    prisma.financeEntry.aggregate({
      where: {
        type: "INCOME",
        isArchived: false,
        occurredAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: {
        type: "EXPENSE",
        isArchived: false,
        occurredAt: { gte: prevStart, lte: prevEnd },
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
      take: 10,
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
      where: { createdAt: { gte: periodStart } },
    }),
    // Overdue tasks detailed
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
    // Stale projects
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
    // Due today tasks detailed
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
    // Active projects for risk scoring
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      include: {
        client: { select: { name: true } },
        manager: { select: { name: true } },
      },
    }),
    // Overdue tasks grouped by project
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { lt: now },
      },
      _count: { id: true },
    }),
    // Overdue payments grouped by project
    prisma.payment.groupBy({
      by: ["projectId"],
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: now },
      },
      _count: { id: true },
    }),
    // Activity Feed - completed tasks
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
    // Activity Feed - created tasks
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
    // Activity Feed - paid payments
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
    // Activity Feed - updated projects
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
    // Team Pulse: active tasks per user (via TaskAssignee)
    prisma.taskAssignee.groupBy({
      by: ["userId"],
      where: {
        task: { isArchived: false, status: { isDone: false } },
      },
      _count: { userId: true },
    }),
    // Team Pulse: overdue tasks per user
    prisma.taskAssignee.groupBy({
      by: ["userId"],
      where: {
        task: {
          isArchived: false,
          status: { isDone: false },
          dueDate: { lt: now },
        },
      },
      _count: { userId: true },
    }),
    // Project deadlines (next 30 days)
    prisma.project.findMany({
      where: {
        status: "ACTIVE",
        expectedEndDate: {
          gte: now,
          lte: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        },
      },
      select: { id: true, title: true, expectedEndDate: true },
      orderBy: { expectedEndDate: "asc" },
      take: 5,
    }),
    // Previous period time logs total
    prisma.timeLog.aggregate({
      where: {
        endedAt: { not: null },
        startedAt: {
          gte: new Date(startOfWeek.getTime() - 7 * 24 * 3600 * 1000),
          lt: startOfWeek,
        },
      },
      _sum: { minutes: true },
    }),
  ]);

  const revenue = Number(totalRevenuePaid._sum.amount || 0);
  const portfolio = Number(portfolioBudget._sum.totalBudget || 0);
  const income = Number(periodIncome._sum.amount || 0);
  const expense = Number(periodExpense._sum.amount || 0);
  const netProfit = income - expense;
  const prevIncome = Number(prevPeriodIncome._sum.amount || 0);
  const prevExpense = Number(prevPeriodExpense._sum.amount || 0);
  const prevNetProfit = prevIncome - prevExpense;
  const prevWeekMinutes = prevWeekTimeLogs._sum.minutes ?? 0;

  // Deltas
  const incomeDelta = calcDelta(income, prevIncome);
  const expenseDelta = calcDelta(expense, prevExpense);
  const netDelta = calcDelta(netProfit, prevNetProfit);

  // Load user names for time logs
  const allUserIds = [
    ...weekTimeLogs.map((l) => l.userId),
    ...activeTasksByUser.map((a) => a.userId),
    ...overdueTasksByUser.map((a) => a.userId),
  ];
  const uniqueUserIds = [...new Set(allUserIds)];
  const users =
    uniqueUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: uniqueUserIds } },
          select: { id: true, name: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const weekHoursTotal = weekTimeLogs.reduce(
    (acc, l) => acc + (l._sum.minutes ?? 0),
    0,
  );
  const weekHoursDelta = calcDelta(weekHoursTotal, prevWeekMinutes);

  // Build Team Pulse members
  const activeTaskMap = new Map(
    activeTasksByUser.map((a) => [a.userId, a._count.userId]),
  );
  const overdueTaskUserMap = new Map(
    overdueTasksByUser.map((a) => [a.userId, a._count.userId]),
  );
  const teamMembers = weekTimeLogs.map((log) => ({
    id: log.userId,
    name: userMap.get(log.userId) ?? "—",
    minutes: log._sum.minutes ?? 0,
    activeTaskCount: activeTaskMap.get(log.userId) ?? 0,
    overdueTaskCount: overdueTaskUserMap.get(log.userId) ?? 0,
  }));

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

  // Build Projects at Risk
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
      return { ...p, overdueTaskCount, overduePaymentCount, isStale, riskScore };
    })
    .filter((p) => p.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);

  // Build Activity Feed
  const feedEvents = buildFeedEvents({
    completedTasks: recentCompletedTasks,
    createdTasks: recentCreatedTasks,
    paidPayments: recentPaidPayments,
    updatedProjects: recentUpdatedProjects,
  });

  // Period label for finance
  const periodLabels: Record<PeriodId, string> = {
    today: "СЬОГОДНІ",
    week: "ТИЖДЕНЬ",
    month: "МІСЯЦЬ",
    quarter: "КВАРТАЛ",
  };
  const finPeriod = periodLabels[activePeriod];

  return (
    <div className="flex flex-col gap-6">
      {/* Dashboard Tabs + Period Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Suspense>
          <DashboardTabs active={activeTab} />
        </Suspense>
        <Suspense>
          <PeriodSwitcher active={activePeriod} />
        </Suspense>
      </div>

      {/* Overview tab content */}
      {activeTab === "overview" && (
        <>
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
              delta={weekHoursDelta}
            />
            <KpiCard
              label="AI КОШТОРИСИ"
              value={String(aiEstimatesMonth)}
              sub={`за ${periodLabel}`}
              icon={Sparkles}
              accent={T.indigo}
              gradient="var(--kpi-indigo)"
              href="/ai-estimate-v2"
            />
          </section>

          {/* Row 3 — Finance */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            <FinanceTile
              label={`ДОХІД (${finPeriod})`}
              value={income}
              icon={TrendingUp}
              color={T.success}
              delta={incomeDelta}
            />
            <FinanceTile
              label={`ВИТРАТИ (${finPeriod})`}
              value={expense}
              icon={TrendingDown}
              color={T.danger}
              delta={expenseDelta}
            />
            <FinanceTile
              label="ЧИСТИЙ ПРИБУТОК"
              value={netProfit}
              icon={Activity}
              color={netProfit >= 0 ? T.success : T.danger}
              emphasize
              delta={netDelta}
            />
          </section>

          {/* Row 4 — Stage distribution + Team Pulse */}
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
                  <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                    ПОТОК РОБОТИ
                  </span>
                  <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
                    Розподіл активних проєктів
                  </h2>
                </div>
                <span className="text-[11px]" style={{ color: T.textMuted }}>
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
                        <span className="text-[11px] font-semibold w-28 flex-shrink-0" style={{ color: T.textSecondary }}>
                          {STAGE_LABELS[stage]}
                        </span>
                        <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ backgroundColor: barColor + "12" }}>
                          <div
                            className="h-full rounded-md flex items-center justify-end pr-2 text-[10px] font-bold"
                            style={{
                              width: `${Math.max(pct, count > 0 ? 6 : 0)}%`,
                              background: count > 0 ? `linear-gradient(90deg, ${barColor}cc, ${barColor})` : "transparent",
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

            {/* Team Pulse 2.0 */}
            <TeamPulse
              members={teamMembers}
              totalMinutes={weekHoursTotal}
              periodLabel={periodLabel}
            />
          </section>

          {/* Row 5 — Activity Feed + Projects/Utility */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left 2/3: Activity + Projects at Risk */}
            <div className="xl:col-span-2 flex flex-col gap-6">
              <ActivityFeed events={feedEvents} />
              <ProjectsAtRisk projects={projectsAtRisk} />
            </div>

            {/* Right 1/3: Utility Rail */}
            <UtilityRail
              overduePayments={overduePayments}
              upcomingTasks={upcomingTasks}
              projectDeadlines={projectDeadlines.map((p) => ({
                ...p,
                expectedEndDate: p.expectedEndDate!,
              }))}
            />
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
        </>
      )}

      {/* Projects tab - placeholder */}
      {activeTab === "projects" && (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
          <FolderKanban size={40} style={{ color: T.accentPrimary }} className="mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2" style={{ color: T.textPrimary }}>Огляд проєктів</h2>
          <p className="text-[13px] mb-4" style={{ color: T.textSecondary }}>Розширений вигляд проєктів скоро буде доступний</p>
          <Link href="/admin-v2/projects" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: T.accentPrimary }}>
            Перейти до проєктів
          </Link>
        </div>
      )}

      {/* Team tab - placeholder */}
      {activeTab === "team" && (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
          <Users size={40} style={{ color: T.teal }} className="mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2" style={{ color: T.textPrimary }}>Огляд команди</h2>
          <p className="text-[13px] mb-4" style={{ color: T.textSecondary }}>Розширений Team Pulse скоро буде доступний</p>
          <Link href="/admin-v2/me?scope=all" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: T.teal }}>
            Переглянути команду
          </Link>
        </div>
      )}

      {/* Finance tab - placeholder */}
      {activeTab === "finance" && (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
          <Wallet size={40} style={{ color: T.emerald }} className="mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2" style={{ color: T.textPrimary }}>Огляд фінансів</h2>
          <p className="text-[13px] mb-4" style={{ color: T.textSecondary }}>Розширений Finance Pulse скоро буде доступний</p>
          <Link href="/admin-v2/finance" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: T.emerald }}>
            Переглянути фінанси
          </Link>
        </div>
      )}
    </div>
  );
}
