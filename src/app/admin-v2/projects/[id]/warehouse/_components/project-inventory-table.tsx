"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MinusCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { WriteOffModal } from "./write-off-modal";

export interface InventoryRow {
  id: string;
  warehouseName: string;
  materialName: string;
  materialSku: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  basePrice: number;
  lastRestockedAt: string | null;
}

interface Props {
  rows: InventoryRow[];
  projectId: string;
}

export function ProjectInventoryTable({ rows, projectId }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<InventoryRow | null>(null);

  return (
    <>
      <section
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: T.panelSoft, color: T.textMuted }}>
              <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Матеріал</th>
              <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Категорія</th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-wider">Залишок</th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-wider">Ціна</th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-wider">Вартість</th>
              <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Останнє надходження</th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-wider">Дія</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const low = r.quantity <= r.minQuantity;
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                  <td className="px-4 py-3" style={{ color: T.textPrimary }}>
                    <div className="flex flex-col">
                      <span>{r.materialName}</span>
                      <span className="text-xs" style={{ color: T.textMuted }}>
                        {r.materialSku} · {r.warehouseName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: T.textSecondary }}>
                    {r.category}
                  </td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: low ? T.warning : T.textPrimary }}>
                    <span className="inline-flex items-center gap-1.5">
                      {low && <AlertTriangle size={14} />}
                      {r.quantity} {r.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: T.textSecondary }}>
                    {r.basePrice.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                  </td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: T.textPrimary }}>
                    {(r.basePrice * r.quantity).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                  </td>
                  <td className="px-4 py-3" style={{ color: T.textMuted }}>
                    {r.lastRestockedAt
                      ? new Date(r.lastRestockedAt).toLocaleDateString("uk-UA")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={r.quantity <= 0}
                      onClick={() => setTarget(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-30"
                      style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                    >
                      <MinusCircle size={12} /> Списати
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {target && (
        <WriteOffModal
          item={target}
          projectId={projectId}
          onClose={() => setTarget(null)}
          onSuccess={() => {
            setTarget(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
