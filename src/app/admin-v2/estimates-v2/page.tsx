import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Edit3,
  FileText,
  Percent,
  Plus,
  Sparkles,
  Scale,
  Search,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];

export default async function EstimatesV2Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const statusFilter = sp.status ?? null;

  const baseSelect = {
    id: true,
    number: true,
    title: true,
    status: true,
    version: true,
    totalAmount: true,
    finalAmount: true,
    finalClientPrice: true,
    profitMarginOverall: true,
    updatedAt: true,
    createdAt: true,
    structuredReport: true,
    verificationStatus: true,
    prozorroChecked: true,
    project: { select: { id: true, slug: true, title: true } },
    createdBy: { select: { id: true, name: true } },
    _count: { select: { items: true, sections: true, versions: true } },
  } as const;

  const where = statusFilter
    ? { status: statusFilter as never }
    : undefined;

  const estimates = await prisma.estimate.findMany({
    where,
    select: baseSelect,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // KPIs (count over all, not filtered)
  const [totalCount, statusCounts] = await Promise.all([
    prisma.estimate.count(),
    prisma.estimate.groupBy({
      by: ["status"],
      _count: { id: true },
      _avg: { profitMarginOverall: true },
      _sum: { finalClientPrice: true },
    }),
  ]);

  const countsByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count.id]),
  );
  const allTotalSum = statusCounts.reduce(
    (s, x) => s + Number(x._sum.finalClientPrice ?? 0),
    0,
  );
  const avgMargin =
    statusCounts.length > 0
      ? statusCounts.reduce((s, x) => s + Number(x._avg.profitMarginOverall ?? 0), 0) /
        statusCounts.length
      : 0;
  const aiCount = estimates.filter((e) => e.structuredReport).length;
  const prozorroCount = estimates.filter((e) => e.prozorroChecked).length;

  const segments = [
    { key: null as string | null, label: "Усі", count: totalCount, color: T.textPrimary },
    {
      key: "DRAFT",
      label: "Чернетки",
      count: countsByStatus.DRAFT ?? 0,
      color: T.warning,
    },
    {
      key: "FINANCE_REVIEW",
      label: "На погодженні",
      count: countsByStatus.FINANCE_REVIEW ?? 0,
      color: T.amber,
    },
    {
      key: "APPROVED",
      label: "Затверджені",
      count: countsByStatus.APPROVED ?? 0,
      color: T.success,
    },
    {
      key: "ARCHIVED",
      label: "Архів",
      count: countsByStatus.ARCHIVED ?? 0,
      color: T.textMuted,
    },
  ];

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Кошториси
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {totalCount}
            </span>{" "}
            кошторисів · {formatCompact(allTotalSum)} ₴ загальна сума · сер. маржа{" "}
            <span className="font-semibold" style={{ color: T.success }}>
              {avgMargin.toFixed(1)}%
            </span>
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
            href="/admin-v2/estimates"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
              color: T.textSecondary,
            }}
          >
            Стандартний список
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </header>

      <KpiStrip
        totalCount={totalCount}
        allTotalSum={allTotalSum}
        avgMargin={avgMargin}
        aiCount={aiCount}
        prozorroCount={prozorroCount}
        pendingCount={countsByStatus.FINANCE_REVIEW ?? 0}
      />

      <Toolbar
        segments={segments}
        active={statusFilter}
      />

      <EstimateTable rows={estimates} />

      <AiGenerateBanner />
    </div>
  );
}

function KpiStrip({
  totalCount,
  allTotalSum,
  avgMargin,
  aiCount,
  prozorroCount,
  pendingCount,
}: {
  totalCount: number;
  allTotalSum: number;
  avgMargin: number;
  aiCount: number;
  prozorroCount: number;
  pendingCount: number;
}) {
  const cards: Array<{
    icon: typeof FileText;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    dark?: boolean;
  }> = [
    {
      icon: FileText,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ВСЬОГО",
      value: String(totalCount),
      sub: `${formatCompact(allTotalSum)} ₴`,
    },
    {
      icon: AlertTriangle,
      iconBg: pendingCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: pendingCount > 0 ? T.warning : T.success,
      label: "НА ПОГОДЖЕННІ",
      value: String(pendingCount),
      sub: pendingCount > 0 ? "перевір та схвали" : "усе погоджено",
    },
    {
      icon: Percent,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "СЕР. МАРЖА",
      value: `${avgMargin.toFixed(1)}%`,
      sub: "ціль 22%",
    },
    {
      icon: Sparkles,
      iconBg: T.violetSoft,
      iconColor: T.violet,
      label: "AI ЗГЕНЕРОВАНО",
      value: String(aiCount),
      sub: totalCount > 0 ? `${Math.round((aiCount / totalCount) * 100)}% з усіх` : "—",
      dark: true,
    },
    {
      icon: Scale,
      iconBg: T.skySoft,
      iconColor: T.sky,
      label: "ПРОЗОРРО",
      value: String(prozorroCount),
      sub: prozorroCount > 0 ? "перевірено" : "ще не перевіряли",
    },
  ];

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
  segments,
  active,
}: {
  segments: Array<{ key: string | null; label: string; count: number; color: string }>;
  active: string | null;
}) {
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px] max-w-md"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={14} style={{ color: T.textMuted }} />
        <input
          type="search"
          placeholder="Пошук за номером або проєктом…"
          className="bg-transparent border-0 outline-none flex-1 text-[13px]"
          style={{ color: T.textPrimary }}
          disabled
        />
        <kbd
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textMuted,
          }}
        >
          ⌘K
        </kbd>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s, i) => {
          const isActive = active === s.key;
          const href = s.key
            ? `/admin-v2/estimates-v2?status=${s.key}`
            : `/admin-v2/estimates-v2`;
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
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
              <span
                className="tabular-nums"
                style={{
                  color: isActive ? "#FFFFFF" : T.textPrimary,
                  opacity: isActive ? 0.7 : 1,
                }}
              >
                {s.count}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type EstimateRowType = {
  id: string;
  number: string;
  title: string;
  status: string;
  version: number;
  totalAmount: unknown;
  finalAmount: unknown;
  finalClientPrice: unknown;
  profitMarginOverall: unknown;
  updatedAt: Date;
  structuredReport: unknown;
  verificationStatus: string | null;
  project: { id: string; slug: string; title: string } | null;
  createdBy: { id: string; name: string | null } | null;
  _count: { items: number; sections: number; versions: number };
};

function EstimateTable({ rows }: { rows: EstimateRowType[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header
        className="hidden md:grid grid-cols-[1fr_220px_140px_100px_140px_120px_20px] gap-3 px-5 py-2.5 text-[10px] font-bold tracking-wider"
        style={{
          backgroundColor: T.panelSoft,
          color: T.textMuted,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        <span>НОМЕР · НАЗВА</span>
        <span>ПРОЄКТ</span>
        <span>СТАТУС</span>
        <span className="text-right">МАРЖА</span>
        <span className="text-right">СУМА КЛІЄНТУ</span>
        <span>ОНОВЛЕНО</span>
        <span />
      </header>
      <ul className="flex flex-col">
        {rows.length === 0 && (
          <li
            className="px-5 py-10 text-center text-[13px]"
            style={{ color: T.textMuted }}
          >
            Кошторисів у цьому фільтрі немає
          </li>
        )}
        {rows.map((r) => {
          const isAi = !!r.structuredReport;
          const margin = Number(r.profitMarginOverall ?? 0);
          const sum = Number(r.finalClientPrice ?? r.finalAmount ?? 0);
          const status = STATUS_MAP[r.status] ?? STATUS_MAP.DRAFT;
          return (
            <li key={r.id}>
              <Link
                href={`/admin-v2/estimates/${r.id}`}
                className="grid md:grid-cols-[1fr_220px_140px_100px_140px_120px_20px] gap-3 px-5 py-3 transition hover:brightness-95"
                style={{
                  borderTop: `1px solid ${T.borderSoft}`,
                  borderLeft: `3px solid ${status.accent}`,
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="text-[11px] font-bold tracking-wider tabular-nums"
                      style={{ color: T.textMuted }}
                    >
                      {r.number}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold tabular-nums"
                      style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
                    >
                      v{r.version}
                    </span>
                    {isAi && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                        style={{ backgroundColor: T.violetSoft, color: T.violet }}
                      >
                        <Sparkles size={9} />
                        AI
                      </span>
                    )}
                    {r.verificationStatus === "critical" && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      >
                        <AlertTriangle size={9} />
                        КРИТ
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[13px] font-semibold truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {r.title}
                  </div>
                  <div
                    className="text-[11px] mt-0.5 truncate"
                    style={{ color: T.textMuted }}
                  >
                    {r._count.sections} {plural(r._count.sections, "розділ", "розділи", "розділів")} ·{" "}
                    {r._count.items} {plural(r._count.items, "позиція", "позиції", "позицій")}
                    {r._count.versions > 1 && ` · ${r._count.versions} версій`}
                  </div>
                </div>
                <div className="min-w-0">
                  {r.project ? (
                    <>
                      <div
                        className="text-[11px] font-bold tracking-wider tabular-nums truncate"
                        style={{ color: T.accentPrimary }}
                      >
                        PRJ-{r.project.slug.toUpperCase().slice(0, 8)}
                      </div>
                      <div
                        className="text-[12px] truncate mt-0.5"
                        style={{ color: T.textSecondary }}
                      >
                        {r.project.title}
                      </div>
                    </>
                  ) : (
                    <span className="text-[12px]" style={{ color: T.textMuted }}>
                      без проєкту
                    </span>
                  )}
                </div>
                <div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold"
                    style={{ backgroundColor: status.bg, color: status.fg }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: status.dot }}
                    />
                    {status.label}
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className="text-[15px] font-bold tabular-nums"
                    style={{
                      color:
                        margin >= 20
                          ? T.success
                          : margin >= 15
                            ? T.warning
                            : margin > 0
                              ? T.danger
                              : T.textMuted,
                    }}
                  >
                    {margin > 0 ? `${margin.toFixed(0)}%` : "—"}
                  </span>
                </div>
                <div className="text-right">
                  <div
                    className="text-[14px] font-bold tabular-nums"
                    style={{ color: T.textPrimary }}
                  >
                    {sum > 0 ? `${formatCompact(sum)} ₴` : "—"}
                  </div>
                </div>
                <div>
                  <div
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: T.textSecondary }}
                  >
                    {formatRelativeDate(r.updatedAt)}
                  </div>
                  {r.createdBy?.name && (
                    <div
                      className="text-[10px] truncate"
                      style={{ color: T.textMuted }}
                    >
                      {r.createdBy.name}
                    </div>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  style={{ color: T.textMuted }}
                  className="self-center hidden md:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AiGenerateBanner() {
  return (
    <section
      className="rounded-2xl px-6 py-8 text-center"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.violet}33`,
      }}
    >
      <div
        className="inline-flex h-14 w-14 items-center justify-center rounded-full mb-3"
        style={{ backgroundColor: T.violetSoft }}
      >
        <Sparkles size={24} style={{ color: T.violet }} />
      </div>
      <h3
        className="text-[16px] font-bold"
        style={{ color: T.textPrimary }}
      >
        Не знаходиш потрібного кошторису?
      </h3>
      <p
        className="text-[13px] mt-1 max-w-md mx-auto"
        style={{ color: T.textSecondary }}
      >
        Опиши проєкт текстом, голосом або фото плану — AI згенерує драфт за 30 секунд
      </p>
      <div className="flex items-center justify-center gap-2 mt-4">
        <Link
          href="/ai-estimate-v2"
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition hover:brightness-110"
          style={{ backgroundColor: T.violet, color: "#FFFFFF" }}
        >
          <Sparkles size={14} />
          AI-генерувати
        </Link>
        <Link
          href="/admin-v2/estimates/new"
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition hover:brightness-95"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
        >
          <Edit3 size={14} />
          Створити з 0
        </Link>
      </div>
    </section>
  );
}

const STATUS_MAP: Record<string, { bg: string; fg: string; dot: string; label: string; accent: string }> = {
  DRAFT: {
    bg: T.warningSoft,
    fg: T.warning,
    dot: T.warning,
    label: "Чернетка",
    accent: T.warning,
  },
  ENGINEER_REVIEW: {
    bg: T.skySoft,
    fg: T.sky,
    dot: T.sky,
    label: "Інженер-аналіз",
    accent: T.sky,
  },
  FINANCE_REVIEW: {
    bg: T.amberSoft,
    fg: T.amber,
    dot: T.amber,
    label: "На погодженні",
    accent: T.amber,
  },
  APPROVED: {
    bg: T.successSoft,
    fg: T.success,
    dot: T.success,
    label: "Затверджено",
    accent: T.success,
  },
  SENT: {
    bg: T.accentPrimarySoft,
    fg: T.accentPrimary,
    dot: T.accentPrimary,
    label: "Надіслано",
    accent: T.accentPrimary,
  },
  CANCELLED: {
    bg: T.dangerSoft,
    fg: T.danger,
    dot: T.danger,
    label: "Скасовано",
    accent: T.danger,
  },
  ARCHIVED: {
    bg: T.panelSoft,
    fg: T.textMuted,
    dot: T.textMuted,
    label: "Архів",
    accent: T.borderSoft,
  },
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

function formatRelativeDate(d: Date): string {
  const now = Date.now();
  const ts = new Date(d).getTime();
  const diffSec = Math.round((now - ts) / 1000);
  if (diffSec < 60) return "щойно";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} хв тому`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)} год тому`;
  const days = Math.round(diffSec / 86400);
  if (days < 7) return `${days} ${plural(days, "день", "дні", "днів")} тому`;
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}
