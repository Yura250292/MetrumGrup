import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProjectsWithAggregations } from "@/lib/projects/aggregations";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { canViewFinance } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FilePlus,
  FileText,
  FolderKanban,
  HardHat,
  HelpCircle,
  Percent,
  PlusCircle,
  Send,
  Sun,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

const COMPANY_TARGET_MARGIN_PCT = 22;

export default async function DashboardV2Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  const showFinance = canViewFinance(session.user.role);

  const restrictToMember =
    session.user.role === "FINANCIER" ? session.user.id : null;
  const projects = await listProjectsWithAggregations(session.user.id, {
    firmId,
    restrictToMemberOfUserId: restrictToMember,
  });

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;
  const totalBudget = projects.reduce((s, p) => s + Number(p.totalBudget ?? 0), 0);
  const totalPaid = projects.reduce((s, p) => s + Number(p.totalPaid ?? 0), 0);
  const budgetUsedPct = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const periodDays = 30;
  const periodStart = new Date(now.getTime() - (periodDays - 1) * 86_400_000);
  periodStart.setHours(0, 0, 0, 0);

  const [
    monthIncome,
    monthExpense,
    overdueStagesRaw,
    pendingReports,
    openRfis,
    periodEntries,
    todayForemanReports,
    activeNowStages,
    recentForemanReports,
    recentCompletedStages,
    recentIncomeEntries,
    recentChangeOrders,
  ] = await Promise.all([
    showFinance
      ? prisma.financeEntry.aggregate({
          where: {
            type: "INCOME",
            kind: "FACT",
            isArchived: false,
            occurredAt: { gte: startOfMonth },
            ...(firmId ? { project: { firmId } } : {}),
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
    showFinance
      ? prisma.financeEntry.aggregate({
          where: {
            type: "EXPENSE",
            kind: "FACT",
            isArchived: false,
            occurredAt: { gte: startOfMonth },
            ...(firmId ? { project: { firmId } } : {}),
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
    prisma.projectStageRecord.findMany({
      where: {
        status: { not: "COMPLETED" },
        endDate: { lt: now },
        ...(firmId ? { project: { firmId } } : {}),
      },
      select: {
        id: true,
        customName: true,
        stage: true,
        endDate: true,
        project: { select: { id: true, title: true, slug: true, code: true } },
      },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.foremanReport.count({
      where: {
        status: "PENDING_APPROVAL",
        ...(firmId ? { firmId } : {}),
      },
    }),
    prisma.rFI
      .count({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          ...(firmId ? { project: { firmId } } : {}),
        },
      })
      .catch(() => 0),
    showFinance
      ? prisma.financeEntry.findMany({
          where: {
            kind: "FACT",
            isArchived: false,
            occurredAt: { gte: periodStart },
            type: { in: ["INCOME", "EXPENSE"] },
            ...(firmId ? { project: { firmId } } : {}),
          },
          select: {
            occurredAt: true,
            amount: true,
            type: true,
            projectId: true,
          },
          take: 8000,
        })
      : Promise.resolve(
          [] as Array<{
            occurredAt: Date;
            amount: unknown;
            type: string;
            projectId: string | null;
          }>,
        ),
    prisma.foremanReport.findMany({
      where: {
        OR: [
          { submittedAt: { gte: startOfDay } },
          { createdAt: { gte: startOfDay } },
        ],
        ...(firmId ? { firmId } : {}),
      },
      select: { createdById: true, projectId: true },
      take: 500,
    }),
    prisma.projectStageRecord.findMany({
      where: {
        status: "IN_PROGRESS",
        ...(firmId ? { project: { firmId } } : {}),
      },
      select: {
        customName: true,
        stage: true,
        project: { select: { title: true } },
        actualStartDate: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    prisma.foremanReport.findMany({
      where: {
        status: { in: ["PENDING_APPROVAL", "APPROVED"] },
        submittedAt: { not: null, gte: new Date(now.getTime() - 7 * 86_400_000) },
        ...(firmId ? { firmId } : {}),
      },
      select: {
        id: true,
        submittedAt: true,
        totalCalculated: true,
        createdBy: { select: { name: true } },
        project: { select: { id: true, title: true, slug: true, code: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 3,
    }),
    prisma.projectStageRecord.findMany({
      where: {
        status: "COMPLETED",
        actualEndDate: { gte: new Date(now.getTime() - 7 * 86_400_000) },
        ...(firmId ? { project: { firmId } } : {}),
      },
      select: {
        id: true,
        customName: true,
        stage: true,
        actualEndDate: true,
        endDate: true,
        project: { select: { id: true, title: true, code: true, slug: true } },
      },
      orderBy: { actualEndDate: "desc" },
      take: 3,
    }),
    showFinance
      ? prisma.financeEntry.findMany({
          where: {
            type: "INCOME",
            kind: "FACT",
            isArchived: false,
            occurredAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
            ...(firmId ? { project: { firmId } } : {}),
          },
          select: {
            id: true,
            amount: true,
            occurredAt: true,
            title: true,
            project: { select: { id: true, title: true, code: true, slug: true } },
          },
          orderBy: { occurredAt: "desc" },
          take: 3,
        })
      : Promise.resolve(
          [] as Array<{
            id: string;
            amount: unknown;
            occurredAt: Date;
            title: string;
            project: { id: string; title: string; code: string | null; slug: string } | null;
          }>,
        ),
    prisma.changeOrder
      .findMany({
        where: {
          status: { in: ["PENDING_PM", "PENDING_ADMIN", "APPROVED"] },
          updatedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
          ...(firmId ? { firmId } : {}),
        },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          updatedAt: true,
          project: { select: { id: true, title: true, code: true, slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
      })
      .catch(() => [] as never[]),
  ]);

  const monthIncomeNum = Number(monthIncome._sum.amount ?? 0);
  const monthExpenseNum = Number(monthExpense._sum.amount ?? 0);
  const monthNet = monthIncomeNum - monthExpenseNum;
  const factMarginPct =
    monthIncomeNum > 0
      ? Math.round(((monthIncomeNum - monthExpenseNum) / monthIncomeNum) * 100)
      : 0;
  const overdueStagesCount = overdueStagesRaw.length;
  const openRfiCount = openRfis;

  // Daily series (income + expense, separated) for cashflow chart.
  const cashflowSeries = buildDailySeries(periodEntries, periodStart, periodDays);

  // Cumulative net for KPI sparkline (kept from prior implementation).
  const sparkSeries = cashflowSeries.income.map((inc, i) => inc - cashflowSeries.expense[i]);
  let acc = 0;
  const cumulativeNetSpark = sparkSeries.map((v) => (acc += v));

  // Project margin (top 6 by budget) — current period actuals.
  const projectMargin = computeProjectMargin(
    projects,
    periodEntries.filter((e) => e.projectId),
  );

  // Live workers + active sites today (proxy: distinct creators/projects in today's foreman reports).
  const workersToday = new Set(todayForemanReports.map((r) => r.createdById)).size;
  const sitesToday = new Set(todayForemanReports.map((r) => r.projectId)).size;

  const watchlist = computeWatchlist(projects);

  const risks = [
    ...overdueStagesRaw.slice(0, 3).map((s) => ({
      tone: "danger" as const,
      tag: `${(s.project.code ?? s.project.slug).toUpperCase().slice(0, 12)} · ЕТАП`,
      title: `${s.customName ?? s.stage ?? "Етап"} прострочено ${daysFrom(s.endDate)} дн`,
      sub: s.project.title,
      href: `/admin-v2/projects/${s.project.id}/stages`,
    })),
    ...(pendingReports > 0
      ? [
          {
            tone: "warn" as const,
            tag: "ЗВІТИ",
            title: `${pendingReports} ${pendingReports === 1 ? "звіт виконроба чекає" : "звітів виконробів чекають"} погодження`,
            sub: "Перевір та схвали у Foreman queue",
            href: "/admin-v2/foreman-reports",
          },
        ]
      : []),
    ...(openRfiCount > 0
      ? [
          {
            tone: "info" as const,
            tag: "RFI",
            title: `${openRfiCount} ${openRfiCount === 1 ? "відкритий запит" : "відкритих запитів"}`,
            sub: "Інженерні питання чекають на відповідь",
            href: "/admin-v2/rfis",
          },
        ]
      : []),
  ];

  // Activity feed — merge 4 sources, sort by time desc.
  const activityEvents = buildActivityFeed({
    foremanReports: recentForemanReports,
    completedStages: recentCompletedStages,
    overdueStages: overdueStagesRaw,
    incomeEntries: recentIncomeEntries,
    changeOrders: recentChangeOrders,
    showFinance,
    now,
  });

  const greetingHour = now.getHours();
  const greeting =
    greetingHour < 6
      ? "Доброї ночі"
      : greetingHour < 12
        ? "Доброго ранку"
        : greetingHour < 18
          ? "Гарного дня"
          : "Доброго вечора";

  const userName = session.user.name?.split(" ")[0] ?? "колега";

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[22px] sm:text-[26px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            {greeting}, {userName} 👋
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {totalProjects}
            </span>{" "}
            {plural(totalProjects, "проєкт", "проєкти", "проєктів")} у роботі ·{" "}
            <span className="font-semibold" style={{ color: T.success }}>
              {activeProjects}
            </span>{" "}
            активних
            {risks.length > 0 && (
              <>
                {" · "}
                <span
                  className="inline-flex items-center gap-1 font-semibold"
                  style={{ color: T.danger }}
                >
                  <AlertTriangle size={12} />
                  {risks.length}{" "}
                  {plural(
                    risks.length,
                    "ризик потребує",
                    "ризики потребують",
                    "ризиків потребують",
                  )}{" "}
                  уваги
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodBadge label="Останні 30 днів" />
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
            Стандартний дашборд
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </header>

      <KpiStrip
        activeProjects={activeProjects}
        totalProjects={totalProjects}
        totalBudget={totalBudget}
        totalPaid={totalPaid}
        budgetUsedPct={budgetUsedPct}
        showFinance={showFinance}
        monthIncome={monthIncomeNum}
        monthExpense={monthExpenseNum}
        monthNet={monthNet}
        factMarginPct={factMarginPct}
        risksCount={risks.length}
        sparkSeries={cumulativeNetSpark}
      />

      <MiniMetrics
        overdueStages={overdueStagesCount}
        pendingReports={pendingReports}
        openRfis={openRfiCount}
        workersToday={workersToday}
        sitesToday={sitesToday}
      />

      {showFinance && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <CashflowPanel
              income={cashflowSeries.income}
              expense={cashflowSeries.expense}
              totalIncome={cashflowSeries.income.reduce((s, v) => s + v, 0)}
              totalExpense={cashflowSeries.expense.reduce((s, v) => s + v, 0)}
              days={periodDays}
            />
          </div>
          <div>
            <ProjectMarginPanel rows={projectMargin} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Watchlist projects={watchlist} />
        </div>
        <div>
          <TodayLivePanel
            workersToday={workersToday}
            sitesToday={sitesToday}
            activeStages={activeNowStages}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <ActivityFeed events={activityEvents} />
        </div>
        <div className="flex flex-col gap-5">
          <RisksPanel risks={risks} />
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Period badge (display-only switcher; client interactivity TBD).
// -----------------------------------------------------------------------------
function PeriodBadge({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        color: T.textPrimary,
      }}
    >
      <CalendarRange size={13} style={{ color: T.textSecondary }} />
      {label}
      <ChevronDown size={12} style={{ color: T.textMuted }} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Watchlist (with deadline column).
// -----------------------------------------------------------------------------
type WatchlistRow = {
  id: string;
  title: string;
  code: string;
  stageLabel: string;
  progress: number;
  budgetPaid: number;
  budgetTotal: number;
  budgetPct: number;
  daysToDeadline: number | null;
  riskScore: number;
  status: string;
};

function computeWatchlist(
  projects: Awaited<ReturnType<typeof listProjectsWithAggregations>>,
): WatchlistRow[] {
  const now = new Date();
  const rows = projects.map((p): WatchlistRow => {
    const budgetTotal = Number(p.totalBudget ?? 0);
    const budgetPaid = Number(p.totalPaid ?? 0);
    const budgetPct = budgetTotal > 0 ? Math.round((budgetPaid / budgetTotal) * 100) : 0;
    const daysToDeadline = p.expectedEndDate
      ? Math.round((new Date(p.expectedEndDate).getTime() - now.getTime()) / 86_400_000)
      : null;
    let riskScore = 0;
    if (p.status === "ACTIVE" && p.stageProgress < 30 && budgetPct > 50) riskScore += 3;
    if (budgetPct > 80) riskScore += 2;
    if (p.stageProgress < 20) riskScore += 1;
    if (p.status === "ON_HOLD") riskScore += 2;
    if (daysToDeadline !== null && daysToDeadline < 0) riskScore += 3;
    if (daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline < 14) riskScore += 1;
    return {
      id: p.id,
      title: p.title,
      code: p.code ?? `PRJ-${p.slug.toUpperCase().slice(0, 8)}`,
      stageLabel: humanStage(p.currentStage),
      progress: p.stageProgress,
      budgetPaid,
      budgetTotal,
      budgetPct,
      daysToDeadline,
      riskScore,
      status: p.status,
    };
  });
  return rows.sort((a, b) => b.riskScore - a.riskScore || a.progress - b.progress).slice(0, 6);
}

function Watchlist({ projects }: { projects: WatchlistRow[] }) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Eye size={18} style={{ color: T.accentPrimary }} />
          <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Топ проєктів за активністю
          </h2>
        </div>
        <Link
          href="/admin-v2/projects"
          className="text-[12px] font-semibold inline-flex items-center gap-1"
          style={{ color: T.accentPrimary }}
        >
          Усі проєкти →
        </Link>
      </header>
      <div
        className="hidden md:grid grid-cols-[1.6fr_1fr_1fr_1fr_120px] gap-3 px-5 py-2 text-[10px] font-bold tracking-wider"
        style={{ color: T.textMuted, borderTop: `1px solid ${T.borderSoft}`, borderBottom: `1px solid ${T.borderSoft}` }}
      >
        <span>ПРОЄКТ</span>
        <span>ЕТАП</span>
        <span>ПРОГРЕС</span>
        <span>БЮДЖЕТ</span>
        <span>ДЕДЛАЙН</span>
      </div>
      {projects.length === 0 && (
        <div
          className="px-5 py-10 text-center text-[13px]"
          style={{ color: T.textMuted }}
        >
          Проєктів ще немає
        </div>
      )}
      <ul className="flex flex-col">
        {projects.map((p, i) => {
          const tier =
            p.riskScore >= 3
              ? { bg: T.dangerSoft, accent: T.danger }
              : p.riskScore >= 2
                ? { bg: T.warningSoft, accent: T.warning }
                : { bg: "transparent", accent: T.borderSoft };
          return (
            <li key={p.id}>
              <Link
                href={`/admin-v2/projects/${p.id}/v2`}
                className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr_1fr_120px] items-center gap-3 px-5 py-3 transition hover:brightness-95"
                style={{
                  backgroundColor: tier.bg,
                  borderLeft: `3px solid ${tier.accent}`,
                  borderTop: i > 0 ? `1px solid ${T.borderSoft}` : "none",
                }}
              >
                <div className="min-w-0">
                  <div
                    className="text-[10px] font-bold tracking-wider tabular-nums"
                    style={{ color: T.textMuted }}
                  >
                    {p.code}
                  </div>
                  <div
                    className="text-[13px] font-semibold truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {p.title}
                  </div>
                </div>
                <div
                  className="text-[12px] truncate"
                  style={{ color: T.textSecondary }}
                >
                  {p.stageLabel}
                </div>
                <div className="flex items-center gap-2 min-w-[120px]">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full"
                    style={{ backgroundColor: T.panelSoft }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, p.progress))}%`,
                        backgroundColor:
                          p.progress >= 80
                            ? T.success
                            : p.progress >= 30
                              ? T.accentPrimary
                              : T.warning,
                      }}
                    />
                  </div>
                  <span
                    className="text-[11px] font-bold tabular-nums w-9 text-right"
                    style={{ color: T.textSecondary }}
                  >
                    {p.progress}%
                  </span>
                </div>
                <div className="min-w-[100px]">
                  <div
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: T.textPrimary }}
                  >
                    {formatCompact(p.budgetPaid)} / {formatCompact(p.budgetTotal)}
                  </div>
                  <div
                    className="text-[10px] font-semibold"
                    style={{
                      color:
                        p.budgetPct > 80
                          ? T.danger
                          : p.budgetPct > 60
                            ? T.warning
                            : T.textMuted,
                    }}
                  >
                    {p.budgetPct}% освоєно
                  </div>
                </div>
                <DeadlineBadge days={p.daysToDeadline} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DeadlineBadge({ days }: { days: number | null }) {
  if (days === null) {
    return (
      <span
        className="text-[11px] font-semibold"
        style={{ color: T.textMuted }}
      >
        не задано
      </span>
    );
  }
  const overdue = days < 0;
  const soon = days >= 0 && days < 14;
  const tone = overdue
    ? { bg: T.dangerSoft, fg: T.danger, label: `${days} днів` }
    : soon
      ? { bg: T.warningSoft, fg: T.warning, label: `${days} днів` }
      : { bg: T.successSoft, fg: T.success, label: `${days} днів` };
  return (
    <span
      className="inline-flex items-center justify-center rounded-md px-2 py-1 text-[11px] font-bold tabular-nums whitespace-nowrap"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

// -----------------------------------------------------------------------------
// KPI strip — 5 cards.
// -----------------------------------------------------------------------------
function KpiStrip({
  activeProjects,
  totalProjects,
  totalBudget,
  totalPaid,
  budgetUsedPct,
  showFinance,
  monthIncome,
  monthExpense,
  monthNet,
  factMarginPct,
  risksCount,
  sparkSeries,
}: {
  activeProjects: number;
  totalProjects: number;
  totalBudget: number;
  totalPaid: number;
  budgetUsedPct: number;
  showFinance: boolean;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  factMarginPct: number;
  risksCount: number;
  sparkSeries: number[];
}) {
  const marginDeltaPp = factMarginPct - COMPANY_TARGET_MARGIN_PCT;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard
        icon={FolderKanban}
        iconBg={T.accentPrimarySoft}
        iconColor={T.accentPrimary}
        label="АКТИВНІ ПРОЄКТИ"
        value={String(activeProjects)}
        sub={`/ ${totalProjects} всього`}
        trendValue={
          activeProjects > 0
            ? `${activeProjects}`
            : undefined
        }
      />
      {showFinance ? (
        <>
          <KpiCard
            icon={Wallet}
            iconBg={T.skySoft}
            iconColor={T.sky}
            label="БЮДЖЕТ У РОБОТІ"
            value={formatCompact(totalBudget)}
            unit="₴"
            sub={`освоєно ${formatCompact(totalPaid)} (${budgetUsedPct}%)`}
          />
          <KpiCard
            icon={monthNet >= 0 ? TrendingUp : TrendingDown}
            iconBg={monthNet >= 0 ? T.successSoft : T.dangerSoft}
            iconColor={monthNet >= 0 ? T.success : T.danger}
            label="CASHFLOW · 30 ДНІВ"
            value={`${monthNet >= 0 ? "+" : ""}${formatCompact(monthNet)}`}
            unit="₴"
            sub={`${formatCompact(monthIncome)} ↑ / ${formatCompact(monthExpense)} ↓`}
            valueColor={monthNet >= 0 ? T.success : T.danger}
            spark={sparkSeries}
            sparkColor={monthNet >= 0 ? T.success : T.danger}
          />
          <KpiCard
            icon={Percent}
            iconBg={T.warningSoft}
            iconColor={T.warning}
            label="МАРЖА ПЛАН/ФАКТ"
            value={`${COMPANY_TARGET_MARGIN_PCT}%`}
            sub={`факт ${factMarginPct}% · ${marginDeltaPp >= 0 ? "+" : ""}${marginDeltaPp}пп`}
            subColor={marginDeltaPp >= 0 ? T.success : T.danger}
            trendIcon={marginDeltaPp >= 0 ? "up" : "down"}
            trendValue={`${marginDeltaPp >= 0 ? "+" : ""}${marginDeltaPp}пп`}
            trendTone={marginDeltaPp >= 0 ? "success" : "danger"}
          />
        </>
      ) : null}
      <RisksCard count={risksCount} />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  unit,
  spark,
  sparkColor,
  valueColor,
  subColor,
  trendIcon,
  trendValue,
  trendTone,
}: {
  icon: typeof FolderKanban;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  unit?: string;
  valueColor?: string;
  subColor?: string;
  spark?: number[];
  sparkColor?: string;
  trendIcon?: "up" | "down";
  trendValue?: string;
  trendTone?: "success" | "danger" | "warning";
}) {
  const trendBg =
    trendTone === "success"
      ? T.successSoft
      : trendTone === "danger"
        ? T.dangerSoft
        : T.warningSoft;
  const trendFg =
    trendTone === "success"
      ? T.success
      : trendTone === "danger"
        ? T.danger
        : T.warning;
  return (
    <article
      className="rounded-xl p-3.5 relative overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-start gap-3 relative z-10">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <Icon size={16} style={{ color: iconColor }} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[9.5px] font-bold tracking-wider truncate"
            style={{ color: T.textMuted }}
          >
            {label}
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className="text-[22px] font-bold tabular-nums leading-none"
              style={{ color: valueColor ?? T.textPrimary }}
            >
              {value}
            </span>
            {unit && (
              <span className="text-[12px] font-semibold" style={{ color: T.textSecondary }}>
                {unit}
              </span>
            )}
          </div>
          <div
            className="text-[11px] mt-1 truncate"
            style={{ color: subColor ?? T.textMuted }}
          >
            {sub}
          </div>
        </div>
        {trendIcon && trendValue && (
          <div
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
            style={{ backgroundColor: trendBg, color: trendFg }}
          >
            {trendIcon === "up" ? (
              <TrendingUp size={10} />
            ) : (
              <TrendingDown size={10} />
            )}
            {trendValue}
          </div>
        )}
      </div>
      {spark && spark.length > 1 && (
        <Sparkline series={spark} color={sparkColor ?? T.accentPrimary} />
      )}
    </article>
  );
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  const width = 220;
  const height = 36;
  const padY = 2;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series.map((v, i) => {
    const x = i * step;
    const y = padY + (1 - (v - min) / range) * (height - padY * 2);
    return [x, y] as const;
  });
  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const zeroY =
    min < 0 && max > 0
      ? padY + (1 - (0 - min) / range) * (height - padY * 2)
      : null;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="absolute bottom-0 right-0 pointer-events-none"
      style={{ opacity: 0.7 }}
      aria-hidden
    >
      <path d={areaPath} fill={color} fillOpacity={0.12} />
      {zeroY !== null && (
        <line
          x1={0}
          y1={zeroY}
          x2={width}
          y2={zeroY}
          stroke={T.borderSoft}
          strokeDasharray="2 2"
          strokeWidth={1}
        />
      )}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function RisksCard({ count }: { count: number }) {
  const isClean = count === 0;
  return (
    <article
      className="rounded-xl p-3.5 relative overflow-hidden"
      style={{
        backgroundColor: isClean ? T.successSoft : "#7F1D1D",
        border: isClean ? `1px solid ${T.success}33` : "none",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: isClean ? T.success : "#FFFFFF" }}
        >
          {isClean ? (
            <CheckCircle2 size={16} style={{ color: "#FFFFFF" }} />
          ) : (
            <AlertTriangle size={16} style={{ color: T.danger }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[9.5px] font-bold tracking-wider"
            style={{ color: isClean ? T.success : "#FECACA" }}
          >
            РИЗИКИ ВСЬОГО
          </div>
          <div
            className="text-[22px] font-bold tabular-nums leading-none mt-0.5"
            style={{ color: isClean ? T.success : "#FFFFFF" }}
          >
            {count}
          </div>
          <div
            className="text-[11px] mt-1"
            style={{ color: isClean ? T.success : "#FECACA" }}
          >
            {isClean ? "усе під контролем" : "потребують уваги"}
          </div>
        </div>
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// Mini metrics row — 4 cards (last is dark "live" workers card).
// -----------------------------------------------------------------------------
function MiniMetrics({
  overdueStages,
  pendingReports,
  openRfis,
  workersToday,
  sitesToday,
}: {
  overdueStages: number;
  pendingReports: number;
  openRfis: number;
  workersToday: number;
  sitesToday: number;
}) {
  const items: Array<{
    icon: typeof AlertOctagon;
    accent: string;
    value: number;
    label: string;
    href: string;
  }> = [
    {
      icon: AlertOctagon,
      accent: overdueStages > 0 ? T.danger : T.success,
      value: overdueStages,
      label: "Прострочених етапів",
      href: "/admin-v2/projects",
    },
    {
      icon: HardHat,
      accent: pendingReports > 0 ? T.warning : T.textMuted,
      value: pendingReports,
      label: "Звіти виконробів очікують",
      href: "/admin-v2/foreman-reports",
    },
    {
      icon: HelpCircle,
      accent: openRfis > 0 ? T.sky : T.textMuted,
      value: openRfis,
      label: "Відкритих RFI",
      href: "/admin-v2/rfis",
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((m, i) => (
        <Link
          key={i}
          href={m.href}
          className="flex items-center gap-3 rounded-xl px-4 py-3 transition hover:brightness-95"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            borderLeftWidth: 4,
            borderLeftColor: m.accent,
          }}
        >
          <m.icon size={18} style={{ color: m.accent }} />
          <span
            className="text-[22px] font-bold tabular-nums"
            style={{ color: T.textPrimary }}
          >
            {m.value}
          </span>
          <span
            className="text-[12px] font-semibold flex-1 truncate"
            style={{ color: T.textSecondary }}
          >
            {m.label}
          </span>
          <ArrowRight size={14} style={{ color: T.textMuted }} />
        </Link>
      ))}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}
      >
        <Users size={18} style={{ color: "#F59E0B" }} />
        <span className="text-[22px] font-bold tabular-nums">{workersToday}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold truncate" style={{ color: "#CBD5E1" }}>
            робітників
          </div>
          <div className="text-[10.5px]" style={{ color: "#64748B" }}>
            на {sitesToday} {plural(sitesToday, "обʼєкті", "обʼєктах", "обʼєктах")}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider"
          style={{ color: "#10B981" }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: "#10B981" }}
          />
          LIVE
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Cashflow chart.
// -----------------------------------------------------------------------------
function CashflowPanel({
  income,
  expense,
  totalIncome,
  totalExpense,
  days,
}: {
  income: number[];
  expense: number[];
  totalIncome: number;
  totalExpense: number;
  days: number;
}) {
  const chartW = 720;
  const chartH = 200;
  const padX = 12;
  const padY = 6;
  const max = Math.max(...income, ...expense, 1);
  const stepX = (chartW - padX * 2) / Math.max(1, income.length - 1);

  const incomePath = income
    .map((v, i) => {
      const x = padX + i * stepX;
      const y = padY + (chartH - padY * 2) * (1 - v / max);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const incomeArea = `${incomePath} L ${(padX + (income.length - 1) * stepX).toFixed(1)} ${chartH - padY} L ${padX} ${chartH - padY} Z`;
  const expensePath = expense
    .map((v, i) => {
      const x = padX + i * stepX;
      const y = padY + (chartH - padY * 2) * (1 - v / max);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Y-axis labels (4 evenly spaced).
  const yLabels = [1, 0.66, 0.33, 0].map((frac) => formatCompactShort(max * frac));

  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Грошовий потік
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: T.textSecondary }}>
            Останні {days} днів
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px]" style={{ color: T.textSecondary }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: T.success }} />
            Надходження
            <strong className="ml-1 tabular-nums" style={{ color: T.textPrimary }}>
              {formatCompact(totalIncome)} ₴
            </strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: T.danger }} />
            Витрати
            <strong className="ml-1 tabular-nums" style={{ color: T.textPrimary }}>
              {formatCompact(totalExpense)} ₴
            </strong>
          </span>
        </div>
      </header>
      <div className="px-5 pb-5">
        <div className="flex gap-3">
          <div className="flex flex-col justify-between py-1 text-[10px] tabular-nums" style={{ color: T.textMuted, height: chartH }}>
            {yLabels.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
          <div className="flex-1 relative" style={{ height: chartH }}>
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              preserveAspectRatio="none"
              className="w-full h-full"
              aria-label="Грошовий потік"
            >
              {[0, 0.33, 0.66, 1].map((frac, i) => {
                const y = padY + (chartH - padY * 2) * frac;
                return (
                  <line
                    key={i}
                    x1={padX}
                    y1={y}
                    x2={chartW - padX}
                    y2={y}
                    stroke={T.borderSoft}
                    strokeWidth={i === 3 ? 1 : 0.5}
                    strokeOpacity={i === 3 ? 1 : 0.6}
                  />
                );
              })}
              <path d={incomeArea} fill={T.success} fillOpacity={0.14} />
              <path d={incomePath} fill="none" stroke={T.success} strokeWidth={2} />
              <path
                d={expensePath}
                fill="none"
                stroke={T.danger}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            </svg>
          </div>
        </div>
        <div
          className="flex justify-between mt-2 ml-7 text-[10px] tabular-nums"
          style={{ color: T.textMuted }}
        >
          {buildDayLabels(days).map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function buildDayLabels(days: number): string[] {
  const labels: string[] = [];
  const ticks = 5;
  const now = new Date();
  for (let i = 0; i < ticks; i++) {
    const offsetDays = Math.round(((ticks - 1 - i) * (days - 1)) / (ticks - 1));
    const d = new Date(now.getTime() - offsetDays * 86_400_000);
    labels.push(`${d.getDate()} ${ukShortMonth(d.getMonth())}`);
  }
  return labels;
}

function ukShortMonth(m: number): string {
  return ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"][m] ?? "";
}

// -----------------------------------------------------------------------------
// Project margin panel (top 6 by budget; bar chart of fact margin).
// -----------------------------------------------------------------------------
type ProjectMarginRow = {
  id: string;
  title: string;
  marginPct: number;
  income: number;
  expense: number;
  budget: number;
};

function computeProjectMargin(
  projects: Awaited<ReturnType<typeof listProjectsWithAggregations>>,
  entries: Array<{ projectId: string | null; amount: unknown; type: string }>,
): ProjectMarginRow[] {
  const map = new Map<string, { income: number; expense: number }>();
  for (const e of entries) {
    if (!e.projectId) continue;
    const cur = map.get(e.projectId) ?? { income: 0, expense: 0 };
    const amt = Number(e.amount ?? 0);
    if (e.type === "INCOME") cur.income += amt;
    else if (e.type === "EXPENSE") cur.expense += amt;
    map.set(e.projectId, cur);
  }
  const rows: ProjectMarginRow[] = projects.map((p) => {
    const agg = map.get(p.id) ?? { income: 0, expense: 0 };
    const denom = agg.income > 0 ? agg.income : Number(p.totalBudget ?? 0);
    const marginPct = denom > 0
      ? Math.round(((agg.income - agg.expense) / denom) * 100)
      : 0;
    return {
      id: p.id,
      title: p.title,
      marginPct,
      income: agg.income,
      expense: agg.expense,
      budget: Number(p.totalBudget ?? 0),
    };
  });
  return rows
    .filter((r) => r.budget > 0 || r.income > 0 || r.expense > 0)
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 6);
}

function ProjectMarginPanel({ rows }: { rows: ProjectMarginRow[] }) {
  const max = Math.max(30, ...rows.map((r) => Math.abs(r.marginPct)));
  return (
    <section
      className="rounded-2xl h-full"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="px-5 py-4">
        <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Маржа по проєктах
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: T.textSecondary }}>
          Топ 6 за бюджетом
        </p>
      </header>
      <div className="px-5 pb-5 flex flex-col gap-3">
        {rows.length === 0 && (
          <div
            className="rounded-lg px-3 py-6 text-center text-[12px]"
            style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
          >
            Немає фактичних рухів за період
          </div>
        )}
        {rows.map((r) => {
          const tone =
            r.marginPct >= 20
              ? T.success
              : r.marginPct >= 10
                ? T.warning
                : T.danger;
          const w = Math.min(100, (Math.abs(r.marginPct) / max) * 100);
          return (
            <div key={r.id}>
              <div className="flex items-center justify-between mb-1">
                <Link
                  href={`/admin-v2/projects/${r.id}/v2`}
                  className="text-[12px] font-semibold truncate flex-1 mr-2"
                  style={{ color: T.textPrimary }}
                >
                  {r.title}
                </Link>
                <span
                  className="text-[12px] font-bold tabular-nums"
                  style={{ color: tone }}
                >
                  {r.marginPct > 0 ? "+" : ""}
                  {r.marginPct}%
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: T.panelSoft }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${w}%`, backgroundColor: tone }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Today Live panel (dark card: workers, weather, active works right now).
// -----------------------------------------------------------------------------
function TodayLivePanel({
  workersToday,
  sitesToday,
  activeStages,
}: {
  workersToday: number;
  sitesToday: number;
  activeStages: Array<{
    customName: string | null;
    stage: string | null;
    project: { title: string };
  }>;
}) {
  return (
    <section
      className="rounded-2xl h-full p-5"
      style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold tracking-wider"
          style={{ color: "#94A3B8" }}
        >
          СЬОГОДНІ ПО ВСІХ ОБʼЄКТАХ
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider"
          style={{ color: "#10B981" }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: "#10B981" }}
          />
          LIVE
        </span>
      </div>
      <div className="flex items-end gap-3 mt-3">
        <span className="text-[40px] font-bold leading-none tabular-nums">
          {workersToday}
        </span>
        <div className="pb-1">
          <div className="text-[11px]" style={{ color: "#CBD5E1" }}>
            робітників на
          </div>
          <div className="text-[11px] font-bold">
            {sitesToday} {plural(sitesToday, "обʼєкті", "обʼєктах", "обʼєктах")}
          </div>
        </div>
        <div
          className="mx-2"
          style={{ width: 1, height: 40, backgroundColor: "#1E293B" }}
        />
        <Sun size={26} style={{ color: "#F59E0B" }} />
        <div className="pb-1">
          <div className="text-[18px] font-bold leading-none">+18°</div>
          <div className="text-[10px] mt-1" style={{ color: "#94A3B8" }}>
            Львів
          </div>
        </div>
      </div>
      <div
        className="rounded-xl px-3 py-3 mt-4"
        style={{ backgroundColor: "#1E293B" }}
      >
        <div
          className="text-[9px] font-bold tracking-wider"
          style={{ color: "#64748B" }}
        >
          АКТИВНІ РОБОТИ ЗАРАЗ
        </div>
        {activeStages.length === 0 && (
          <div
            className="text-[12px] mt-2 italic"
            style={{ color: "#94A3B8" }}
          >
            Поки немає активних етапів
          </div>
        )}
        <ul className="mt-2 flex flex-col gap-1.5">
          {activeStages.map((s, i) => (
            <li
              key={i}
              className="text-[11px] truncate"
              style={{ color: "#CBD5E1" }}
            >
              • {s.customName ?? humanStage(s.stage ?? "")} ·{" "}
              <span style={{ color: "#94A3B8" }}>{s.project.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Activity feed — timeline from 4 sources.
// -----------------------------------------------------------------------------
type ActivityEvent = {
  id: string;
  at: Date;
  kind: "foreman" | "stage-overdue" | "stage-done" | "income" | "co";
  tagText: string;
  tagTone: "default" | "danger" | "success";
  who?: string;
  text: string;
  href: string;
};

function buildActivityFeed(args: {
  foremanReports: Array<{
    id: string;
    submittedAt: Date | null;
    totalCalculated: unknown;
    createdBy: { name: string | null } | null;
    project: { id: string; title: string; slug: string; code: string | null } | null;
  }>;
  completedStages: Array<{
    id: string;
    customName: string | null;
    stage: string | null;
    actualEndDate: Date | null;
    endDate: Date | null;
    project: { id: string; title: string; code: string | null; slug: string };
  }>;
  overdueStages: Array<{
    id: string;
    customName: string | null;
    stage: string | null;
    endDate: Date | null;
    project: { id: string; title: string; slug: string; code: string | null };
  }>;
  incomeEntries: Array<{
    id: string;
    amount: unknown;
    occurredAt: Date;
    title: string;
    project: { id: string; title: string; code: string | null; slug: string } | null;
  }>;
  changeOrders: Array<{
    id: string;
    number: string;
    title: string;
    status: string;
    updatedAt: Date;
    project: { id: string; title: string; code: string | null; slug: string };
  }>;
  showFinance: boolean;
  now: Date;
}): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const r of args.foremanReports) {
    if (!r.submittedAt || !r.project) continue;
    const total = Number(r.totalCalculated ?? 0);
    const totalLabel = total > 0 ? ` на ${formatMoney(total)} ₴` : "";
    out.push({
      id: `fr-${r.id}`,
      at: r.submittedAt,
      kind: "foreman",
      tagText: r.project.code ?? r.project.slug.toUpperCase().slice(0, 8),
      tagTone: "default",
      who: r.createdBy?.name ?? "Виконроб",
      text: `подав звіт${totalLabel}`,
      href: `/admin-v2/foreman-reports/${r.id}`,
    });
  }
  for (const s of args.completedStages) {
    if (!s.actualEndDate) continue;
    const ahead =
      s.endDate &&
      s.actualEndDate.getTime() < s.endDate.getTime()
        ? ` · на ${Math.round((s.endDate.getTime() - s.actualEndDate.getTime()) / 86_400_000)} дн раніше`
        : "";
    out.push({
      id: `sd-${s.id}`,
      at: s.actualEndDate,
      kind: "stage-done",
      tagText: s.project.code ?? s.project.slug.toUpperCase().slice(0, 8),
      tagTone: "success",
      text: `Етап «${s.customName ?? humanStage(s.stage ?? "")}» завершено${ahead}`,
      href: `/admin-v2/projects/${s.project.id}/stages`,
    });
  }
  for (const s of args.overdueStages.slice(0, 2)) {
    if (!s.endDate) continue;
    const overdueDays = Math.round((args.now.getTime() - s.endDate.getTime()) / 86_400_000);
    out.push({
      id: `so-${s.id}`,
      at: s.endDate,
      kind: "stage-overdue",
      tagText: s.project.code ?? s.project.slug.toUpperCase().slice(0, 8),
      tagTone: "danger",
      text: `Етап «${s.customName ?? humanStage(s.stage ?? "")}» прострочено на ${overdueDays} днів`,
      href: `/admin-v2/projects/${s.project.id}/stages`,
    });
  }
  if (args.showFinance) {
    for (const e of args.incomeEntries) {
      out.push({
        id: `in-${e.id}`,
        at: e.occurredAt,
        kind: "income",
        tagText: e.project?.code ?? e.project?.slug.toUpperCase().slice(0, 8) ?? "FIN",
        tagTone: "success",
        text: `Надходження · ${formatMoney(Number(e.amount ?? 0))} ₴ · ${e.title}`,
        href: e.project ? `/admin-v2/projects/${e.project.id}/finance` : "/admin-v2/financing",
      });
    }
  }
  for (const co of args.changeOrders) {
    out.push({
      id: `co-${co.id}`,
      at: co.updatedAt,
      kind: "co",
      tagText: co.project.code ?? co.project.slug.toUpperCase().slice(0, 8),
      tagTone: co.status === "APPROVED" ? "success" : "default",
      text: `${coStatusLabel(co.status)} ${co.number} — ${co.title}`,
      href: `/admin-v2/projects/${co.project.id}/change-orders`,
    });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 7);
}

function coStatusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "Затверджено ДУ";
    case "PENDING_PM":
      return "На розгляді ПМ";
    case "PENDING_ADMIN":
      return "На розгляді адміна";
    case "PENDING_CLIENT":
      return "На клієнті";
    default:
      return "ДУ";
  }
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity size={18} style={{ color: T.accentPrimary }} />
          <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Активність по всіх проєктах
          </h2>
        </div>
        <Link
          href="/admin-v2/feed"
          className="text-[12px] font-semibold inline-flex items-center gap-1"
          style={{ color: T.accentPrimary }}
        >
          Уся стрічка →
        </Link>
      </header>
      <div className="px-5 pb-5">
        {events.length === 0 && (
          <div
            className="rounded-lg px-3 py-6 text-center text-[12px]"
            style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
          >
            Поки немає подій
          </div>
        )}
        <ol className="relative" style={{ borderLeft: `2px solid ${T.borderSoft}`, marginLeft: 8 }}>
          {events.map((e) => (
            <li key={e.id} className="pl-6 pb-3 relative">
              <ActivityDot kind={e.kind} />
              <div className="flex items-baseline gap-2 flex-wrap">
                <ActivityTag text={e.tagText} tone={e.tagTone} />
                {e.who && (
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    {e.who}
                  </span>
                )}
                <Link
                  href={e.href}
                  className="text-[13px] flex-1 min-w-0 truncate"
                  style={{ color: T.textSecondary }}
                >
                  {e.text}
                </Link>
                <span className="text-[11px] tabular-nums" style={{ color: T.textMuted }}>
                  {timeAgo(e.at)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ActivityDot({ kind }: { kind: ActivityEvent["kind"] }) {
  const map: Record<
    ActivityEvent["kind"],
    { bg: string; Icon: typeof HardHat }
  > = {
    foreman: { bg: "#F59E0B", Icon: HardHat },
    "stage-overdue": { bg: T.danger, Icon: AlertOctagon },
    "stage-done": { bg: T.success, Icon: Check },
    income: { bg: T.sky, Icon: Wallet },
    co: { bg: T.violet, Icon: FileText },
  };
  const { bg, Icon } = map[kind];
  return (
    <span
      className="absolute left-0 top-0.5 inline-flex items-center justify-center rounded-full"
      style={{
        width: 18,
        height: 18,
        backgroundColor: bg,
        border: `3px solid ${T.panel}`,
        marginLeft: -10,
      }}
    >
      <Icon size={10} style={{ color: "#FFFFFF" }} />
    </span>
  );
}

function ActivityTag({
  text,
  tone,
}: {
  text: string;
  tone: "default" | "danger" | "success";
}) {
  const map = {
    default: { bg: T.panelSoft, fg: T.textSecondary },
    danger: { bg: T.dangerSoft, fg: T.danger },
    success: { bg: T.successSoft, fg: T.success },
  } as const;
  const { bg, fg } = map[tone];
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}
    >
      {text}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Risks panel (right side).
// -----------------------------------------------------------------------------
function RisksPanel({
  risks,
}: {
  risks: Array<{
    tone: "danger" | "warn" | "info";
    tag: string;
    title: string;
    sub: string;
    href: string;
  }>;
}) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} style={{ color: T.danger }} />
          <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            Топ ризики компанії
          </h3>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{
            backgroundColor: risks.length > 0 ? T.dangerSoft : T.successSoft,
            color: risks.length > 0 ? T.danger : T.success,
          }}
        >
          {risks.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {risks.length === 0 && (
          <div
            className="rounded-lg px-3 py-3 text-[12px] flex items-center gap-2"
            style={{ backgroundColor: T.successSoft, color: T.success }}
          >
            <CheckCircle2 size={14} />
            <span className="font-semibold">Усе під контролем</span>
          </div>
        )}
        {risks.map((r, i) => {
          const tone =
            r.tone === "danger"
              ? { bg: T.dangerSoft, fg: T.danger, ico: AlertOctagon }
              : r.tone === "warn"
                ? { bg: T.warningSoft, fg: T.warning, ico: Clock }
                : { bg: T.skySoft, fg: T.sky, ico: HelpCircle };
          return (
            <Link
              key={i}
              href={r.href}
              className="rounded-lg px-3 py-2.5 flex items-start gap-2 transition hover:brightness-95"
              style={{
                backgroundColor: tone.bg,
                borderLeft: `3px solid ${tone.fg}`,
              }}
            >
              <tone.ico size={14} style={{ color: tone.fg }} className="flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div
                  className="text-[9px] font-bold tracking-wider"
                  style={{ color: tone.fg }}
                >
                  {r.tag}
                </div>
                <div
                  className="text-[12px] font-semibold mt-0.5"
                  style={{ color: T.textPrimary }}
                >
                  {r.title}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: tone.fg }}>
                  {r.sub}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Quick actions (2 cards as in mockup).
// -----------------------------------------------------------------------------
function QuickActions() {
  const actions: Array<{
    href: string;
    icon: typeof PlusCircle;
    bg: string;
    fg: string;
    title: string;
    sub: string;
  }> = [
    {
      href: "/admin-v2/projects/new",
      icon: PlusCircle,
      bg: T.accentPrimarySoft,
      fg: T.accentPrimary,
      title: "Новий проєкт",
      sub: "З шаблону або вручну",
    },
    {
      href: "/ai-estimate-v2",
      icon: FilePlus,
      bg: T.warningSoft,
      fg: T.warning,
      title: "AI-кошторис",
      sub: "Згенерувати з опису",
    },
    {
      href: "/admin-v2/financing",
      icon: Send,
      bg: T.violetSoft,
      fg: T.violet,
      title: "Платіжний день",
      sub: "Виплати та KB2",
    },
  ];
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center gap-2 px-4 py-3">
        <Zap size={16} style={{ color: T.warning }} />
        <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
          Швидкі дії
        </h3>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-4 pb-4">
        {actions.map((a, i) => (
          <Link
            key={i}
            href={a.href}
            className="flex flex-col gap-1 rounded-lg p-3 transition hover:brightness-95"
            style={{ backgroundColor: a.bg }}
          >
            <a.icon size={18} style={{ color: a.fg }} />
            <div className="text-[13px] font-bold mt-1" style={{ color: T.textPrimary }}>
              {a.title}
            </div>
            <div className="text-[11px]" style={{ color: T.textSecondary }}>
              {a.sub}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toFixed(0);
}

function formatCompactShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  if (abs === 0) return "0";
  return n.toFixed(0);
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} год`;
  const days = Math.floor(h / 24);
  if (days === 1) return "вчора";
  if (days < 7) return `${days} дн`;
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });
}

function daysFrom(d: Date | null): number {
  if (!d) return 0;
  return Math.round((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function humanStage(stage: string): string {
  const map: Record<string, string> = {
    DESIGN: "Проєктування",
    CONSTRUCTION: "Будівництво",
    FINISHING: "Оздоблення",
    HANDOVER: "Здача",
    PREPARATION: "Підготовка",
  };
  return map[stage] ?? stage;
}

/**
 * Bucket FinanceEntry rows into `days` daily buckets starting from `start`,
 * returning {income, expense} arrays of length `days`.
 */
function buildDailySeries(
  entries: Array<{ occurredAt: Date; amount: unknown; type: string }>,
  start: Date,
  days: number,
): { income: number[]; expense: number[] } {
  const income = new Array<number>(days).fill(0);
  const expense = new Array<number>(days).fill(0);
  const startMs = start.getTime();
  for (const e of entries) {
    const offsetDays = Math.floor(
      (new Date(e.occurredAt).getTime() - startMs) / 86_400_000,
    );
    if (offsetDays < 0 || offsetDays >= days) continue;
    const amt = Number(e.amount ?? 0);
    if (e.type === "INCOME") income[offsetDays] += amt;
    else if (e.type === "EXPENSE") expense[offsetDays] += amt;
  }
  return { income, expense };
}
