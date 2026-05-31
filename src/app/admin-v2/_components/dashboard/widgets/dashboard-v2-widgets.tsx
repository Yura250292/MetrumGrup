/**
 * Server-rendered widgets ported from /admin-v2/dashboard-v2/ macro.
 *
 * Each widget is a presentational server component — data is fetched by
 * /admin-v2/page.tsx and passed in via props, then slot-injected into the
 * widget grid. Mirrors the existing pattern used by FinancePulse, ProjectsAtRisk
 * etc.
 */
import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  Check,
  FileText,
  HardHat,
  Percent,
  Sun,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const COMPANY_TARGET_MARGIN_PCT = 22;

// -----------------------------------------------------------------------------
// 1. CashflowChartWidget — large SVG area chart, 30-day income vs expense.
// -----------------------------------------------------------------------------
export function CashflowChartWidget({
  income,
  expense,
  days,
}: {
  income: number[];
  expense: number[];
  days: number;
}) {
  const chartW = 720;
  const chartH = 200;
  const padX = 12;
  const padY = 6;
  const max = Math.max(...income, ...expense, 1);
  const stepX = (chartW - padX * 2) / Math.max(1, income.length - 1);
  const totalIncome = income.reduce((s, v) => s + v, 0);
  const totalExpense = expense.reduce((s, v) => s + v, 0);

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

  const yLabels = [1, 0.66, 0.33, 0].map((frac) => formatCompactShort(max * frac));

  return (
    <section className="rounded-2xl h-full flex flex-col" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
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
      <div className="px-5 pb-5 flex-1">
        <div className="flex gap-3">
          <div className="flex flex-col justify-between py-1 text-[10px] tabular-nums" style={{ color: T.textMuted, height: chartH }}>
            {yLabels.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
          <div className="flex-1 relative" style={{ height: chartH }}>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" className="w-full h-full" aria-label="Грошовий потік">
              {[0, 0.33, 0.66, 1].map((frac, i) => {
                const y = padY + (chartH - padY * 2) * frac;
                return (
                  <line key={i} x1={padX} y1={y} x2={chartW - padX} y2={y} stroke={T.borderSoft} strokeWidth={i === 3 ? 1 : 0.5} strokeOpacity={i === 3 ? 1 : 0.6} />
                );
              })}
              <path d={incomeArea} fill={T.success} fillOpacity={0.14} />
              <path d={incomePath} fill="none" stroke={T.success} strokeWidth={2} />
              <path d={expensePath} fill="none" stroke={T.danger} strokeWidth={2} strokeDasharray="4 4" />
            </svg>
          </div>
        </div>
        <div className="flex justify-between mt-2 ml-7 text-[10px] tabular-nums" style={{ color: T.textMuted }}>
          {buildDayLabels(days).map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// 2. ProjectMarginWidget — top 6 projects by budget with fact margin %.
// -----------------------------------------------------------------------------
export type ProjectMarginRow = {
  id: string;
  title: string;
  marginPct: number;
  income: number;
  expense: number;
  budget: number;
};

export function ProjectMarginWidget({ rows }: { rows: ProjectMarginRow[] }) {
  const max = Math.max(30, ...rows.map((r) => Math.abs(r.marginPct)));
  return (
    <section className="rounded-2xl h-full" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
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
          <div className="rounded-lg px-3 py-6 text-center text-[12px]" style={{ backgroundColor: T.panelSoft, color: T.textMuted }}>
            Немає фактичних рухів за період
          </div>
        )}
        {rows.map((r) => {
          const tone = r.marginPct >= 20 ? T.success : r.marginPct >= 10 ? T.warning : T.danger;
          const w = Math.min(100, (Math.abs(r.marginPct) / max) * 100);
          return (
            <div key={r.id}>
              <div className="flex items-center justify-between mb-1">
                <Link href={`/admin-v2/projects/${r.id}/v2`} className="text-[12px] font-semibold truncate flex-1 mr-2" style={{ color: T.textPrimary }}>
                  {r.title}
                </Link>
                <span className="text-[12px] font-bold tabular-nums" style={{ color: tone }}>
                  {r.marginPct > 0 ? "+" : ""}
                  {r.marginPct}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.panelSoft }}>
                <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: tone }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// 3. TodayLiveWidget — dark panel with workers/sites/weather/active stages.
// -----------------------------------------------------------------------------
export function TodayLiveWidget({
  workersToday,
  sitesToday,
  activeStages,
}: {
  workersToday: number;
  sitesToday: number;
  activeStages: Array<{ customName: string | null; stage: string | null; project: { title: string } }>;
}) {
  return (
    <section className="rounded-2xl h-full p-5" style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider" style={{ color: "#94A3B8" }}>
          СЬОГОДНІ ПО ВСІХ ОБʼЄКТАХ
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider" style={{ color: "#10B981" }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "#10B981" }} />
          LIVE
        </span>
      </div>
      <div className="flex items-end gap-3 mt-3">
        <span className="text-[40px] font-bold leading-none tabular-nums">{workersToday}</span>
        <div className="pb-1">
          <div className="text-[11px]" style={{ color: "#CBD5E1" }}>
            робітників на
          </div>
          <div className="text-[11px] font-bold">
            {sitesToday} {plural(sitesToday, "обʼєкті", "обʼєктах", "обʼєктах")}
          </div>
        </div>
        <div className="mx-2" style={{ width: 1, height: 40, backgroundColor: "#1E293B" }} />
        <Sun size={26} style={{ color: "#F59E0B" }} />
        <div className="pb-1">
          <div className="text-[18px] font-bold leading-none">+18°</div>
          <div className="text-[10px] mt-1" style={{ color: "#94A3B8" }}>
            Львів
          </div>
        </div>
      </div>
      <div className="rounded-xl px-3 py-3 mt-4" style={{ backgroundColor: "#1E293B" }}>
        <div className="text-[9px] font-bold tracking-wider" style={{ color: "#64748B" }}>
          АКТИВНІ РОБОТИ ЗАРАЗ
        </div>
        {activeStages.length === 0 && (
          <div className="text-[12px] mt-2 italic" style={{ color: "#94A3B8" }}>
            Поки немає активних етапів
          </div>
        )}
        <ul className="mt-2 flex flex-col gap-1.5">
          {activeStages.map((s, i) => (
            <li key={i} className="text-[11px] truncate" style={{ color: "#CBD5E1" }}>
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
// 4. ActivityTimelineWidget — multi-source feed (foreman/stage/finance/CO).
// -----------------------------------------------------------------------------
export type ActivityTimelineEvent = {
  id: string;
  at: Date;
  kind: "foreman" | "stage-overdue" | "stage-done" | "income" | "co";
  tagText: string;
  tagTone: "default" | "danger" | "success";
  who?: string;
  text: string;
  href: string;
};

export function ActivityTimelineWidget({ events }: { events: ActivityTimelineEvent[] }) {
  return (
    <section className="rounded-2xl h-full" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity size={18} style={{ color: T.accentPrimary }} />
          <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Активність по всіх проєктах
          </h2>
        </div>
        <Link href="/admin-v2/feed" className="text-[12px] font-semibold inline-flex items-center gap-1" style={{ color: T.accentPrimary }}>
          Уся стрічка →
        </Link>
      </header>
      <div className="px-5 pb-5">
        {events.length === 0 && (
          <div className="rounded-lg px-3 py-6 text-center text-[12px]" style={{ backgroundColor: T.panelSoft, color: T.textMuted }}>
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
                  <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                    {e.who}
                  </span>
                )}
                <Link href={e.href} className="text-[13px] flex-1 min-w-0 truncate" style={{ color: T.textSecondary }}>
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

function ActivityDot({ kind }: { kind: ActivityTimelineEvent["kind"] }) {
  const map: Record<ActivityTimelineEvent["kind"], { bg: string; Icon: typeof HardHat }> = {
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
      style={{ width: 18, height: 18, backgroundColor: bg, border: `3px solid ${T.panel}`, marginLeft: -10 }}
    >
      <Icon size={10} style={{ color: "#FFFFFF" }} />
    </span>
  );
}

function ActivityTag({ text, tone }: { text: string; tone: "default" | "danger" | "success" }) {
  const map = {
    default: { bg: T.panelSoft, fg: T.textSecondary },
    danger: { bg: T.dangerSoft, fg: T.danger },
    success: { bg: T.successSoft, fg: T.success },
  } as const;
  const { bg, fg } = map[tone];
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums whitespace-nowrap" style={{ backgroundColor: bg, color: fg }}>
      {text}
    </span>
  );
}

// -----------------------------------------------------------------------------
// 5. MarginKpiTile — small KPI showing margin плану/факт vs target.
// -----------------------------------------------------------------------------
export function MarginKpiTileWidget({
  factMarginPct,
  monthIncome,
  monthExpense,
}: {
  factMarginPct: number;
  monthIncome: number;
  monthExpense: number;
}) {
  const delta = factMarginPct - COMPANY_TARGET_MARGIN_PCT;
  const positive = delta >= 0;
  return (
    <article className="rounded-2xl h-full p-4 relative overflow-hidden" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: T.warningSoft }}>
          <Percent size={16} style={{ color: T.warning }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            МАРЖА ПЛАН/ФАКТ
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color: T.textPrimary }}>
              {COMPANY_TARGET_MARGIN_PCT}%
            </span>
            <span className="text-[14px] font-semibold tabular-nums" style={{ color: T.textSecondary }}>
              / {factMarginPct}%
            </span>
          </div>
          <div className="text-[11px] mt-1" style={{ color: positive ? T.success : T.danger }}>
            {positive ? "+" : ""}{delta}пп · {formatCompact(monthIncome)}↑ / {formatCompact(monthExpense)}↓
          </div>
        </div>
        <div
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: positive ? T.successSoft : T.dangerSoft, color: positive ? T.success : T.danger }}
        >
          {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {positive ? "+" : ""}{delta}пп
        </div>
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// 6. LiveWorkersTile — small dark tile with today's foreman activity.
// -----------------------------------------------------------------------------
export function LiveWorkersTileWidget({
  workersToday,
  sitesToday,
}: {
  workersToday: number;
  sitesToday: number;
}) {
  return (
    <article className="rounded-2xl h-full p-4" style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}>
      <div className="flex items-center justify-between">
        <Users size={18} style={{ color: "#F59E0B" }} />
        <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider" style={{ color: "#10B981" }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "#10B981" }} />
          LIVE
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-bold tabular-nums leading-none">{workersToday}</span>
        <span className="text-[12px]" style={{ color: "#CBD5E1" }}>
          робітників
        </span>
      </div>
      <div className="text-[11px] mt-1" style={{ color: "#64748B" }}>
        на {sitesToday} {plural(sitesToday, "обʼєкті", "обʼєктах", "обʼєктах")} сьогодні
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// 7. DeadlineWatchlistWidget — projects with risk + deadline column.
// -----------------------------------------------------------------------------
export type WatchlistRow = {
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
};

export function DeadlineWatchlistWidget({ projects }: { projects: WatchlistRow[] }) {
  return (
    <section className="rounded-2xl h-full" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <header className="flex items-center justify-between px-5 py-4">
        <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Топ проєктів за активністю
        </h2>
        <Link href="/admin-v2/projects" className="text-[12px] font-semibold" style={{ color: T.accentPrimary }}>
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
        <div className="px-5 py-10 text-center text-[13px]" style={{ color: T.textMuted }}>
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
                style={{ backgroundColor: tier.bg, borderLeft: `3px solid ${tier.accent}`, borderTop: i > 0 ? `1px solid ${T.borderSoft}` : "none" }}
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-wider tabular-nums" style={{ color: T.textMuted }}>
                    {p.code}
                  </div>
                  <div className="text-[13px] font-semibold truncate" style={{ color: T.textPrimary }}>
                    {p.title}
                  </div>
                </div>
                <div className="text-[12px] truncate" style={{ color: T.textSecondary }}>
                  {p.stageLabel}
                </div>
                <div className="flex items-center gap-2 min-w-[120px]">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: T.panelSoft }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, p.progress))}%`,
                        backgroundColor: p.progress >= 80 ? T.success : p.progress >= 30 ? T.accentPrimary : T.warning,
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold tabular-nums w-9 text-right" style={{ color: T.textSecondary }}>
                    {p.progress}%
                  </span>
                </div>
                <div className="min-w-[100px]">
                  <div className="text-[12px] font-bold tabular-nums" style={{ color: T.textPrimary }}>
                    {formatCompact(p.budgetPaid)} / {formatCompact(p.budgetTotal)}
                  </div>
                  <div
                    className="text-[10px] font-semibold"
                    style={{ color: p.budgetPct > 80 ? T.danger : p.budgetPct > 60 ? T.warning : T.textMuted }}
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
      <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
        не задано
      </span>
    );
  }
  const overdue = days < 0;
  const soon = days >= 0 && days < 14;
  const tone = overdue
    ? { bg: T.dangerSoft, fg: T.danger }
    : soon
      ? { bg: T.warningSoft, fg: T.warning }
      : { bg: T.successSoft, fg: T.success };
  return (
    <span
      className="inline-flex items-center justify-center rounded-md px-2 py-1 text-[11px] font-bold tabular-nums whitespace-nowrap"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {days} днів
    </span>
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
  if (n === 0) return "0";
  return formatCompact(n);
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
// Server-side data computation helpers (used by /admin-v2/page.tsx).
// -----------------------------------------------------------------------------

/**
 * Bucket FinanceEntry rows into `days` daily buckets starting from `start`,
 * returning {income, expense} arrays of length `days`.
 */
export function buildDailySeries(
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

/**
 * Group finance entries by projectId, compute margin %, return top 6 by budget.
 */
export function computeProjectMarginRows(
  projects: Array<{
    id: string;
    title: string;
    totalBudget: unknown;
  }>,
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
    const budget = Number(p.totalBudget ?? 0);
    const denom = agg.income > 0 ? agg.income : budget;
    const marginPct = denom > 0
      ? Math.round(((agg.income - agg.expense) / denom) * 100)
      : 0;
    return {
      id: p.id,
      title: p.title,
      marginPct,
      income: agg.income,
      expense: agg.expense,
      budget,
    };
  });
  return rows
    .filter((r) => r.budget > 0 || r.income > 0 || r.expense > 0)
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 6);
}

/**
 * Build watchlist rows with deadline + risk scoring.
 */
export function computeDeadlineWatchlist(
  projects: Array<{
    id: string;
    title: string;
    slug: string;
    code?: string | null;
    status: string;
    currentStage: string;
    stageProgress: number;
    totalBudget: unknown;
    totalPaid: unknown;
    expectedEndDate?: Date | null;
  }>,
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
    };
  });
  return rows.sort((a, b) => b.riskScore - a.riskScore || a.progress - b.progress).slice(0, 6);
}

/**
 * Merge events from 4 sources (foreman/stage/income/CO) into a single
 * timestamp-sorted feed for ActivityTimelineWidget.
 */
export function buildActivityTimelineEvents(args: {
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
  now: Date;
}): ActivityTimelineEvent[] {
  const out: ActivityTimelineEvent[] = [];
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
      s.endDate && s.actualEndDate.getTime() < s.endDate.getTime()
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

function formatMoney(n: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);
}
