import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { canViewFinance } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FilePlus,
  FileText,
  Lock,
  ShieldAlert,
  Wallet,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinancingV2Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canViewFinance(session.user.role)) {
    return <FinanceLockedNotice />;
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  const sp = await searchParams;
  const statusFilter = sp.status ?? null;

  const projectScope = firmId ? { project: { firmId } } : {};
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const entryWhere: Record<string, unknown> = {
    ...projectScope,
    isArchived: false,
  };
  if (statusFilter) entryWhere.status = statusFilter;

  const [
    recentEntries,
    monthIncome,
    monthExpense,
    pendingApprovalCount,
    overdueCount,
    kb2Forms,
  ] = await Promise.all([
    prisma.financeEntry.findMany({
      where: entryWhere,
      select: {
        id: true,
        occurredAt: true,
        kind: true,
        type: true,
        amount: true,
        title: true,
        category: true,
        counterparty: true,
        status: true,
        paidAt: true,
        remindAt: true,
        project: { select: { id: true, slug: true, title: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
    prisma.financeEntry.aggregate({
      where: {
        ...projectScope,
        type: "INCOME",
        kind: "FACT",
        isArchived: false,
        occurredAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: {
        ...projectScope,
        type: "EXPENSE",
        kind: "FACT",
        isArchived: false,
        occurredAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.count({
      where: { ...projectScope, status: "PENDING", isArchived: false },
    }),
    prisma.financeEntry.count({
      where: {
        ...projectScope,
        status: { in: ["APPROVED", "PENDING"] },
        remindAt: { lt: now },
        paidAt: null,
        isArchived: false,
      },
    }),
    prisma.kB2Form
      .findMany({
        where: projectScope,
        select: {
          id: true,
          number: true,
          periodFrom: true,
          periodTo: true,
          totalAmount: true,
          status: true,
          project: { select: { id: true, slug: true, title: true } },
        },
        orderBy: { periodTo: "desc" },
        take: 6,
      })
      .catch(() => [] as Array<{
        id: string;
        number: string;
        periodFrom: Date;
        periodTo: Date;
        totalAmount: unknown;
        status: string;
        project: { id: string; slug: string; title: string } | null;
      }>),
  ]);

  const monthIncomeNum = Number(monthIncome._sum.amount ?? 0);
  const monthExpenseNum = Number(monthExpense._sum.amount ?? 0);
  const monthNet = monthIncomeNum - monthExpenseNum;

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1
              className="text-[24px] font-bold leading-tight"
              style={{ color: T.textPrimary }}
            >
              Фінансування
            </h1>
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
              title="STRICT RBAC — лише SUPER_ADMIN"
            >
              <ShieldAlert size={10} />
              STRICT
            </span>
          </div>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {formatCompact(monthIncomeNum)}
            </span>{" "}
            надходжень ·{" "}
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {formatCompact(monthExpenseNum)}
            </span>{" "}
            витрат · NET{" "}
            <span
              className="font-semibold"
              style={{ color: monthNet >= 0 ? T.success : T.danger }}
            >
              {monthNet >= 0 ? "+" : ""}
              {formatCompact(monthNet)}
            </span>{" "}
            за {monthLabel()}
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
            href="/admin-v2/financing"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
              color: T.textSecondary,
            }}
          >
            Стандартна сторінка
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </header>

      <KpiStrip
        monthIncome={monthIncomeNum}
        monthExpense={monthExpenseNum}
        monthNet={monthNet}
        pendingApprovalCount={pendingApprovalCount}
        overdueCount={overdueCount}
      />

      <Toolbar
        active={statusFilter}
        pendingCount={pendingApprovalCount}
        overdueCount={overdueCount}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <FinanceFeed entries={recentEntries} />
        </div>
        <div className="flex flex-col gap-5">
          <Kb2Panel forms={kb2Forms} />
          <ReadOnlyNotice />
        </div>
      </div>
    </div>
  );
}

function KpiStrip({
  monthIncome,
  monthExpense,
  monthNet,
  pendingApprovalCount,
  overdueCount,
}: {
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  pendingApprovalCount: number;
  overdueCount: number;
}) {
  const cards: Array<{
    icon: typeof ArrowUp;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    dark?: boolean;
  }> = [
    {
      icon: ArrowUp,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: `НАДХОДЖЕННЯ · ${monthLabel().toUpperCase()}`,
      value: formatCompact(monthIncome),
      sub: "FACT income",
    },
    {
      icon: ArrowDown,
      iconBg: T.dangerSoft,
      iconColor: T.danger,
      label: `ВИТРАТИ · ${monthLabel().toUpperCase()}`,
      value: formatCompact(monthExpense),
      sub: "FACT expense",
    },
    {
      icon: ArrowDownUp,
      iconBg: monthNet >= 0 ? T.successSoft : T.dangerSoft,
      iconColor: monthNet >= 0 ? T.success : T.danger,
      label: "NET CASHFLOW",
      value: `${monthNet >= 0 ? "+" : ""}${formatCompact(monthNet)}`,
      sub: monthNet >= 0 ? "позитивний" : "негативний",
      dark: monthNet < 0,
    },
    {
      icon: Clock,
      iconBg: pendingApprovalCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: pendingApprovalCount > 0 ? T.warning : T.success,
      label: "НА ПОГОДЖЕННІ",
      value: String(pendingApprovalCount),
      sub: pendingApprovalCount > 0 ? "очікують схвалення" : "усі погоджені",
    },
    {
      icon: AlertOctagon,
      iconBg: overdueCount > 0 ? T.dangerSoft : T.successSoft,
      iconColor: overdueCount > 0 ? T.danger : T.success,
      label: "ПРОСТРОЧЕНІ",
      value: String(overdueCount),
      sub: overdueCount > 0 ? "термін сплати минув" : "усе вчасно",
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
                className="text-[20px] font-bold tabular-nums leading-none mt-0.5"
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
  active,
  pendingCount,
  overdueCount,
}: {
  active: string | null;
  pendingCount: number;
  overdueCount: number;
}) {
  const segments: Array<{
    key: string | null;
    label: string;
    color: string;
    count: number | null;
  }> = [
    { key: null, label: "Всі", color: T.textPrimary, count: null },
    { key: "DRAFT", label: "Чернетки", color: T.textMuted, count: null },
    { key: "PENDING", label: "На погодженні", color: T.warning, count: pendingCount },
    { key: "APPROVED", label: "Затверджені", color: T.sky, count: null },
    { key: "PAID", label: "Оплачені", color: T.success, count: null },
  ];
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s) => {
          const isActive = active === s.key;
          const href = s.key
            ? `/admin-v2/financing-v2?status=${s.key}`
            : "/admin-v2/financing-v2";
          return (
            <Link
              key={s.key ?? "all"}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? "#0F172A" : T.panel,
                border: isActive ? "none" : `1px solid ${T.borderSoft}`,
                color: isActive ? "#FFFFFF" : T.textSecondary,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
              {s.count !== null && (
                <span className="tabular-nums opacity-70">{s.count}</span>
              )}
            </Link>
          );
        })}
      </div>
      {overdueCount > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold ml-auto"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          <AlertOctagon size={12} />
          {overdueCount} прострочено
        </span>
      )}
    </section>
  );
}

type FinanceEntryRow = {
  id: string;
  occurredAt: Date;
  kind: string;
  type: string;
  amount: unknown;
  title: string;
  category: string;
  counterparty: string | null;
  status: string;
  paidAt: Date | null;
  remindAt: Date | null;
  project: { id: string; slug: string; title: string } | null;
};

function FinanceFeed({ entries }: { entries: FinanceEntryRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <Wallet size={16} style={{ color: T.accentPrimary }} />
          <h2 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            Останні фінансові записи
          </h2>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
            style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
          >
            {entries.length}
          </span>
        </div>
      </header>
      <div style={{ borderTop: `1px solid ${T.borderSoft}` }} />
      <ul className="flex flex-col">
        {entries.length === 0 && (
          <li
            className="px-5 py-10 text-center text-[13px]"
            style={{ color: T.textMuted }}
          >
            За цим фільтром записів немає
          </li>
        )}
        {entries.map((e, idx) => (
          <EntryRow key={e.id} entry={e} isLast={idx === entries.length - 1} />
        ))}
      </ul>
    </section>
  );
}

function EntryRow({
  entry,
  isLast,
}: {
  entry: FinanceEntryRow;
  isLast: boolean;
}) {
  const isIncome = entry.type === "INCOME";
  const amount = Number(entry.amount ?? 0);
  const status = STATUS_MAP[entry.status] ?? STATUS_MAP.DRAFT;
  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
      }}
    >
      <Link
        href={
          entry.project
            ? `/admin-v2/projects/${entry.project.id}?tab=finance`
            : "/admin-v2/financing"
        }
        className="grid md:grid-cols-[40px_1fr_180px_140px_160px_20px] items-center gap-3 px-5 py-3 transition hover:brightness-95"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
          style={{
            backgroundColor: isIncome ? T.successSoft : T.dangerSoft,
          }}
        >
          {isIncome ? (
            <ArrowUp size={16} style={{ color: T.success }} />
          ) : (
            <ArrowDown size={16} style={{ color: T.danger }} />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: status.bg, color: status.fg }}
            >
              {status.label}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
              style={{
                backgroundColor: entry.kind === "PLAN" ? T.skySoft : T.panelSoft,
                color: entry.kind === "PLAN" ? T.sky : T.textSecondary,
              }}
            >
              {entry.kind}
            </span>
          </div>
          <h3
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
            title={entry.title}
          >
            {entry.title}
          </h3>
          <div
            className="text-[11px] mt-0.5 truncate"
            style={{ color: T.textMuted }}
          >
            {entry.category}
            {entry.counterparty && ` · ${entry.counterparty}`}
          </div>
        </div>
        <div className="min-w-0">
          {entry.project ? (
            <>
              <div
                className="text-[10px] font-bold tracking-wider tabular-nums truncate"
                style={{ color: T.accentPrimary }}
              >
                PRJ-{entry.project.slug.toUpperCase().slice(0, 8)}
              </div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{ color: T.textSecondary }}
              >
                {entry.project.title}
              </div>
            </>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без проєкту
            </span>
          )}
        </div>
        <div className="text-right">
          <div
            className="text-[15px] font-bold tabular-nums"
            style={{ color: isIncome ? T.success : T.danger }}
          >
            {isIncome ? "+" : "−"}
            {formatCompact(amount)}
          </div>
          <div className="text-[10px]" style={{ color: T.textMuted }}>
            {formatShortDate(entry.occurredAt)}
          </div>
        </div>
        <div className="text-right">
          {entry.paidAt ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold"
              style={{ color: T.success }}
            >
              <CheckCircle2 size={11} />
              сплачено {formatShortDate(entry.paidAt)}
            </span>
          ) : entry.remindAt ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold"
              style={{
                color:
                  new Date(entry.remindAt) < new Date() ? T.danger : T.warning,
              }}
            >
              <Calendar size={11} />
              {new Date(entry.remindAt) < new Date() ? "минув" : "до"}{" "}
              {formatShortDate(entry.remindAt)}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без термінів
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

function Kb2Panel({
  forms,
}: {
  forms: Array<{
    id: string;
    number: string;
    periodFrom: Date;
    periodTo: Date;
    totalAmount: unknown;
    status: string;
    project: { id: string; slug: string; title: string } | null;
  }>;
}) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText size={16} style={{ color: T.accentPrimary }} />
          <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            KB2 форми
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            {forms.length}
          </span>
        </div>
        <Link
          href="/admin-v2/financing"
          className="text-[11px] font-semibold inline-flex items-center gap-1"
          style={{ color: T.accentPrimary }}
        >
          Усі →
        </Link>
      </header>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {forms.length === 0 && (
          <div
            className="rounded-lg px-3 py-3 text-[12px] text-center"
            style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
          >
            Ще немає KB2 форм
          </div>
        )}
        {forms.map((f) => {
          const status = KB2_STATUS_MAP[f.status] ?? KB2_STATUS_MAP.DRAFT;
          return (
            <Link
              key={f.id}
              href={`/admin-v2/financing/kb2/${f.id}`}
              className="rounded-lg px-3 py-2 transition hover:brightness-95"
              style={{ backgroundColor: T.panelSoft }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                  style={{ backgroundColor: status.bg, color: status.fg }}
                >
                  {status.label}
                </span>
                <span
                  className="text-[10px] font-bold tabular-nums"
                  style={{ color: T.textMuted }}
                >
                  {f.number}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="text-[12px] font-semibold truncate"
                  style={{ color: T.textPrimary }}
                >
                  {f.project?.title ?? "—"}
                </span>
                <span
                  className="text-[13px] font-bold tabular-nums whitespace-nowrap"
                  style={{ color: T.textPrimary }}
                >
                  {formatCompact(Number(f.totalAmount ?? 0))}
                </span>
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                {formatShortDate(f.periodFrom)} – {formatShortDate(f.periodTo)}
              </div>
            </Link>
          );
        })}
        <Link
          href="/admin-v2/financing/kb2/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          <FilePlus size={13} />
          Створити KB2
        </Link>
      </div>
    </section>
  );
}

function ReadOnlyNotice() {
  return (
    <section
      className="rounded-2xl p-4"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px dashed ${T.warning}`,
      }}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} style={{ color: T.warning }} className="flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h4 className="text-[12px] font-bold" style={{ color: T.textPrimary }}>
            Read-only preview
          </h4>
          <p
            className="text-[11px] mt-1 leading-snug"
            style={{ color: T.textSecondary }}
          >
            Це візуальна обгортка над існуючим фінансовим модулем. Усі
            мутації (створення, схвалення, оплати, KB2 build) лишаються на
            стандартній сторінці{" "}
            <Link
              href="/admin-v2/financing"
              className="font-semibold underline"
              style={{ color: T.accentPrimary }}
            >
              /admin-v2/financing
            </Link>{" "}
            — складні інваріанти KB2/cashflow не чіпали навмисно.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinanceLockedNotice() {
  return (
    <section
      className="rounded-2xl p-8 text-center max-w-md mx-auto mt-12"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="inline-flex h-14 w-14 items-center justify-center rounded-full mb-3"
        style={{ backgroundColor: T.dangerSoft }}
      >
        <Lock size={24} style={{ color: T.danger }} />
      </div>
      <h3 className="text-[16px] font-bold" style={{ color: T.textPrimary }}>
        Доступу до фінансів немає
      </h3>
      <p className="text-[13px] mt-2" style={{ color: T.textSecondary }}>
        STRICT RBAC: фінансову інформацію бачить лише SUPER_ADMIN. Якщо
        потрібен доступ — звернися до адміністратора.
      </p>
      <Link
        href="/admin-v2"
        className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold mt-4"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textSecondary,
        }}
      >
        <ArrowRight size={14} />
        На дашборд
      </Link>
    </section>
  );
}

const STATUS_MAP: Record<string, { bg: string; fg: string; label: string }> = {
  DRAFT: { bg: T.panelSoft, fg: T.textMuted, label: "Чернетка" },
  PENDING: { bg: T.warningSoft, fg: T.warning, label: "На погодженні" },
  APPROVED: { bg: T.skySoft, fg: T.sky, label: "Затверджено" },
  PAID: { bg: T.successSoft, fg: T.success, label: "Оплачено" },
};

const KB2_STATUS_MAP: Record<string, { bg: string; fg: string; label: string }> = {
  DRAFT: { bg: T.panelSoft, fg: T.textMuted, label: "Чернетка" },
  PENDING_REVIEW: { bg: T.warningSoft, fg: T.warning, label: "На розгляді" },
  APPROVED: { bg: T.successSoft, fg: T.success, label: "Затверджено" },
  REJECTED: { bg: T.dangerSoft, fg: T.danger, label: "Відхилено" },
  ARCHIVED: { bg: T.panelSoft, fg: T.textMuted, label: "Архів" },
};

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₴`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K ₴`;
  return `${n.toFixed(0)} ₴`;
}

function monthLabel(): string {
  return new Date().toLocaleDateString("uk-UA", { month: "long" });
}

function formatShortDate(d: Date | string): string {
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}
