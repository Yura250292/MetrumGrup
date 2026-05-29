import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ArrowUpRight,
  ChevronRight,
  Package,
  Plus,
  Search,
  Tag,
  TrendingUp,
  Wrench,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];

export default async function MaterialsV2Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const sp = await searchParams;
  const categoryFilter = sp.category ?? null;
  const filter = sp.filter ?? "active";

  const where: Record<string, unknown> = {};
  if (filter === "active") where.isActive = true;
  if (filter === "inactive") where.isActive = false;
  if (categoryFilter) where.category = categoryFilter;

  const [materials, totalCount, activeCount, categoriesAgg, avgPriceAgg] =
    await Promise.all([
      prisma.material.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          unit: true,
          basePrice: true,
          laborRate: true,
          markup: true,
          isActive: true,
          updatedAt: true,
          _count: {
            select: {
              estimateItems: true,
              inventoryItems: true,
              supplierMaterials: true,
              priceSnapshots: true,
            },
          },
        },
        orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
        take: 80,
      }),
      prisma.material.count(),
      prisma.material.count({ where: { isActive: true } }),
      prisma.material.groupBy({
        by: ["category"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 12,
      }),
      prisma.material.aggregate({
        where: { isActive: true },
        _avg: { basePrice: true },
        _sum: { basePrice: true },
      }),
    ]);

  const avgPrice = Number(avgPriceAgg._avg.basePrice ?? 0);
  const categoryUsageCount = categoriesAgg.length;

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Матеріали і ціни
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {activeCount}
            </span>{" "}
            активних · {categoryUsageCount} категорій · сер. ціна{" "}
            {formatCompact(avgPrice)} ₴
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
            href="/admin-v2/catalogs/materials"
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
            href="/admin-v2/catalogs/materials/new"
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
        activeCount={activeCount}
        inactiveCount={totalCount - activeCount}
        categoryUsageCount={categoryUsageCount}
        avgPrice={avgPrice}
      />

      <Toolbar
        filter={filter}
        activeCategory={categoryFilter}
        activeCount={activeCount}
        inactiveCount={totalCount - activeCount}
        totalCount={totalCount}
        categories={categoriesAgg.map((c) => ({
          name: c.category,
          count: c._count.id,
        }))}
      />

      <MaterialsList rows={materials} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  activeCount,
  inactiveCount,
  categoryUsageCount,
  avgPrice,
}: {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  categoryUsageCount: number;
  avgPrice: number;
}) {
  const cards = [
    {
      icon: Package,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "АКТИВНИХ",
      value: String(activeCount),
      sub: `з ${totalCount} всього`,
    },
    {
      icon: Tag,
      iconBg: T.skySoft,
      iconColor: T.sky,
      label: "КАТЕГОРІЙ",
      value: String(categoryUsageCount),
      sub: "у використанні",
    },
    {
      icon: TrendingUp,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "СЕР. ЦІНА",
      value: `${formatCompact(avgPrice)}`,
      sub: "₴ за од.",
    },
    {
      icon: Wrench,
      iconBg: inactiveCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: inactiveCount > 0 ? T.warning : T.success,
      label: "НЕАКТИВНІ",
      value: String(inactiveCount),
      sub: inactiveCount > 0 ? "видалено з UI" : "усі живі",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <article
          key={i}
          className="rounded-xl p-3.5"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
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
                style={{ color: T.textMuted }}
              >
                {c.label}
              </div>
              <div
                className="text-[22px] font-bold tabular-nums leading-none mt-0.5"
                style={{ color: T.textPrimary }}
              >
                {c.value}
              </div>
              <div className="text-[11px] mt-1 truncate" style={{ color: T.textMuted }}>
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
  filter,
  activeCategory,
  activeCount,
  inactiveCount,
  totalCount,
  categories,
}: {
  filter: string;
  activeCategory: string | null;
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
  categories: Array<{ name: string; count: number }>;
}) {
  const segments = [
    { key: "active", label: "Активні", count: activeCount, color: T.success },
    { key: "inactive", label: "Неактивні", count: inactiveCount, color: T.textMuted },
    { key: "all", label: "Всі", count: totalCount, color: T.textPrimary },
  ];
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 flex-1 min-w-[180px] max-w-xs"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={14} style={{ color: T.textMuted }} />
        <input
          type="search"
          placeholder="Пошук по SKU або назві…"
          className="bg-transparent border-0 outline-none flex-1 text-[13px]"
          style={{ color: T.textPrimary }}
          disabled
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s) => {
          const isActive = filter === s.key;
          const href = `/admin-v2/materials-v2?filter=${s.key}${activeCategory ? `&category=${encodeURIComponent(activeCategory)}` : ""}`;
          return (
            <Link
              key={s.key}
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
      <div className="flex flex-wrap items-center gap-1">
        {categories.slice(0, 8).map((c) => {
          const isActive = activeCategory === c.name;
          const href = isActive
            ? `/admin-v2/materials-v2?filter=${filter}`
            : `/admin-v2/materials-v2?filter=${filter}&category=${encodeURIComponent(c.name)}`;
          return (
            <Link
              key={c.name}
              href={href}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? T.accentPrimarySoft : T.panelSoft,
                color: isActive ? T.accentPrimary : T.textSecondary,
              }}
            >
              {c.name}
              <span className="opacity-60">{c.count}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type MaterialRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  basePrice: unknown;
  laborRate: unknown;
  markup: unknown;
  isActive: boolean;
  updatedAt: Date;
  _count: {
    estimateItems: number;
    inventoryItems: number;
    supplierMaterials: number;
    priceSnapshots: number;
  };
};

function MaterialsList({ rows }: { rows: MaterialRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header
        className="hidden md:grid grid-cols-[1fr_160px_140px_120px_120px_20px] gap-3 px-5 py-2.5 text-[10px] font-bold tracking-wider"
        style={{
          backgroundColor: T.panelSoft,
          color: T.textMuted,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        <span>НАЗВА · SKU</span>
        <span>КАТЕГОРІЯ · ОД.</span>
        <span className="text-right">ЦІНА</span>
        <span className="text-right">НАЦІНКА</span>
        <span>ВИКОРИСТАННЯ</span>
        <span />
      </header>
      <ul className="flex flex-col">
        {rows.length === 0 && (
          <li className="px-5 py-10 text-center text-[13px]" style={{ color: T.textMuted }}>
            Матеріалів за цим фільтром немає
          </li>
        )}
        {rows.map((r, idx) => {
          const price = Number(r.basePrice ?? 0);
          const markup = Number(r.markup ?? 0);
          return (
            <li key={r.id}>
              <Link
                href={`/admin-v2/catalogs/materials/${r.id}`}
                className="grid md:grid-cols-[1fr_160px_140px_120px_120px_20px] gap-3 px-5 py-3 transition hover:brightness-95"
                style={{
                  borderTop: idx > 0 ? `1px solid ${T.borderSoft}` : "none",
                  opacity: r.isActive ? 1 : 0.55,
                }}
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                    style={{ backgroundColor: T.accentPrimarySoft }}
                  >
                    <Package size={16} style={{ color: T.accentPrimary }} />
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
                      SKU: {r.sku}
                      {!r.isActive && " · архів"}
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                    style={{ backgroundColor: T.skySoft, color: T.sky }}
                  >
                    {r.category}
                  </span>
                  <div className="text-[11px] mt-1" style={{ color: T.textSecondary }}>
                    од. {r.unit}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-[14px] font-bold tabular-nums"
                    style={{ color: T.textPrimary }}
                  >
                    {formatCompact(price)} ₴
                  </div>
                </div>
                <div className="text-right">
                  {markup > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                      style={{ backgroundColor: T.successSoft, color: T.success }}
                    >
                      +{markup.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      —
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: T.textSecondary }}>
                    {r._count.estimateItems > 0 && (
                      <span>{r._count.estimateItems} в кошт.</span>
                    )}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                    {r._count.supplierMaterials > 0 &&
                      `${r._count.supplierMaterials} постач.`}
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

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toFixed(0);
}
