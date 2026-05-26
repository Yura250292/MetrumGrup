"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChangeOrderStatus } from "@prisma/client";
import { COStatusBadge } from "@/app/admin-v2/change-orders/_components/StatusBadge";
import { CostImpactBadge } from "@/components/CostImpactBadge";

type CORow = {
  id: string;
  number: string;
  type: string;
  status: ChangeOrderStatus;
  title: string;
  costImpact: number | null;
  scheduleImpactDays: number;
  requestedAt: string;
  requestedBy: { id: string; name: string | null };
  itemCount: number;
};

export function TabChangeOrders({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<CORow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/admin/change-orders?projectId=${projectId}`,
        );
        const j = (await r.json()) as { orders?: CORow[] };
        if (!cancelled) setRows(j.orders ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Додаткові угоди</h2>
        <Link
          href={`/admin-v2/change-orders/new?projectId=${projectId}`}
          className="px-3 py-1.5 rounded-md bg-sky-600 text-white text-sm font-medium"
        >
          + Створити
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs">
            <tr className="text-left">
              <th className="px-3 py-2">№</th>
              <th className="px-3 py-2">Назва</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Impact</th>
              <th className="px-3 py-2 text-right">Дні</th>
              <th className="px-3 py-2">Заявник</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                  Завантаження…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                  Ще немає дод. угод.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/admin-v2/change-orders/${row.id}`}
                    className="text-sky-700 hover:underline"
                  >
                    {row.number}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.title}</td>
                <td className="px-3 py-2">
                  <COStatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CostImpactBadge amount={row.costImpact} />
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {row.scheduleImpactDays > 0 ? "+" : ""}
                  {row.scheduleImpactDays}
                </td>
                <td className="px-3 py-2 text-xs">{row.requestedBy.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
