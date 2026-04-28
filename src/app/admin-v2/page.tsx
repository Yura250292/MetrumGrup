import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrencyCompact, formatHours } from "@/lib/utils";
import type { ProjectStage, Role } from "@prisma/client";
import {
  FolderKanban,
  Users,
  TrendingUp,
  AlertCircle,
  Sparkles,
  ListTodo,
  Clock,
  Wallet,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiDashboardWidgetWrapper } from "./_components/ai-widget-wrapper";
import { HeroBlock } from "./_components/dashboard/hero-block";
import { NeedsAttention } from "./_components/dashboard/needs-attention";
import { ProjectsAtRisk } from "./_components/dashboard/projects-at-risk";
import { ActivityFeed, buildFeedEvents } from "./_components/dashboard/activity-feed";
import { KpiCard } from "./_components/dashboard/kpi-card";
import { DashboardTabs, type DashboardTabId } from "./_components/dashboard/dashboard-tabs";
import { PeriodSwitcher, type PeriodId } from "./_components/dashboard/period-switcher";
import { TeamPulse } from "./_components/dashboard/team-pulse";
import { UtilityRail } from "./_components/dashboard/utility-rail";
import { FinancePulse } from "./_components/dashboard/finance-pulse";
import { StageAnalytics } from "./_components/dashboard/stage-analytics";
import { DashboardShell, DashboardWidgetConfigButton } from "./_components/dashboard/dashboard-shell";
import { DashboardGrid } from "./_components/dashboard/dashboard-grid";
import { AiSummary } from "./_components/dashboard/ai-summary";
import { HrDashboard } from "./_components/dashboard/hr-dashboard";
import {
  projectNotTestByFirm,
  financeEntryNotTestByFirm,
  paymentNotTestByFirm,
  taskNotTestByFirm,
} from "@/lib/projects/filters";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  KNOWN_FIRMS,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { NonHomeFirmBanner } from "./_components/non-home-firm-banner";

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
  searchParams: Promise<{ tab?: string; period?: string; firm?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const activeTab = (sp.tab || "overview") as DashboardTabId;

  // SUPER_ADMIN може перемикати firm через ?firm=... (одноразово) або через
  // dropdown у хедері (cookie). Інші ролі — firmId примусово з сесії.
  const firmOverride =
    session.user.role === "SUPER_ADMIN" && sp.firm ? sp.firm : undefined;
  const { firmId, userFirmId } = await resolveFirmScopeForRequest(
    session,
    firmOverride,
  );
  const isHome = isHomeFirmFor(session, firmId);
  const homeFirmId = userFirmId ?? null;
  const activeRole = getActiveRoleFromSession(session, firmId) ?? session.user.role;
  const PROJECT_SCOPE = projectNotTestByFirm(firmId);
  const FINANCE_SCOPE = financeEntryNotTestByFirm(firmId);
  const PAYMENT_SCOPE = paymentNotTestByFirm(firmId);
  const TASK_SCOPE = taskNotTestByFirm(firmId);

  const firstName = session.user.name?.split(" ")[0] || "Адміністратор";
  const today = new Date().toLocaleDateString("uk-UA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // HR dashboard рендериться коли активна роль (з урахуванням firm-context) — HR.
  // Наприклад shymilo93 на Metrum Group → HR; на Metrum Studio → SUPER_ADMIN (нормальний дашборд).
  if (activeRole === "HR") {
    return <HrDashboard firstName={firstName} today={today} />;
  }
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
    // P2: Finance breakdowns
    expenseByCategoryRaw,
    incomeByCategoryRaw,
    // P2: Stage analytics
    completedStageRecords,
  ] = await Promise.all([
    prisma.project.count({ where: PROJECT_SCOPE }),
    prisma.project.count({ where: { status: "ACTIVE", ...PROJECT_SCOPE } }),
    prisma.user.count({ where: { role: "CLIENT", ...(firmId ? { firmId } : {}) } }),
    prisma.estimate.count({ where: firmId ? { project: { firmId } } : {} }),
    prisma.payment.aggregate({
      where: { status: "PAID", ...PAYMENT_SCOPE },
      _sum: { amount: true },
    }),
    prisma.project.aggregate({
      where: { status: { in: ["ACTIVE", "DRAFT"] }, ...PROJECT_SCOPE },
      _sum: { totalBudget: true },
    }),
    prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: now },
        ...PAYMENT_SCOPE,
      },
      include: { project: { select: { id: true, title: true } } },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),
    // Tasks counts
    prisma.task.count({
      where: { isArchived: false, status: { isDone: false }, ...TASK_SCOPE },
    }),
    prisma.task.count({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { lt: now },
        ...TASK_SCOPE,
      },
    }),
    prisma.task.count({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { gte: startOfToday, lte: endOfToday },
        ...TASK_SCOPE,
      },
    }),
    prisma.task.count({
      where: {
        status: { isDone: true },
        completedAt: { gte: startOfWeek },
        ...TASK_SCOPE,
      },
    }),
    // Finance (current period)
    prisma.financeEntry.aggregate({
      where: {
        type: "INCOME",
        isArchived: false,
        occurredAt: { gte: periodStart, lte: periodEnd },
        ...FINANCE_SCOPE,
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: {
        type: "EXPENSE",
        isArchived: false,
        occurredAt: { gte: periodStart, lte: periodEnd },
        ...FINANCE_SCOPE,
      },
      _sum: { amount: true },
    }),
    // Finance (previous period for delta)
    prisma.financeEntry.aggregate({
      where: {
        type: "INCOME",
        isArchived: false,
        occurredAt: { gte: prevStart, lte: prevEnd },
        ...FINANCE_SCOPE,
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: {
        type: "EXPENSE",
        isArchived: false,
        occurredAt: { gte: prevStart, lte: prevEnd },
        ...FINANCE_SCOPE,
      },
      _sum: { amount: true },
    }),
    // Stages
    prisma.project.groupBy({
      by: ["currentStage"],
      where: { status: "ACTIVE", ...PROJECT_SCOPE },
      _count: { currentStage: true },
    }),
    // Time logs this week
    prisma.timeLog.groupBy({
      by: ["userId"],
      where: {
        endedAt: { not: null },
        startedAt: { gte: startOfWeek },
        ...(firmId ? { user: { firmId } } : {}),
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
        ...TASK_SCOPE,
      },
      include: {
        project: { select: { id: true, title: true } },
        status: { select: { name: true, color: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.estimate.count({
      where: {
        createdAt: { gte: periodStart },
        ...(firmId ? { project: { firmId } } : {}),
      },
    }),
    // Overdue tasks detailed
    prisma.task.findMany({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { lt: now },
        ...TASK_SCOPE,
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
        ...PROJECT_SCOPE,
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
        ...TASK_SCOPE,
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
      where: { status: "ACTIVE", ...PROJECT_SCOPE },
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
        ...TASK_SCOPE,
      },
      _count: { id: true },
    }),
    // Overdue payments grouped by project
    prisma.payment.groupBy({
      by: ["projectId"],
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: now },
        ...PAYMENT_SCOPE,
      },
      _count: { id: true },
    }),
    // Activity Feed - completed tasks
    prisma.task.findMany({
      where: {
        status: { isDone: true },
        completedAt: { gte: startOfWeek },
        ...TASK_SCOPE,
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
        ...TASK_SCOPE,
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
        ...PAYMENT_SCOPE,
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
        ...PROJECT_SCOPE,
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
        task: {
          isArchived: false,
          status: { isDone: false },
          ...(firmId ? { project: { firmId } } : {}),
        },
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
          ...(firmId ? { project: { firmId } } : {}),
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
        ...PROJECT_SCOPE,
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
        ...(firmId ? { user: { firmId } } : {}),
      },
      _sum: { minutes: true },
    }),
    // P2: Expense breakdown by category
    prisma.financeEntry.groupBy({
      by: ["category"],
      where: {
        type: "EXPENSE",
        isArchived: false,
        occurredAt: { gte: periodStart, lte: periodEnd },
        ...FINANCE_SCOPE,
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    // P2: Income breakdown by category
    prisma.financeEntry.groupBy({
      by: ["category"],
      where: {
        type: "INCOME",
        isArchived: false,
        occurredAt: { gte: periodStart, lte: periodEnd },
        ...FINANCE_SCOPE,
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    // P2: Stage analytics — completed stages with dates
    prisma.projectStageRecord.findMany({
      where: {
        status: "COMPLETED",
        startDate: { not: null },
        endDate: { not: null },
        ...(firmId ? { project: { firmId } } : {}),
      },
      select: {
        stage: true,
        startDate: true,
        endDate: true,
      },
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

  // Stage distribution map
  const stageMap = new Map<ProjectStage, number>();
  for (const s of stageDistribution) {
    stageMap.set(s.currentStage, s._count.currentStage);
  }
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

  // P2: Finance category breakdowns
  const expenseByCategory = expenseByCategoryRaw.map((e) => ({
    category: e.category,
    amount: Number(e._sum.amount ?? 0),
  }));
  const incomeByCategory = incomeByCategoryRaw.map((e) => ({
    category: e.category,
    amount: Number(e._sum.amount ?? 0),
  }));

  // P2: Stage analytics — average days per stage
  const stageDurations = new Map<ProjectStage, number[]>();
  for (const rec of completedStageRecords) {
    if (!rec.startDate || !rec.endDate) continue;
    const days = Math.round(
      (rec.endDate.getTime() - rec.startDate.getTime()) / 86400000,
    );
    if (days <= 0) continue;
    if (!rec.stage) continue;
    const arr = stageDurations.get(rec.stage) ?? [];
    arr.push(days);
    stageDurations.set(rec.stage, arr);
  }
  const stageAverages = Array.from(stageDurations.entries()).map(
    ([stage, durations]) => ({
      stage,
      avgDays: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      count: durations.length,
    }),
  );

  // P2: Role-based visibility
  // Видимість блоків — за активною роллю (з урахуванням firm-context).
  const role = activeRole;
  const isAdmin = role === "SUPER_ADMIN" || role === "MANAGER";
  const isFinancier = role === "FINANCIER";
  const isEngineer = role === "ENGINEER";
  const showBusinessKpis = isAdmin || isFinancier;
  const showTaskKpis = isAdmin || isEngineer;
  const showFinance = isAdmin || isFinancier;
  const showTeam = isAdmin;
  const showStages = isAdmin || isEngineer;

  // Period label for finance
  const periodLabels: Record<PeriodId, string> = {
    today: "СЬОГОДНІ",
    week: "ТИЖДЕНЬ",
    month: "МІСЯЦЬ",
    quarter: "КВАРТАЛ",
  };
  const finPeriod = periodLabels[activePeriod];

  // Банер для не-SUPER_ADMIN, що перемкнувся на чужу фірму. SUPER_ADMIN не бачить.
  const showNonHomeBanner =
    !isHome && session.user.role !== "SUPER_ADMIN" && homeFirmId;
  const activeFirmName =
    (firmId && KNOWN_FIRMS[firmId]?.name) ?? "Усі фірми";
  const homeFirmName =
    (homeFirmId && KNOWN_FIRMS[homeFirmId]?.name) ?? "вашу фірму";

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {showNonHomeBanner && (
        <NonHomeFirmBanner
          activeFirmName={activeFirmName}
          homeFirmId={homeFirmId as string}
          homeFirmName={homeFirmName}
        />
      )}
      {/* Hero — always on top */}
      <HeroBlock
        firstName={firstName}
        today={today}
        activeProjectsCount={activeProjectsCount}
        overdueTasksCount={overdueTasksCount}
        overduePaymentsCount={overduePayments.length}
        netProfit={netProfit}
        role={role}
        dueTodayCount={dueTodayTasksCount}
      />

      {/* Tabs alone for non-overview tabs */}
      {activeTab !== "overview" && (
        <Suspense>
          <DashboardTabs active={activeTab} />
        </Suspense>
      )}

      {/* Overview tab — tabs + period + config in one row, then grid */}
      {activeTab === "overview" && (
        <Suspense>
          <DashboardShell>
            {/* Single toolbar row: tabs left, period + config right (stacks on mobile) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
              <Suspense>
                <DashboardTabs active={activeTab} />
              </Suspense>
              <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
                <Suspense>
                  <PeriodSwitcher active={activePeriod} />
                </Suspense>
                <DashboardWidgetConfigButton />
              </div>
            </div>

            <DashboardGrid
              slots={{
                "ai-summary": <AiSummary />,
                attention: (
                  <NeedsAttention
                    overdueTasks={overdueTasksDetailed}
                    overduePayments={overduePayments}
                    staleProjects={staleProjects}
                    dueTodayTasks={dueTodayTasksDetailed}
                  />
                ),
                "kpi-business": showBusinessKpis ? (
                  <div className="flex flex-col gap-2.5 h-full">
                    <h3
                      className="text-[10.5px] font-semibold uppercase px-1"
                      style={{ color: "var(--t-text-3)", letterSpacing: "0.08em" }}
                    >
                      Бізнес-метрики
                    </h3>
                  <section className="grid flex-1 grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                    <KpiCard
                      label="ПРОЄКТИ"
                      value={String(projectsCount)}
                      numericValue={projectsCount}
                      sub={`${activeProjectsCount} активних`}
                      icon={FolderKanban}
                      accent={T.accentPrimary}
                      href="/admin-v2/projects"
                      glowClass="premium-glow-blue"
                      delay={0.0}
                    />
                    <KpiCard
                      label="КЛІЄНТИ"
                      value={String(clientsCount)}
                      numericValue={clientsCount}
                      sub="облікових записів"
                      icon={Users}
                      accent={T.teal}
                      href="/admin-v2/clients"
                      glowClass="premium-glow-cyan"
                      delay={0.06}
                    />
                    <KpiCard
                      label="ПОРТФЕЛЬ"
                      value={formatCurrencyCompact(portfolio)}
                      sub="загальний бюджет"
                      icon={Wallet}
                      accent={T.violet}
                      href="/admin-v2/projects"
                      glowClass="premium-glow-violet"
                      delay={0.12}
                    />
                    <KpiCard
                      label="СПЛАЧЕНО"
                      value={formatCurrencyCompact(revenue)}
                      sub="усього по платежах"
                      icon={TrendingUp}
                      accent={T.emerald}
                      glowClass="premium-glow-emerald"
                      delay={0.18}
                    />
                  </section>
                  </div>
                ) : null,
                "kpi-tasks": showTaskKpis ? (
                  <div className="flex flex-col gap-2.5 h-full">
                    <h3
                      className="text-[10.5px] font-semibold uppercase px-1"
                      style={{ color: "var(--t-text-3)", letterSpacing: "0.08em" }}
                    >
                      Задачі та виконання
                    </h3>
                  <section className="grid flex-1 grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                    <KpiCard
                      label="АКТИВНІ ЗАДАЧІ"
                      value={String(activeTasksCount)}
                      numericValue={activeTasksCount}
                      sub={`${completedWeekTasksCount} завершено за тиждень`}
                      icon={ListTodo}
                      accent={T.sky}
                      href="/admin-v2/me"
                      glowClass="premium-glow-sky"
                      delay={0.0}
                    />
                    <KpiCard
                      label="ПРОСТРОЧЕНО"
                      value={String(overdueTasksCount)}
                      numericValue={overdueTasksCount}
                      sub={`${dueTodayTasksCount} на сьогодні`}
                      icon={AlertCircle}
                      accent={overdueTasksCount > 0 ? T.danger : T.textMuted}
                      href="/admin-v2/me"
                      glowClass={overdueTasksCount > 0 ? "premium-glow-rose" : ""}
                      delay={0.06}
                    />
                    <KpiCard
                      label="ГОДИН ЗА ТИЖДЕНЬ"
                      value={formatHours(weekHoursTotal)}
                      sub={`${weekTimeLogs.length} співробітників`}
                      icon={Clock}
                      accent={T.amber}
                      delta={weekHoursDelta}
                      glowClass="premium-glow-amber"
                      delay={0.12}
                    />
                    <KpiCard
                      label="AI КОШТОРИСИ"
                      value={String(aiEstimatesMonth)}
                      numericValue={aiEstimatesMonth}
                      sub={`за ${periodLabel}`}
                      icon={Sparkles}
                      accent={T.indigo}
                      href="/ai-estimate-v2"
                      glowClass="premium-glow-violet"
                      delay={0.18}
                    />
                  </section>
                  </div>
                ) : null,
                utility: (
                  <UtilityRail
                    overduePayments={overduePayments}
                    upcomingTasks={upcomingTasks}
                    projectDeadlines={projectDeadlines.map((p) => ({
                      ...p,
                      expectedEndDate: p.expectedEndDate!,
                    }))}
                  />
                ),
                "finance-pulse": showFinance ? (
                  <FinancePulse
                    income={income}
                    expense={expense}
                    netProfit={netProfit}
                    incomeDelta={incomeDelta}
                    expenseDelta={expenseDelta}
                    netDelta={netDelta}
                    periodLabel={finPeriod}
                    expenseByCategory={expenseByCategory}
                    incomeByCategory={incomeByCategory}
                    overduePaymentsCount={overduePayments.length}
                  />
                ) : null,
                stages: showStages ? (
                  <StageAnalytics
                    stageMap={stageMap}
                    activeProjectsCount={activeProjectsCount}
                    stageAverages={stageAverages}
                  />
                ) : null,
                team: showTeam ? (
                  <TeamPulse
                    members={teamMembers}
                    totalMinutes={weekHoursTotal}
                    periodLabel={periodLabel}
                  />
                ) : null,
                "projects-risk": <ProjectsAtRisk projects={projectsAtRisk} />,
                activity: <ActivityFeed events={feedEvents} />,
                "ai-widget": <AiDashboardWidgetWrapper />,
              }}
            />
          </DashboardShell>
        </Suspense>
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

      {/* Financing tab — redirects via dashboard-tabs.tsx */}
    </div>
  );
}
