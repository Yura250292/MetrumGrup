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
  FileSignature,
  Plus,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];

export default async function ChangeOrdersV2Page({
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

  const [orders, totalCount, pendingPmCount, pendingClientCount, approvedCount, totalImpact] =
    await Promise.all([
      prisma.changeOrder.findMany({
        where,
        select: {
          id: true,
          number: true,
          title: true,
          type: true,
          status: true,
          costImpact: true,
          scheduleImpactDays: true,
          requestedAt: true,
          pmApprovedAt: true,
          adminApprovedAt: true,
          clientApprovedAt: true,
          rejectionReason: true,
          project: { select: { id: true, slug: true, title: true } },
          _count: { select: { items: true, attachments: true } },
        },
        orderBy: { requestedAt: "desc" },
        take: 50,
      }),
      prisma.changeOrder.count({ where: firmId ? { firmId } : {} }),
      prisma.changeOrder.count({
        where: { ...(firmId ? { firmId } : {}), status: "PENDING_PM" },
      }),
      prisma.changeOrder.count({
        where: { ...(firmId ? { firmId } : {}), status: "PENDING_CLIENT" },
      }),
      prisma.changeOrder.count({
        where: { ...(firmId ? { firmId } : {}), status: "APPROVED" },
      }),
      showFinance
        ? prisma.changeOrder
            .aggregate({
              where: {
                ...(firmId ? { firmId } : {}),
                status: "APPROVED",
              },
              _sum: { costImpact: true },
            })
            .then((r) => Number(r._sum.costImpact ?? 0))
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
            Зміни в кошторисах
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.warning }}>
              {pendingPmCount + pendingClientCount}
            </span>{" "}
            на погодженні · {approvedCount} затверджено
            {showFinance && totalImpact !== 0 && (
              <>
                {" "}
                · сукупно{" "}
                <span
                  className="font-semibold"
                  style={{ color: totalImpact >= 0 ? T.success : T.danger }}
                >
                  {totalImpact >= 0 ? "+" : ""}
                  {formatCompact(totalImpact)} ₴
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
            V2
          </span>
          <Link
            href="/admin-v2/change-orders"
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
            href="/admin-v2/change-orders/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
          >
            <Plus size={14} />
            Нова зміна
          </Link>
        </div>
      </header>

      <KpiStrip
        totalCount={totalCount}
        pendingPmCount={pendingPmCount}
        pendingClientCount={pendingClientCount}
        approvedCount={approvedCount}
        totalImpact={totalImpact}
        showFinance={showFinance}
      />

      <Toolbar
        active={statusFilter}
        pendingPmCount={pendingPmCount}
        pendingClientCount={pendingClientCount}
        approvedCount={approvedCount}
        totalCount={totalCount}
      />

      <OrdersList orders={orders} showFinance={showFinance} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  pendingPmCount,
  pendingClientCount,
  approvedCount,
  totalImpact,
  showFinance,
}: {
  totalCount: number;
  pendingPmCount: number;
  pendingClientCount: number;
  approvedCount: number;
  totalImpact: number;
  showFinance: boolean;
}) {
  const cards: Array<{
    icon: typeof FileSignature;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    dark?: boolean;
  }> = [
    {
      icon: FileSignature,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ВСЬОГО CO",
      value: String(totalCount),
      sub: "за весь час",
    },
    {
      icon: Clock,
      iconBg: pendingPmCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: pendingPmCount > 0 ? T.warning : T.success,
      label: "PENDING PM",
      value: String(pendingPmCount),
      sub: pendingPmCount > 0 ? "очікують ПМ" : "усе погоджено",
    },
    {
      icon: AlertTriangle,
      iconBg: pendingClientCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: pendingClientCount > 0 ? T.warning : T.success,
      label: "PENDING CLIENT",
      value: String(pendingClientCount),
      sub: pendingClientCount > 0 ? "очікують замовника" : "—",
    },
    {
      icon: CheckCircle2,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "APPROVED",
      value: String(approvedCount),
      sub: "застосовано до кошторису",
    },
  ];
  if (showFinance) {
    cards.push({
      icon: totalImpact >= 0 ? TrendingUp : TrendingDown,
      iconBg: totalImpact >= 0 ? T.successSoft : T.dangerSoft,
      iconColor: totalImpact >= 0 ? T.success : T.danger,
      label: "СУКУПНИЙ IMPACT",
      value: `${totalImpact >= 0 ? "+" : ""}${formatCompact(totalImpact)}`,
      sub: "₴ по APPROVED",
      dark: true,
    });
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <article
          key={i}
          className="rounded-xl p-3.5"
          style={{
            backgroundColor: c.dark ? "#0F172A" : T.panel,
            border: c.dark ? "none" : `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: c.iconBg }}
            >
              <c.icon size={16} style={{ color: c.iconColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[9.5px] font-bold tracking-wider"
                style={{ color: c.dark ? "#94A3B8" : T.textMuted }}
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
                style={{ color: c.dark ? "#A78BFA" : T.textMuted }}
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
  pendingPmCount,
  pendingClientCount,
  approvedCount,
  totalCount,
}: {
  active: string | null;
  pendingPmCount: number;
  pendingClientCount: number;
  approvedCount: number;
  totalCount: number;
}) {
  const segments = [
    { key: null, label: "Всі", count: totalCount, color: T.textPrimary },
    { key: "DRAFT", label: "Чернетки", count: null, color: T.textMuted },
    { key: "PENDING_PM", label: "PM", count: pendingPmCount, color: T.warning },
    { key: "PENDING_CLIENT", label: "Client", count: pendingClientCount, color: T.amber },
    { key: "APPROVED", label: "Approved", count: approvedCount, color: T.success },
    { key: "REJECTED", label: "Rejected", count: null, color: T.danger },
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
            ? `/admin-v2/change-orders-v2?status=${s.key}`
            : "/admin-v2/change-orders-v2";
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
              {s.count !== null && (
                <span className="tabular-nums opacity-70">{s.count}</span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type OrderRow = {
  id: string;
  number: string;
  title: string;
  type: string;
  status: string;
  costImpact: unknown;
  scheduleImpactDays: number;
  requestedAt: Date;
  pmApprovedAt: Date | null;
  adminApprovedAt: Date | null;
  clientApprovedAt: Date | null;
  rejectionReason: string | null;
  project: { id: string; slug: string; title: string } | null;
  _count: { items: number; attachments: number };
};

function OrdersList({
  orders,
  showFinance,
}: {
  orders: OrderRow[];
  showFinance: boolean;
}) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <ul className="flex flex-col">
        {orders.length === 0 && (
          <li
            className="px-5 py-16 text-center"
            style={{ color: T.textMuted }}
          >
            <FileSignature
              size={32}
              style={{ color: T.success, opacity: 0.5 }}
              className="mx-auto mb-2"
            />
            <p className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Змін у кошторисах немає
            </p>
            <p className="text-[12px] mt-1" style={{ color: T.textMuted }}>
              Усі CO застосовано або скасовано
            </p>
          </li>
        )}
        {orders.map((o, idx) => (
          <OrderRow
            key={o.id}
            order={o}
            isLast={idx === orders.length - 1}
            showFinance={showFinance}
          />
        ))}
      </ul>
    </section>
  );
}

function OrderRow({
  order,
  isLast,
  showFinance,
}: {
  order: OrderRow;
  isLast: boolean;
  showFinance: boolean;
}) {
  const status = STATUS_MAP[order.status] ?? STATUS_MAP.DRAFT;
  const impact = Number(order.costImpact ?? 0);
  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
        opacity:
          order.status === "REJECTED" || order.status === "CANCELLED" ? 0.6 : 1,
      }}
    >
      <Link
        href={`/admin-v2/change-orders/${order.id}`}
        className="grid md:grid-cols-[40px_1fr_180px_140px_140px_20px] items-center gap-3 px-5 py-3 transition hover:brightness-95"
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
              className="text-[10px] font-bold tracking-wider tabular-nums"
              style={{ color: T.textMuted }}
            >
              {order.number}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: status.bg, color: status.fg }}
            >
              {status.label}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
              style={{
                backgroundColor: TYPE_MAP[order.type]?.bg ?? T.panelSoft,
                color: TYPE_MAP[order.type]?.fg ?? T.textSecondary,
              }}
            >
              {order.type}
            </span>
          </div>
          <h3
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
            title={order.title}
          >
            {order.title}
          </h3>
          {order.rejectionReason && (
            <p
              className="text-[11px] mt-0.5 line-clamp-1 font-semibold"
              style={{ color: T.danger }}
            >
              ❌ {order.rejectionReason}
            </p>
          )}
          <div
            className="text-[10px] mt-0.5"
            style={{ color: T.textMuted }}
          >
            {order._count.items} {plural(order._count.items, "позиція", "позиції", "позицій")}
            {order._count.attachments > 0 && ` · 📎 ${order._count.attachments}`}
          </div>
        </div>
        <div className="min-w-0">
          {order.project ? (
            <>
              <div
                className="text-[10px] font-bold tracking-wider tabular-nums truncate"
                style={{ color: T.accentPrimary }}
              >
                PRJ-{order.project.slug.toUpperCase().slice(0, 8)}
              </div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{ color: T.textSecondary }}
              >
                {order.project.title}
              </div>
            </>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без проєкту
            </span>
          )}
        </div>
        <div className="text-right">
          {showFinance ? (
            <>
              <div
                className="text-[13px] font-bold tabular-nums"
                style={{ color: impact >= 0 ? T.success : T.danger }}
              >
                {impact >= 0 ? "+" : ""}
                {formatCompact(impact)} ₴
              </div>
              {order.scheduleImpactDays !== 0 && (
                <div className="text-[10px]" style={{ color: T.textMuted }}>
                  {order.scheduleImpactDays > 0 ? "+" : ""}
                  {order.scheduleImpactDays} дн
                </div>
              )}
            </>
          ) : (
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              📊 SUPER_ADMIN
            </span>
          )}
        </div>
        <div>
          <div
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: T.textSecondary }}
          >
            {formatShortDate(order.requestedAt)}
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
  { bg: string; fg: string; icon: typeof FileSignature; label: string }
> = {
  DRAFT: { bg: T.panelSoft, fg: T.textMuted, icon: FileSignature, label: "Чернетка" },
  PENDING_PM: { bg: T.warningSoft, fg: T.warning, icon: Clock, label: "На ПМ" },
  PENDING_ADMIN: {
    bg: T.warningSoft,
    fg: T.warning,
    icon: Clock,
    label: "На адміні",
  },
  PENDING_CLIENT: {
    bg: T.amberSoft,
    fg: T.amber,
    icon: AlertTriangle,
    label: "На клієнті",
  },
  APPROVED: {
    bg: T.successSoft,
    fg: T.success,
    icon: CheckCircle2,
    label: "Затверджено",
  },
  REJECTED: {
    bg: T.dangerSoft,
    fg: T.danger,
    icon: XCircle,
    label: "Відхилено",
  },
  CANCELLED: {
    bg: T.panelSoft,
    fg: T.textMuted,
    icon: XCircle,
    label: "Скасовано",
  },
};

const TYPE_MAP: Record<string, { bg: string; fg: string }> = {
  ADD: { bg: T.successSoft, fg: T.success },
  REMOVE: { bg: T.dangerSoft, fg: T.danger },
  CHANGE: { bg: T.warningSoft, fg: T.warning },
  PRICE_CHANGE: { bg: T.violetSoft, fg: T.violet },
  QUANTITY_CHANGE: { bg: T.skySoft, fg: T.sky },
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
  const yy = String(date.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}
