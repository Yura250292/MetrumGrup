import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { canViewFinance } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  HardHat,
  ImageIcon,
  Paperclip,
  Plus,
  Sparkles,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FOREMAN", "FINANCIER", "ENGINEER", "HR"];

export default async function ForemanReportsV2Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const { firmId } = await resolveFirmScopeForRequest(session);
  const sp = await searchParams;
  const statusFilter = sp.status ?? null;
  const showFinance = canViewFinance(session.user.role);

  const where: Record<string, unknown> = firmId ? { firmId } : {};
  if (statusFilter) where.status = statusFilter;

  const [reports, draftCount, pendingCount, approvedCount, rejectedCount, totalCount] =
    await Promise.all([
      prisma.foremanReport.findMany({
        where,
        select: {
          id: true,
          status: true,
          rawText: true,
          occurredAt: true,
          submittedAt: true,
          reviewedAt: true,
          rejectionReason: true,
          createdAt: true,
          project: { select: { id: true, slug: true, title: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true, attachments: true } },
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      prisma.foremanReport.count({
        where: { ...(firmId ? { firmId } : {}), status: "DRAFT" },
      }),
      prisma.foremanReport.count({
        where: { ...(firmId ? { firmId } : {}), status: "PENDING_APPROVAL" },
      }),
      prisma.foremanReport.count({
        where: { ...(firmId ? { firmId } : {}), status: "APPROVED" },
      }),
      prisma.foremanReport.count({
        where: { ...(firmId ? { firmId } : {}), status: "REJECTED" },
      }),
      prisma.foremanReport.count({ where: firmId ? { firmId } : {} }),
    ]);

  // Aggregate totals (visible only with finance access)
  let pendingTotalAmount = 0;
  if (showFinance && pendingCount > 0) {
    const agg = await prisma.foremanReportItem.aggregate({
      where: {
        report: {
          status: "PENDING_APPROVAL",
          ...(firmId ? { firmId } : {}),
        },
      },
      _sum: { amount: true },
    });
    pendingTotalAmount = Number(agg._sum.amount ?? 0);
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Заявки виконробів
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.warning }}>
              {pendingCount}
            </span>{" "}
            на погодженні
            {showFinance && pendingTotalAmount > 0 && (
              <>
                {" "}
                · сума{" "}
                <span className="font-semibold" style={{ color: T.textPrimary }}>
                  {formatCompact(pendingTotalAmount)} ₴
                </span>
              </>
            )}
            {" · "}
            <span className="font-semibold" style={{ color: T.success }}>
              {approvedCount}
            </span>{" "}
            погоджено
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
            style={{ backgroundColor: T.violetSoft, color: T.violet }}
          >
            V2
          </span>
          <Link
            href="/admin-v2/foreman-reports"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
              color: T.textSecondary,
            }}
          >
            Стандартна
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </header>

      <KpiStrip
        totalCount={totalCount}
        draftCount={draftCount}
        pendingCount={pendingCount}
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        showFinance={showFinance}
        pendingTotalAmount={pendingTotalAmount}
      />

      <Toolbar
        active={statusFilter}
        draftCount={draftCount}
        pendingCount={pendingCount}
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        totalCount={totalCount}
      />

      <ReportsList reports={reports} showFinance={showFinance} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  draftCount,
  pendingCount,
  approvedCount,
  rejectedCount,
  showFinance,
  pendingTotalAmount,
}: {
  totalCount: number;
  draftCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  showFinance: boolean;
  pendingTotalAmount: number;
}) {
  const cards = [
    {
      icon: AlertTriangle,
      iconBg: pendingCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: pendingCount > 0 ? T.warning : T.success,
      label: "ОЧІКУЮТЬ POG.",
      value: String(pendingCount),
      sub:
        showFinance && pendingTotalAmount > 0
          ? `${formatCompact(pendingTotalAmount)} ₴`
          : pendingCount > 0
            ? "потребують уваги"
            : "усе погоджено",
      dark: pendingCount > 0,
    },
    {
      icon: CheckCircle2,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "ПОГОДЖЕНО",
      value: String(approvedCount),
      sub: "перетворено у FinanceEntry",
    },
    {
      icon: Clock,
      iconBg: T.panelSoft,
      iconColor: T.textMuted,
      label: "ЧЕРНЕТКИ",
      value: String(draftCount),
      sub: "виконроби ще не подали",
    },
    {
      icon: XCircle,
      iconBg: rejectedCount > 0 ? T.dangerSoft : T.successSoft,
      iconColor: rejectedCount > 0 ? T.danger : T.success,
      label: "ВІДХИЛЕНО",
      value: String(rejectedCount),
      sub: rejectedCount > 0 ? "повернено на доопрацювання" : "—",
    },
    {
      icon: HardHat,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ВСЬОГО",
      value: String(totalCount),
      sub: "за всю історію",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <article
          key={i}
          className="rounded-xl p-3.5"
          style={{
            backgroundColor: c.dark ? "#7C2D12" : T.panel,
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
                style={{ color: c.dark ? "#FED7AA" : T.textMuted }}
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
                style={{ color: c.dark ? "#FED7AA" : T.textMuted }}
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
  draftCount,
  pendingCount,
  approvedCount,
  rejectedCount,
  totalCount,
}: {
  active: string | null;
  draftCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCount: number;
}) {
  const segments = [
    { key: null, label: "Всі", count: totalCount, color: T.textPrimary },
    { key: "PENDING_APPROVAL", label: "На погодженні", count: pendingCount, color: T.warning },
    { key: "APPROVED", label: "Погоджено", count: approvedCount, color: T.success },
    { key: "DRAFT", label: "Чернетки", count: draftCount, color: T.textMuted },
    { key: "REJECTED", label: "Відхилено", count: rejectedCount, color: T.danger },
  ];
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s, i) => {
          const isActive = active === s.key;
          const href = s.key
            ? `/admin-v2/foreman-reports-v2?status=${s.key}`
            : "/admin-v2/foreman-reports-v2";
          return (
            <Link
              key={i}
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
    </section>
  );
}

type ReportRow = {
  id: string;
  status: string;
  rawText: string | null;
  occurredAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  project: { id: string; slug: string; title: string } | null;
  createdBy: { id: string; name: string | null } | null;
  _count: { items: number; attachments: number };
};

function ReportsList({
  reports,
  showFinance,
}: {
  reports: ReportRow[];
  showFinance: boolean;
}) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <ul className="flex flex-col">
        {reports.length === 0 && (
          <li
            className="px-5 py-16 text-center"
            style={{ color: T.textMuted }}
          >
            <HardHat
              size={32}
              style={{ color: T.amber, opacity: 0.5 }}
              className="mx-auto mb-2"
            />
            <p className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Звітів немає
            </p>
            <p className="text-[12px] mt-1" style={{ color: T.textMuted }}>
              За цим фільтром виконроби нічого не подавали
            </p>
          </li>
        )}
        {reports.map((r, idx) => (
          <ReportRow
            key={r.id}
            report={r}
            isLast={idx === reports.length - 1}
            showFinance={showFinance}
          />
        ))}
      </ul>
    </section>
  );
}

function ReportRow({
  report,
  isLast,
  showFinance,
}: {
  report: ReportRow;
  isLast: boolean;
  showFinance: boolean;
}) {
  const status = STATUS_MAP[report.status] ?? STATUS_MAP.DRAFT;
  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
      }}
    >
      <Link
        href={`/admin-v2/foreman-reports/${report.id}`}
        className="grid md:grid-cols-[40px_1fr_180px_140px_120px_20px] items-center gap-3 px-5 py-3 transition hover:brightness-95"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: status.bg }}
        >
          <status.icon size={16} style={{ color: status.fg }} />
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
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tabular-nums"
              style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
            >
              {report._count.items}{" "}
              {plural(report._count.items, "позиція", "позиції", "позицій")}
            </span>
          </div>
          <h3
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {report.createdBy?.name ?? "—"} ·{" "}
            {formatShortDate(report.occurredAt)}
          </h3>
          {report.rawText && (
            <p
              className="text-[11px] mt-0.5 line-clamp-1"
              style={{ color: T.textMuted }}
            >
              {report.rawText.slice(0, 140)}
            </p>
          )}
          {report.rejectionReason && (
            <p
              className="text-[11px] mt-0.5 line-clamp-1 font-semibold"
              style={{ color: T.danger }}
            >
              ❌ {report.rejectionReason}
            </p>
          )}
          {report._count.attachments > 0 && (
            <div
              className="text-[10px] mt-0.5 inline-flex items-center gap-1"
              style={{ color: T.textMuted }}
            >
              <ImageIcon size={10} /> {report._count.attachments}{" "}
              {plural(report._count.attachments, "файл", "файли", "файлів")}
            </div>
          )}
        </div>
        <div className="min-w-0">
          {report.project ? (
            <>
              <div
                className="text-[10px] font-bold tracking-wider tabular-nums truncate"
                style={{ color: T.accentPrimary }}
              >
                PRJ-{report.project.slug.toUpperCase().slice(0, 8)}
              </div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{ color: T.textSecondary }}
              >
                {report.project.title}
              </div>
            </>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без проєкту
            </span>
          )}
        </div>
        <div className="min-w-0">
          {showFinance && (
            <ItemsSumPlaceholder reportId={report.id} status={report.status} />
          )}
        </div>
        <div>
          <div
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: T.textSecondary }}
          >
            {report.submittedAt
              ? formatRelative(report.submittedAt)
              : formatRelative(report.createdAt)}
          </div>
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

function ItemsSumPlaceholder({
  reportId,
  status,
}: {
  reportId: string;
  status: string;
}) {
  // Без додаткового запиту на суму — рендеримо тільки status badge.
  // Сума показана в KPI strip (агрегована по PENDING).
  void reportId;
  if (status === "PENDING_APPROVAL") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
        style={{ backgroundColor: T.warningSoft, color: T.warning }}
      >
        <Sparkles size={9} />
        AI-парсинг
      </span>
    );
  }
  return (
    <span className="text-[10px]" style={{ color: T.textMuted }}>
      —
    </span>
  );
}

const STATUS_MAP: Record<
  string,
  { bg: string; fg: string; icon: typeof HardHat; label: string }
> = {
  DRAFT: { bg: T.panelSoft, fg: T.textMuted, icon: HardHat, label: "Чернетка" },
  PENDING_APPROVAL: {
    bg: T.warningSoft,
    fg: T.warning,
    icon: Clock,
    label: "На погодженні",
  },
  NEEDS_REVISION: {
    bg: T.warningSoft,
    fg: T.warning,
    icon: AlertTriangle,
    label: "На доопрацюванні",
  },
  APPROVED: {
    bg: T.successSoft,
    fg: T.success,
    icon: CheckCircle2,
    label: "Погоджено",
  },
  REJECTED: { bg: T.dangerSoft, fg: T.danger, icon: XCircle, label: "Відхилено" },
  CANCELLED: { bg: T.panelSoft, fg: T.textMuted, icon: XCircle, label: "Скасовано" },
};

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

function formatShortDate(d: Date | string): string {
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function formatRelative(d: Date | string): string {
  const ts = new Date(d).getTime();
  const diff = Date.now() - ts;
  if (diff < 60_000) return "щойно";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} хв тому`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} год тому`;
  const days = Math.round(diff / 86_400_000);
  if (days < 7) return `${days} ${plural(days, "день", "дні", "днів")} тому`;
  return formatShortDate(d);
}
