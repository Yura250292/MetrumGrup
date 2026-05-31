import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Building,
  ChevronRight,
  Mail,
  Package,
  Phone,
  Plus,
  Receipt,
  Search,
  Star,
  TrendingUp,
  Truck,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

export default async function CounterpartiesV2Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const sp = await searchParams;
  const filter = sp.filter ?? null;
  const typeFilter = sp.type ?? null;

  const where: Record<string, unknown> = {};
  if (typeFilter) where.type = typeFilter;
  if (filter === "with-debt") {
    where.roles = { has: "SUPPLIER" };
  }

  const [counterparties, totalCount, suppliersCount, clientsCount, contractorsCount, materialsTotal] =
    await Promise.all([
      prisma.counterparty.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          roles: true,
          edrpou: true,
          phone: true,
          email: true,
          rating: true,
          isActive: true,
          updatedAt: true,
          _count: {
            select: {
              supplierMaterials: true,
              supplierPayments: true,
              receiptScans: true,
              financeEntries: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 60,
      }),
      prisma.counterparty.count(),
      prisma.counterparty.count({ where: { roles: { has: "SUPPLIER" } } }),
      prisma.counterparty.count({ where: { roles: { has: "CLIENT" } } }),
      prisma.counterparty.count({ where: { roles: { has: "CONTRACTOR" } } }),
      prisma.supplierMaterial.count(),
    ]);

  // Price-trend signal: pricing analytics not exposed in current schema as
  // a per-supplier flag; placeholder until SupplierMaterialPriceHistory
  // aggregator is wired (Phase 4+). Showing 0 keeps the badge neutral.
  const counterpartiesWithIncreases = 0;

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Постачальники
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {totalCount}
            </span>{" "}
            контрагентів · {suppliersCount} постачальників · {materialsTotal} матеріалів у KB
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
            href="/admin-v2/counterparties"
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
          <Link
            href="/admin-v2/counterparties/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
          >
            <Plus size={14} />
            Додати
          </Link>
        </div>
      </header>

      <KpiStrip
        totalCount={totalCount}
        suppliersCount={suppliersCount}
        clientsCount={clientsCount}
        contractorsCount={contractorsCount}
        priceIncreasesCount={counterpartiesWithIncreases}
        materialsTotal={materialsTotal}
      />

      <Toolbar
        activeFilter={filter}
        activeType={typeFilter}
        suppliersCount={suppliersCount}
        priceIncreasesCount={counterpartiesWithIncreases}
        totalCount={totalCount}
      />

      <CounterpartyTable rows={counterparties} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  suppliersCount,
  clientsCount,
  contractorsCount,
  priceIncreasesCount,
  materialsTotal,
}: {
  totalCount: number;
  suppliersCount: number;
  clientsCount: number;
  contractorsCount: number;
  priceIncreasesCount: number;
  materialsTotal: number;
}) {
  const cards: Array<{
    icon: typeof Truck;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    dark?: boolean;
  }> = [
    {
      icon: Truck,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ПОСТАЧАЛЬНИКІВ",
      value: String(suppliersCount),
      sub: `з ${totalCount} всього`,
    },
    {
      icon: priceIncreasesCount > 0 ? AlertTriangle : Package,
      iconBg: priceIncreasesCount > 0 ? T.dangerSoft : T.successSoft,
      iconColor: priceIncreasesCount > 0 ? T.danger : T.success,
      label: "ЦІНИ ↑",
      value: String(priceIncreasesCount),
      sub: priceIncreasesCount > 0 ? "за тиждень" : "стабільно",
      dark: priceIncreasesCount > 0,
    },
    {
      icon: Package,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "МАТЕРІАЛІВ У KB",
      value: String(materialsTotal),
      sub: "у каталозі",
    },
    {
      icon: Briefcase,
      iconBg: T.skySoft,
      iconColor: T.sky,
      label: "КЛІЄНТИ",
      value: String(clientsCount),
      sub: contractorsCount > 0 ? `+ ${contractorsCount} підрядників` : "контрагенти",
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
              style={{
                backgroundColor: c.dark ? "#FFFFFF" : c.iconBg,
              }}
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
  activeFilter,
  activeType,
  suppliersCount,
  priceIncreasesCount,
  totalCount,
}: {
  activeFilter: string | null;
  activeType: string | null;
  suppliersCount: number;
  priceIncreasesCount: number;
  totalCount: number;
}) {
  const segments: Array<{
    key: string | null;
    label: string;
    count: number;
    href: string;
    color: string;
  }> = [
    {
      key: null,
      label: "Усі",
      count: totalCount,
      href: "/admin-v2/counterparties-v2",
      color: T.textPrimary,
    },
    {
      key: "with-debt",
      label: "Постачальники",
      count: suppliersCount,
      href: "/admin-v2/counterparties-v2?filter=with-debt",
      color: T.accentPrimary,
    },
  ];
  const types: Array<{ key: string; label: string }> = [
    { key: "LEGAL", label: "Юр.особа" },
    { key: "FOP", label: "ФОП" },
    { key: "INDIVIDUAL", label: "Фіз.особа" },
  ];
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
          placeholder="Пошук за назвою або ЄДРПОУ…"
          className="bg-transparent border-0 outline-none flex-1 text-[13px]"
          style={{ color: T.textPrimary }}
          disabled
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s, i) => {
          const isActive = activeFilter === s.key && !activeType;
          return (
            <Link
              key={i}
              href={s.href}
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
              <span className="tabular-nums opacity-70">{s.count}</span>
            </Link>
          );
        })}
        {priceIncreasesCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"
            style={{ backgroundColor: T.dangerSoft, color: T.danger }}
          >
            <TrendingUp size={12} />
            Ціни ↑ {priceIncreasesCount}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {types.map((t) => {
          const isActive = activeType === t.key;
          const href = isActive
            ? "/admin-v2/counterparties-v2"
            : `/admin-v2/counterparties-v2?type=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? T.accentPrimarySoft : T.panelSoft,
                color: isActive ? T.accentPrimary : T.textSecondary,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type CpRow = {
  id: string;
  name: string;
  type: string;
  roles: string[];
  edrpou: string | null;
  phone: string | null;
  email: string | null;
  rating: unknown;
  isActive: boolean;
  updatedAt: Date;
  _count: {
    supplierMaterials: number;
    supplierPayments: number;
    receiptScans: number;
    financeEntries: number;
  };
};

function CounterpartyTable({ rows }: { rows: CpRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header
        className="hidden md:grid grid-cols-[1fr_120px_160px_120px_120px_20px] gap-3 px-5 py-2.5 text-[10px] font-bold tracking-wider"
        style={{
          backgroundColor: T.panelSoft,
          color: T.textMuted,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        <span>НАЗВА · ЄДРПОУ</span>
        <span>ТИП / РОЛЬ</span>
        <span>КОНТАКТИ</span>
        <span className="text-right">МАТЕРІАЛІВ</span>
        <span className="text-right">РЕЙТИНГ</span>
        <span />
      </header>
      <ul className="flex flex-col">
        {rows.length === 0 && (
          <li
            className="px-5 py-10 text-center text-[13px]"
            style={{ color: T.textMuted }}
          >
            Контрагентів за цим фільтром немає
          </li>
        )}
        {rows.map((r, idx) => {
          const typeColor = TYPE_COLORS[r.type] ?? TYPE_COLORS.LEGAL;
          const primaryRole = r.roles[0] ?? null;
          const roleLabel =
            r.roles.length > 0
              ? r.roles.map((rl) => ROLE_LABELS[rl] ?? rl).join(", ")
              : "—";
          void primaryRole;
          const ratingNum = r.rating !== null ? Number(r.rating) : null;
          return (
            <li key={r.id}>
              <Link
                href={`/admin-v2/counterparties/${r.id}`}
                className="grid md:grid-cols-[1fr_120px_160px_120px_120px_20px] gap-3 px-5 py-3 transition hover:brightness-95"
                style={{
                  borderTop: idx > 0 ? `1px solid ${T.borderSoft}` : "none",
                  opacity: r.isActive ? 1 : 0.5,
                }}
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                    style={{ backgroundColor: typeColor.bg }}
                  >
                    <Building size={16} style={{ color: typeColor.fg }} />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-[13px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {r.name}
                    </div>
                    <div
                      className="text-[11px] mt-0.5 truncate tabular-nums"
                      style={{ color: T.textMuted }}
                    >
                      {r.edrpou ? `ЄДРПОУ ${r.edrpou}` : "ЄДРПОУ —"}
                      {!r.isActive && " · неактивний"}
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                    style={{ backgroundColor: typeColor.bg, color: typeColor.fg }}
                  >
                    {r.type}
                  </span>
                  <div
                    className="text-[11px] mt-1 truncate"
                    style={{ color: T.textSecondary }}
                  >
                    {roleLabel}
                  </div>
                </div>
                <div className="min-w-0 flex flex-col gap-0.5">
                  {r.phone && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] truncate"
                      style={{ color: T.textSecondary }}
                    >
                      <Phone size={10} style={{ color: T.textMuted }} />
                      {r.phone}
                    </span>
                  )}
                  {r.email && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] truncate"
                      style={{ color: T.textSecondary }}
                    >
                      <Mail size={10} style={{ color: T.textMuted }} />
                      {r.email}
                    </span>
                  )}
                  {!r.phone && !r.email && (
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      без контактів
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div
                    className="text-[14px] font-bold tabular-nums"
                    style={{ color: T.textPrimary }}
                  >
                    {r._count.supplierMaterials}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: T.textMuted }}
                  >
                    {r._count.receiptScans} {plural(r._count.receiptScans, "чек", "чеки", "чеків")}
                  </div>
                </div>
                <div className="text-right">
                  <RatingStars rating={ratingNum} />
                  <div className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                    {r._count.financeEntries} платежів
                  </div>
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

function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) {
    return (
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        —
      </span>
    );
  }
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          style={{
            color: n <= full ? T.amber : T.borderSoft,
            fill: n <= full ? T.amber : "transparent",
          }}
        />
      ))}
    </span>
  );
}

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  LEGAL: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  FOP: { bg: T.successSoft, fg: T.success },
  INDIVIDUAL: { bg: T.warningSoft, fg: T.warning },
};

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Клієнт",
  SUPPLIER: "Постачальник",
  CONTRACTOR: "Підрядник",
  PARTNER: "Партнер",
  OTHER: "Інше",
};

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
