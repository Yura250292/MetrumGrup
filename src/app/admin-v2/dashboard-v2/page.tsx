import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProjectsWithAggregations } from "@/lib/projects/aggregations";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { canViewFinance } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  AlertOctagon,
  CalendarCheck,
  CheckCircle2,
  Clock,
  FilePlus,
  FolderKanban,
  HardHat,
  Percent,
  PlusCircle,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

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

  const [monthIncome, monthExpense, overdueStagesRaw, pendingReports, openRfis] =
    await Promise.all([
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
          project: { select: { id: true, title: true, slug: true } },
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
      prisma.rFI.count({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          ...(firmId ? { project: { firmId } } : {}),
        },
      }).catch(() => 0),
    ]);

  const monthIncomeNum = Number(monthIncome._sum.amount ?? 0);
  const monthExpenseNum = Number(monthExpense._sum.amount ?? 0);
  const monthNet = monthIncomeNum - monthExpenseNum;
  const overdueStagesCount = overdueStagesRaw.length;
  const openRfiCount = openRfis;

  const watchlist = computeWatchlist(projects);

  const risks = [
    ...overdueStagesRaw.slice(0, 3).map((s) => ({
      tone: "danger" as const,
      tag: `${s.project.slug.toUpperCase().slice(0, 8)} · ЕТАП`,
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
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: T.danger }}>
                  <AlertTriangle size={12} />
                  {risks.length} {plural(risks.length, "ризик потребує", "ризики потребують", "ризиків потребують")} уваги
                </span>
              </>
            )}
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
            Стандартний дашборд
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </header>

      <KpiStrip
        activeProjects={activeProjects}
        totalProjects={totalProjects}
        totalBudget={totalBudget}
        budgetUsedPct={budgetUsedPct}
        showFinance={showFinance}
        monthIncome={monthIncomeNum}
        monthExpense={monthExpenseNum}
        monthNet={monthNet}
        risksCount={risks.length}
      />

      <MiniMetrics
        overdueStages={overdueStagesCount}
        pendingReports={pendingReports}
        openRfis={openRfiCount}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-5">
          <Watchlist projects={watchlist} />
        </div>
        <div className="flex flex-col gap-5">
          <RisksPanel risks={risks} />
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

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
    const daysToDeadline = p.startDate
      ? Math.round((now.getTime() - new Date(p.startDate).getTime()) / 86_400_000) * -1
      : null;
    let riskScore = 0;
    if (p.status === "ACTIVE" && p.stageProgress < 30 && budgetPct > 50) riskScore += 3;
    if (budgetPct > 80) riskScore += 2;
    if (p.stageProgress < 20) riskScore += 1;
    if (p.status === "ON_HOLD") riskScore += 2;
    return {
      id: p.id,
      title: p.title,
      code: `PRJ-${p.slug.toUpperCase().slice(0, 8)}`,
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

function KpiStrip({
  activeProjects,
  totalProjects,
  totalBudget,
  budgetUsedPct,
  showFinance,
  monthIncome,
  monthExpense,
  monthNet,
  risksCount,
}: {
  activeProjects: number;
  totalProjects: number;
  totalBudget: number;
  budgetUsedPct: number;
  showFinance: boolean;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  risksCount: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard
        icon={FolderKanban}
        iconBg={T.accentPrimarySoft}
        iconColor={T.accentPrimary}
        label="АКТИВНІ ПРОЄКТИ"
        value={String(activeProjects)}
        sub={`/ ${totalProjects} всього`}
      />
      {showFinance && (
        <>
          <KpiCard
            icon={Wallet}
            iconBg={T.skySoft}
            iconColor={T.sky}
            label="БЮДЖЕТ У РОБОТІ"
            value={formatCompact(totalBudget)}
            sub={`освоєно ${budgetUsedPct}%`}
            unit="₴"
          />
          <KpiCard
            icon={monthNet >= 0 ? TrendingUp : TrendingDown}
            iconBg={monthNet >= 0 ? T.successSoft : T.dangerSoft}
            iconColor={monthNet >= 0 ? T.success : T.danger}
            label={`CASHFLOW · ${monthLabel()}`}
            value={`${monthNet >= 0 ? "+" : ""}${formatCompact(monthNet)}`}
            sub={`${formatCompact(monthIncome)} ↑ / ${formatCompact(monthExpense)} ↓`}
            unit="₴"
            valueColor={monthNet >= 0 ? T.success : T.danger}
          />
          <KpiCard
            icon={Percent}
            iconBg={T.successSoft}
            iconColor={T.success}
            label="ОСВОЄННЯ"
            value={`${budgetUsedPct}%`}
            sub={`${formatCompact(monthExpense)} ₴ за місяць`}
          />
        </>
      )}
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
  valueColor,
}: {
  icon: typeof FolderKanban;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  unit?: string;
  valueColor?: string;
}) {
  return (
    <article
      className="rounded-xl p-3.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-start gap-3">
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
          <div className="text-[11px] mt-1 truncate" style={{ color: T.textMuted }}>
            {sub}
          </div>
        </div>
      </div>
    </article>
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

function MiniMetrics({
  overdueStages,
  pendingReports,
  openRfis,
}: {
  overdueStages: number;
  pendingReports: number;
  openRfis: number;
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
      icon: Sparkles,
      accent: openRfis > 0 ? T.sky : T.textMuted,
      value: openRfis,
      label: "Відкритих RFI",
      href: "/admin-v2/rfis",
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
    </div>
  );
}

function Watchlist({ projects }: { projects: WatchlistRow[] }) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} style={{ color: T.accentPrimary }} />
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
      <div style={{ borderTop: `1px solid ${T.borderSoft}` }} />
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
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3 transition hover:brightness-95"
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
                  <div className="text-[11px] mt-0.5" style={{ color: T.textSecondary }}>
                    {p.stageLabel}
                  </div>
                </div>
                <div className="flex items-center gap-2 min-w-[140px]">
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
                <div className="text-right min-w-[100px]">
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
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

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
                : { bg: T.skySoft, fg: T.sky, ico: CalendarCheck };
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
      bg: T.violetSoft,
      fg: T.violet,
      title: "AI-кошторис",
      sub: "Згенерувати з опису",
    },
    {
      href: "/admin-v2/financing",
      icon: Send,
      bg: T.warningSoft,
      fg: T.warning,
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
      <div className="flex flex-col gap-2 px-4 pb-4">
        {actions.map((a, i) => (
          <Link
            key={i}
            href={a.href}
            className="flex items-center gap-3 rounded-lg p-2.5 transition hover:brightness-95"
            style={{ backgroundColor: a.bg }}
          >
            <a.icon size={18} style={{ color: a.fg }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                {a.title}
              </div>
              <div className="text-[11px]" style={{ color: T.textSecondary }}>
                {a.sub}
              </div>
            </div>
            <ArrowRight size={14} style={{ color: a.fg }} />
          </Link>
        ))}
      </div>
    </section>
  );
}

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

function monthLabel(): string {
  return new Date().toLocaleDateString("uk-UA", { month: "long" });
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
