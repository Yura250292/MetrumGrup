import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  AlertOctagon,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flag,
  HelpCircle,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RfisV2Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  const sp = await searchParams;
  const statusFilter = sp.status ?? null;
  const priorityFilter = sp.priority ?? null;

  const where: Record<string, unknown> = firmId ? { firmId } : {};
  if (statusFilter) where.status = statusFilter;
  if (priorityFilter) where.priority = priorityFilter;

  const now = new Date();
  const [rfis, openCount, overdueCount, answeredCount, totalCount] =
    await Promise.all([
      prisma.rFI.findMany({
        where,
        select: {
          id: true,
          number: true,
          subject: true,
          question: true,
          status: true,
          priority: true,
          askedAt: true,
          dueAt: true,
          answeredAt: true,
          askedBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          project: { select: { id: true, slug: true, title: true } },
          _count: { select: { comments: true, attachments: true } },
        },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 50,
      }),
      prisma.rFI.count({
        where: {
          ...(firmId ? { firmId } : {}),
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      prisma.rFI.count({
        where: {
          ...(firmId ? { firmId } : {}),
          status: { in: ["OPEN", "IN_PROGRESS"] },
          dueAt: { lt: now },
        },
      }),
      prisma.rFI.count({
        where: { ...(firmId ? { firmId } : {}), status: "ANSWERED" },
      }),
      prisma.rFI.count({ where: firmId ? { firmId } : {} }),
    ]);

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            RFI (запити)
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {openCount}
            </span>{" "}
            відкритих
            {overdueCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold" style={{ color: T.danger }}>
                  {overdueCount}
                </span>{" "}
                прострочено
              </>
            )}
            {" · "}
            <span className="font-semibold" style={{ color: T.success }}>
              {answeredCount}
            </span>{" "}
            відповіли
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
            href="/admin-v2/rfis"
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
        openCount={openCount}
        overdueCount={overdueCount}
        answeredCount={answeredCount}
      />

      <Toolbar
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        totalCount={totalCount}
        openCount={openCount}
        answeredCount={answeredCount}
      />

      <RfiList rfis={rfis} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  openCount,
  overdueCount,
  answeredCount,
}: {
  totalCount: number;
  openCount: number;
  overdueCount: number;
  answeredCount: number;
}) {
  const cards = [
    {
      icon: HelpCircle,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ВІДКРИТИХ",
      value: String(openCount),
      sub: `з ${totalCount} всього`,
    },
    {
      icon: AlertOctagon,
      iconBg: overdueCount > 0 ? T.dangerSoft : T.successSoft,
      iconColor: overdueCount > 0 ? T.danger : T.success,
      label: "ПРОСТРОЧЕНІ",
      value: String(overdueCount),
      sub: overdueCount > 0 ? "SLA минув" : "усі в строках",
      dark: overdueCount > 0,
    },
    {
      icon: CheckCircle2,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "ВІДПОВІЛИ",
      value: String(answeredCount),
      sub: "очікують закриття",
    },
    {
      icon: MessageSquare,
      iconBg: T.skySoft,
      iconColor: T.sky,
      label: "ВСЬОГО",
      value: String(totalCount),
      sub: "за всю історію",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                className="text-[22px] font-bold tabular-nums leading-none mt-0.5"
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
  statusFilter,
  priorityFilter,
  totalCount,
  openCount,
  answeredCount,
}: {
  statusFilter: string | null;
  priorityFilter: string | null;
  totalCount: number;
  openCount: number;
  answeredCount: number;
}) {
  const segments = [
    { key: null, label: "Всі", count: totalCount, color: T.textPrimary },
    { key: "OPEN", label: "Відкриті", count: openCount, color: T.accentPrimary },
    { key: "ANSWERED", label: "З відповіддю", count: answeredCount, color: T.success },
    { key: "CLOSED", label: "Закриті", count: null, color: T.textMuted },
  ];
  const priorities = ["URGENT", "HIGH", "NORMAL", "LOW"];
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s, i) => {
          const isActive = statusFilter === s.key;
          const params = new URLSearchParams();
          if (s.key) params.set("status", s.key);
          if (priorityFilter) params.set("priority", priorityFilter);
          const href = params.toString()
            ? `/admin-v2/rfis-v2?${params.toString()}`
            : "/admin-v2/rfis-v2";
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
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {priorities.map((p) => {
          const isActive = priorityFilter === p;
          const prio = PRIORITY_MAP[p];
          const params = new URLSearchParams();
          if (statusFilter) params.set("status", statusFilter);
          if (!isActive) params.set("priority", p);
          const href = params.toString()
            ? `/admin-v2/rfis-v2?${params.toString()}`
            : "/admin-v2/rfis-v2";
          return (
            <Link
              key={p}
              href={href}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold tracking-wider transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? prio.color : T.panelSoft,
                color: isActive ? "#FFFFFF" : prio.color,
              }}
            >
              <Flag size={10} />
              {p}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type RfiRow = {
  id: string;
  number: string;
  subject: string;
  question: string;
  status: string;
  priority: string;
  askedAt: Date;
  dueAt: Date | null;
  answeredAt: Date | null;
  askedBy: { id: string; name: string | null } | null;
  assignedTo: { id: string; name: string | null } | null;
  project: { id: string; slug: string; title: string } | null;
  _count: { comments: number; attachments: number };
};

function RfiList({ rfis }: { rfis: RfiRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <ul className="flex flex-col">
        {rfis.length === 0 && (
          <li
            className="px-5 py-16 text-center"
            style={{ color: T.textMuted }}
          >
            <HelpCircle
              size={32}
              style={{ color: T.success, opacity: 0.5 }}
              className="mx-auto mb-2"
            />
            <p className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              RFI у цьому фільтрі немає
            </p>
            <p className="text-[12px] mt-1" style={{ color: T.textMuted }}>
              Усі запити вирішено — добра робота
            </p>
          </li>
        )}
        {rfis.map((r, idx) => (
          <RfiRow key={r.id} rfi={r} isLast={idx === rfis.length - 1} />
        ))}
      </ul>
    </section>
  );
}

function RfiRow({ rfi, isLast }: { rfi: RfiRow; isLast: boolean }) {
  const status = STATUS_MAP[rfi.status] ?? STATUS_MAP.OPEN;
  const prio = PRIORITY_MAP[rfi.priority] ?? PRIORITY_MAP.NORMAL;
  const dueTier = getDueTier(rfi.dueAt, rfi.status);
  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
        opacity:
          rfi.status === "CLOSED" || rfi.status === "CANCELLED" ? 0.6 : 1,
      }}
    >
      <Link
        href={`/admin-v2/rfis/${rfi.id}`}
        className="grid md:grid-cols-[40px_3px_1fr_180px_180px_120px_20px] items-center gap-3 px-5 py-3 transition hover:brightness-95"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: status.bg }}
        >
          <status.icon size={16} style={{ color: status.fg }} />
        </div>
        <div
          className="hidden md:block w-[3px] h-7 rounded-full"
          style={{ backgroundColor: prio.color }}
          title={`Priority: ${rfi.priority}`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="text-[10px] font-bold tracking-wider tabular-nums"
              style={{ color: T.textMuted }}
            >
              {rfi.number}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: status.bg, color: status.fg }}
            >
              {status.label}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
              style={{ backgroundColor: prio.bg, color: prio.color }}
            >
              {rfi.priority}
            </span>
          </div>
          <h3
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
            title={rfi.subject}
          >
            {rfi.subject}
          </h3>
          <p
            className="text-[11px] mt-0.5 line-clamp-1"
            style={{ color: T.textMuted }}
          >
            {rfi.question}
          </p>
          {(rfi._count.comments > 0 || rfi._count.attachments > 0) && (
            <div
              className="text-[10px] mt-0.5 flex items-center gap-2"
              style={{ color: T.textMuted }}
            >
              {rfi._count.comments > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <MessageSquare size={9} /> {rfi._count.comments}
                </span>
              )}
              {rfi._count.attachments > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Paperclip size={9} /> {rfi._count.attachments}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="min-w-0">
          {rfi.project && (
            <>
              <div
                className="text-[10px] font-bold tracking-wider tabular-nums truncate"
                style={{ color: T.accentPrimary }}
              >
                PRJ-{rfi.project.slug.toUpperCase().slice(0, 8)}
              </div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{ color: T.textSecondary }}
              >
                {rfi.project.title}
              </div>
            </>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px]" style={{ color: T.textMuted }}>
            Від {rfi.askedBy?.name ?? "—"}
          </div>
          <div
            className="text-[11px] mt-0.5 truncate font-medium"
            style={{ color: T.textSecondary }}
          >
            → {rfi.assignedTo?.name ?? "не призначено"}
          </div>
        </div>
        <div>
          {dueTier ? (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ backgroundColor: dueTier.bg, color: dueTier.fg }}
            >
              <dueTier.icon size={11} />
              {dueTier.label}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              без SLA
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

const STATUS_MAP: Record<
  string,
  { bg: string; fg: string; icon: typeof HelpCircle; label: string }
> = {
  OPEN: { bg: T.accentPrimarySoft, fg: T.accentPrimary, icon: HelpCircle, label: "Відкрито" },
  IN_PROGRESS: { bg: T.warningSoft, fg: T.warning, icon: Clock, label: "В роботі" },
  ANSWERED: { bg: T.successSoft, fg: T.success, icon: CheckCircle2, label: "Відповіли" },
  CLOSED: { bg: T.panelSoft, fg: T.textMuted, icon: CheckCircle2, label: "Закрито" },
  CANCELLED: { bg: T.dangerSoft, fg: T.danger, icon: XCircle, label: "Скасовано" },
};

const PRIORITY_MAP: Record<string, { bg: string; color: string }> = {
  URGENT: { bg: T.dangerSoft, color: T.danger },
  HIGH: { bg: T.warningSoft, color: T.warning },
  NORMAL: { bg: T.accentPrimarySoft, color: T.accentPrimary },
  LOW: { bg: T.panelSoft, color: T.textMuted },
};

function getDueTier(
  due: Date | null,
  status: string,
): { bg: string; fg: string; icon: typeof Clock; label: string } | null {
  if (!due) return null;
  if (status === "ANSWERED" || status === "CLOSED" || status === "CANCELLED") {
    return null;
  }
  const days = Math.round(
    (new Date(due).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) {
    return {
      bg: T.dangerSoft,
      fg: T.danger,
      icon: AlertOctagon,
      label: `-${Math.abs(days)} дн`,
    };
  }
  if (days === 0) {
    return { bg: T.warningSoft, fg: T.warning, icon: AlertOctagon, label: "сьогодні" };
  }
  if (days <= 2) {
    return { bg: T.warningSoft, fg: T.warning, icon: Clock, label: `${days} дн` };
  }
  return { bg: T.skySoft, fg: T.sky, icon: Clock, label: `${days} дн` };
}
