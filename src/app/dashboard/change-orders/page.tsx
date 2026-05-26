"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChangeOrderStatus } from "@prisma/client";
import { COStatusBadge } from "@/app/admin-v2/change-orders/_components/StatusBadge";

type CORow = {
  id: string;
  number: string;
  project: { id: string; title: string };
  type: string;
  title: string;
  description: string;
  status: ChangeOrderStatus;
  costImpact: number;
  scheduleImpactDays: number;
  requestedAt: string;
  requestedByName: string | null;
  itemCount: number;
  pdfUrl: string | null;
};

function fmtMoney(v: number): string {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(new Date(d));
}

export default function ClientCOListPage() {
  const [rows, setRows] = useState<CORow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/dashboard/change-orders");
        const j = (await r.json()) as { orders?: CORow[] };
        if (!cancelled) setRows(j.orders ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = rows.filter((r) => r.status === "PENDING_CLIENT");
  const others = rows.filter((r) => r.status !== "PENDING_CLIENT");

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Додаткові угоди</h1>

      {loading && <div className="text-zinc-500">Завантаження…</div>}

      {!loading && pending.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-amber-700 mb-2">
            Потребують вашого підтвердження ({pending.length})
          </h2>
          <ul className="space-y-3">
            {pending.map((r) => (
              <li
                key={r.id}
                className="p-4 rounded-lg border-2 border-amber-200 bg-amber-50"
              >
                <Link
                  href={`/dashboard/change-orders/${r.id}`}
                  className="block"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">{r.number} · {r.title}</span>
                    <COStatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-zinc-700">{r.project.title}</p>
                  <p className="text-sm mt-1">
                    Вартість зміни:{" "}
                    <strong>
                      {r.costImpact >= 0 ? "+" : "−"}
                      {fmtMoney(Math.abs(r.costImpact))} ₴
                    </strong>
                    {r.scheduleImpactDays !== 0 && (
                      <span className="text-zinc-500 ml-2">
                        · Зміна терміну: {r.scheduleImpactDays > 0 ? "+" : ""}
                        {r.scheduleImpactDays} днів
                      </span>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && (
        <section>
          <h2 className="text-sm font-medium text-zinc-500 mb-2">
            Усі угоди ({rows.length})
          </h2>
          <ul className="space-y-2">
            {others.map((r) => (
              <li
                key={r.id}
                className="p-3 rounded-lg border border-zinc-200 bg-white"
              >
                <Link
                  href={`/dashboard/change-orders/${r.id}`}
                  className="flex justify-between items-center"
                >
                  <div>
                    <div className="font-mono text-xs text-zinc-500">
                      {r.number}
                    </div>
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-zinc-500">
                      {r.project.title} · {fmtDate(r.requestedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">
                      {r.costImpact >= 0 ? "+" : "−"}
                      {fmtMoney(Math.abs(r.costImpact))} ₴
                    </span>
                    <COStatusBadge status={r.status} />
                  </div>
                </Link>
              </li>
            ))}
            {others.length === 0 && pending.length === 0 && (
              <li className="text-sm text-zinc-400">Немає дод. угод.</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
