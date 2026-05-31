import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { canViewFinance } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  ImageIcon,
  Plus,
  Receipt,
  ScanLine,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "FOREMAN"];

export default async function ReceiptsV2Page({
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

  const projectScope = firmId ? { project: { firmId } } : {};

  const where: Record<string, unknown> = { ...projectScope };
  if (statusFilter) where.status = statusFilter;

  const [
    receipts,
    pendingCount,
    approvedCount,
    rejectedCount,
    totalCount,
    pendingTotal,
  ] = await Promise.all([
    prisma.receiptScan.findMany({
      where,
      select: {
        id: true,
        status: true,
        source: true,
        supplier: true,
        documentDate: true,
        totalAmount: true,
        currency: true,
        fileR2Key: true,
        fileMimeType: true,
        notes: true,
        rejectionReason: true,
        createdAt: true,
        approvedAt: true,
        project: { select: { id: true, slug: true, title: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { lineItems: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.receiptScan.count({
      where: { ...projectScope, status: "PENDING" },
    }),
    prisma.receiptScan.count({
      where: { ...projectScope, status: "APPROVED" },
    }),
    prisma.receiptScan.count({
      where: { ...projectScope, status: "REJECTED" },
    }),
    prisma.receiptScan.count({ where: projectScope }),
    showFinance
      ? prisma.receiptScan
          .aggregate({
            where: { ...projectScope, status: "PENDING" },
            _sum: { totalAmount: true },
          })
          .then((r) => Number(r._sum.totalAmount ?? 0))
      : Promise.resolve(0),
  ]);

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Накладні (скан)
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.warning }}>
              {pendingCount}
            </span>{" "}
            на погодженні
            {showFinance && pendingTotal > 0 && (
              <>
                {" "}
                · сума{" "}
                <span className="font-semibold" style={{ color: T.textPrimary }}>
                  {formatCompact(pendingTotal)} ₴
                </span>
              </>
            )}
            {" · "}
            <span className="font-semibold" style={{ color: T.success }}>
              {approvedCount}
            </span>{" "}
            оброблено
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
            href="/admin-v2/receipts"
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
          <Link
            href="/admin-v2/receipts/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
          >
            <Upload size={14} />
            Завантажити
          </Link>
        </div>
      </header>

      <KpiStrip
        totalCount={totalCount}
        pendingCount={pendingCount}
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        showFinance={showFinance}
        pendingTotal={pendingTotal}
      />

      <Toolbar
        active={statusFilter}
        pendingCount={pendingCount}
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        totalCount={totalCount}
      />

      <ReceiptsList receipts={receipts} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  pendingCount,
  approvedCount,
  rejectedCount,
  showFinance,
  pendingTotal,
}: {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  showFinance: boolean;
  pendingTotal: number;
}) {
  const cards = [
    {
      icon: Clock,
      iconBg: pendingCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: pendingCount > 0 ? T.warning : T.success,
      label: "НА ПОГОДЖЕННІ",
      value: String(pendingCount),
      sub:
        showFinance && pendingTotal > 0
          ? `${formatCompact(pendingTotal)} ₴`
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
      icon: XCircle,
      iconBg: rejectedCount > 0 ? T.dangerSoft : T.successSoft,
      iconColor: rejectedCount > 0 ? T.danger : T.success,
      label: "ВІДХИЛЕНО",
      value: String(rejectedCount),
      sub: rejectedCount > 0 ? "повернено" : "—",
    },
    {
      icon: Receipt,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ВСЬОГО",
      value: String(totalCount),
      sub: "сканів",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
  pendingCount,
  approvedCount,
  rejectedCount,
  totalCount,
}: {
  active: string | null;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCount: number;
}) {
  const segments = [
    { key: null, label: "Всі", count: totalCount, color: T.textPrimary },
    { key: "PENDING", label: "На погодженні", count: pendingCount, color: T.warning },
    { key: "APPROVED", label: "Погоджено", count: approvedCount, color: T.success },
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
            ? `/admin-v2/receipts-v2?status=${s.key}`
            : "/admin-v2/receipts-v2";
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

type ReceiptRow = {
  id: string;
  status: string;
  source: string;
  supplier: string | null;
  documentDate: Date | null;
  totalAmount: unknown;
  currency: string;
  fileR2Key: string | null;
  fileMimeType: string | null;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  project: { id: string; slug: string; title: string } | null;
  createdBy: { id: string; name: string | null } | null;
  _count: { lineItems: number };
};

function ReceiptsList({ receipts }: { receipts: ReceiptRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <ul className="flex flex-col">
        {receipts.length === 0 && (
          <li className="px-5 py-16 text-center" style={{ color: T.textMuted }}>
            <ScanLine
              size={32}
              style={{ color: T.amber, opacity: 0.5 }}
              className="mx-auto mb-2"
            />
            <p className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Сканів немає
            </p>
            <p className="text-[12px] mt-1" style={{ color: T.textMuted }}>
              Завантаж фото або PDF накладної — AI зробить розпарсинг
            </p>
          </li>
        )}
        {receipts.map((r, idx) => (
          <ReceiptRow
            key={r.id}
            receipt={r}
            isLast={idx === receipts.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

function ReceiptRow({
  receipt,
  isLast,
}: {
  receipt: ReceiptRow;
  isLast: boolean;
}) {
  const status = STATUS_MAP[receipt.status] ?? STATUS_MAP.PENDING;
  const total = Number(receipt.totalAmount ?? 0);
  const isImage =
    receipt.fileMimeType?.startsWith("image/") ?? false;
  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
        opacity:
          receipt.status === "REJECTED" || receipt.status === "CANCELLED"
            ? 0.6
            : 1,
      }}
    >
      <Link
        href={`/admin-v2/receipts/${receipt.id}`}
        className="grid md:grid-cols-[48px_1fr_180px_140px_120px_20px] items-center gap-3 px-5 py-3 transition hover:brightness-95"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: T.panelSoft }}
        >
          {isImage ? (
            <ImageIcon size={18} style={{ color: T.textSecondary }} />
          ) : (
            <FileText size={18} style={{ color: T.textSecondary }} />
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
            {receipt.status === "PENDING" && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: T.violetSoft, color: T.violet }}
              >
                <Sparkles size={9} />
                AI парс
              </span>
            )}
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
              style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
            >
              {receipt.source}
            </span>
          </div>
          <h3
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {receipt.supplier ?? "Постачальник —"}
            {receipt.documentDate && ` · ${formatShortDate(receipt.documentDate)}`}
          </h3>
          {receipt.rejectionReason && (
            <p
              className="text-[11px] mt-0.5 font-semibold"
              style={{ color: T.danger }}
            >
              ❌ {receipt.rejectionReason}
            </p>
          )}
          {receipt.notes && !receipt.rejectionReason && (
            <p
              className="text-[11px] mt-0.5 truncate"
              style={{ color: T.textMuted }}
            >
              {receipt.notes}
            </p>
          )}
          <div className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
            {receipt._count.lineItems > 0 &&
              `${receipt._count.lineItems} позицій · `}
            {receipt.createdBy?.name ?? "—"}
          </div>
        </div>
        <div className="min-w-0">
          {receipt.project ? (
            <>
              <div
                className="text-[10px] font-bold tracking-wider tabular-nums truncate"
                style={{ color: T.accentPrimary }}
              >
                PRJ-{receipt.project.slug.toUpperCase().slice(0, 8)}
              </div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{ color: T.textSecondary }}
              >
                {receipt.project.title}
              </div>
            </>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без проєкту
            </span>
          )}
        </div>
        <div className="text-right">
          {total > 0 ? (
            <div
              className="text-[14px] font-bold tabular-nums"
              style={{ color: T.textPrimary }}
            >
              {formatCompact(total)} {receipt.currency}
            </div>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              —
            </span>
          )}
        </div>
        <div>
          <div
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: T.textSecondary }}
          >
            {formatRelative(receipt.createdAt)}
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

const STATUS_MAP: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  PENDING: { bg: T.warningSoft, fg: T.warning, label: "На погодженні" },
  APPROVED: { bg: T.successSoft, fg: T.success, label: "Погоджено" },
  REJECTED: { bg: T.dangerSoft, fg: T.danger, label: "Відхилено" },
  CANCELLED: { bg: T.panelSoft, fg: T.textMuted, label: "Скасовано" },
};

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

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
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
