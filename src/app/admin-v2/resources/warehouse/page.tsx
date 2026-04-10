import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { Warehouse, AlertTriangle, Package } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2WarehousePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const inventoryItems = await prisma.inventoryItem.findMany({
    include: {
      material: { select: { name: true, sku: true, unit: true, basePrice: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { material: { name: "asc" } },
  });

  const lowStock = inventoryItems.filter(
    (item) => Number(item.quantity) <= Number(item.minQuantity)
  );

  const totalValue = inventoryItems.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.material.basePrice),
    0
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СКЛАДСЬКИЙ ОБЛІК
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Склад
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          {inventoryItems.length} позицій · {lowStock.length} потребують закупівлі
        </p>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="ПОЗИЦІЙ" value={String(inventoryItems.length)} sub="на складах" />
        <KpiCard
          label="МАЛО НА СКЛАДІ"
          value={String(lowStock.length)}
          sub="потребують поповнення"
          accent={lowStock.length > 0 ? T.warning : T.success}
        />
        <KpiCard
          label="ЗАГАЛЬНА ВАРТІСТЬ"
          value={formatCurrency(totalValue)}
          sub="за залишками"
          accent={T.accentPrimary}
        />
      </section>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <section
          className="rounded-2xl p-5"
          style={{ backgroundColor: T.warningSoft, border: `1px solid ${T.warning}` }}
        >
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={18} style={{ color: T.warning }} />
            <span className="text-base font-bold" style={{ color: T.warning }}>
              Потрібна закупівля ({lowStock.length})
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {lowStock.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl px-4 py-2.5"
                style={{ backgroundColor: T.panel }}
              >
                <span className="text-[13px]" style={{ color: T.textPrimary }}>
                  {item.material.name}{" "}
                  <span style={{ color: T.textMuted }}>({item.material.sku})</span>
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: T.warningSoft, color: T.warning }}
                >
                  {Number(item.quantity)} / {Number(item.minQuantity)} {item.material.unit}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Table */}
      {inventoryItems.length === 0 ? (
        <EmptyWarehouse />
      ) : (
        <section
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr style={{ backgroundColor: T.panelSoft }}>
                  <Th>МАТЕРІАЛ</Th>
                  <Th>СКЛАД</Th>
                  <Th align="right">ЗАЛИШОК</Th>
                  <Th align="right">МІНІМУМ</Th>
                  <Th align="right">ВАРТІСТЬ</Th>
                  <Th>СТАТУС</Th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map((item, i) => {
                  const isLow = Number(item.quantity) <= Number(item.minQuantity);
                  return (
                    <tr
                      key={item.id}
                      style={{
                        backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                        borderTop: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <td className="px-4 py-3.5">
                        <div className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                          {item.material.name}
                        </div>
                        <div className="text-[10px]" style={{ color: T.textMuted }}>
                          {item.material.sku}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[12px]" style={{ color: T.textSecondary }}>
                        {item.warehouse.name}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right text-[13px] font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {Number(item.quantity)} {item.material.unit}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right text-[12px]"
                        style={{ color: T.textMuted }}
                      >
                        {Number(item.minQuantity)} {item.material.unit}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right text-[13px]"
                        style={{ color: T.textSecondary }}
                      >
                        {formatCurrency(Number(item.quantity) * Number(item.material.basePrice))}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            backgroundColor: isLow ? T.warningSoft : T.successSoft,
                            color: isLow ? T.warning : T.success,
                          }}
                        >
                          {isLow ? "Мало" : "В нормі"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = T.textPrimary,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-2xl font-bold mt-1" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        {sub}
      </span>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-4 py-3 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
  );
}

function EmptyWarehouse() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <Package size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Склад порожній
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Матеріали зʼявляться після створення складів та додавання інвентарю
      </span>
    </div>
  );
}
