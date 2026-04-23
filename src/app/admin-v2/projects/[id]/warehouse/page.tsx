import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { Warehouse as WarehouseIcon, ArrowLeft, ScanLine } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ProjectInventoryTable, type InventoryRow } from "./_components/project-inventory-table";

export const dynamic = "force-dynamic";

export default async function AdminV2ProjectWarehousePage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id: projectId } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) notFound();

  const warehouses = await prisma.warehouse.findMany({
    where: { projectId, isActive: true },
    include: {
      inventoryItems: {
        include: {
          material: { select: { id: true, name: true, sku: true, unit: true, basePrice: true, category: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  const rows: InventoryRow[] = warehouses.flatMap((wh) =>
    wh.inventoryItems.map((inv) => ({
      id: inv.id,
      warehouseName: wh.name,
      materialName: inv.material.name,
      materialSku: inv.material.sku,
      category: inv.material.category,
      unit: inv.material.unit,
      quantity: Number(inv.quantity),
      minQuantity: Number(inv.minQuantity),
      basePrice: Number(inv.material.basePrice),
      lastRestockedAt: inv.lastRestockedAt?.toISOString() ?? null,
    })),
  );

  const totalValue = rows.reduce((sum, r) => sum + r.quantity * r.basePrice, 0);
  const lowStock = rows.filter((r) => r.quantity <= r.minQuantity).length;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin-v2/projects/${projectId}`}
        className="inline-flex items-center gap-1.5 text-sm"
        style={{ color: T.textMuted }}
      >
        <ArrowLeft size={14} /> До проєкту
      </Link>

      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СКЛАД ПРОЄКТУ
        </span>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            {project.title}
          </h1>
          <Link
            href="/admin-v2/receipts/scan"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{ backgroundColor: T.accentPrimary, color: "white" }}
          >
            <ScanLine size={16} /> Сканувати накладну
          </Link>
        </div>
        <p className="text-sm" style={{ color: T.textSecondary }}>
          {warehouses.length === 0
            ? "Склад для цього проєкту ще не створений — створиться автоматично при першому скані"
            : `${rows.length} позицій · ${lowStock} потребують поповнення`}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard label="ПОЗИЦІЙ" value={String(rows.length)} sub="на складі проєкту" />
        <KpiCard
          label="МАЛО НА СКЛАДІ"
          value={String(lowStock)}
          sub="потребують поповнення"
          accent={lowStock > 0 ? T.warning : T.success}
        />
        <KpiCard
          label="ЗАГАЛЬНА ВАРТІСТЬ"
          value={formatCurrency(totalValue)}
          sub="за залишками"
          accent={T.accentPrimary}
        />
      </section>

      {warehouses.length === 0 ? (
        <EmptyState />
      ) : (
        <ProjectInventoryTable rows={rows} projectId={projectId} />
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl p-4 sm:p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-2xl font-bold" style={{ color: accent ?? T.textPrimary }}>
        {value}
      </span>
      <span className="text-xs" style={{ color: T.textMuted }}>
        {sub}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
      >
        <WarehouseIcon size={20} />
      </div>
      <p className="text-base font-medium" style={{ color: T.textPrimary }}>
        Склад порожній
      </p>
      <p className="text-sm" style={{ color: T.textMuted }}>
        Просканiruйте першу накладну — склад створиться автоматично
      </p>
    </div>
  );
}
