"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChangeOrderStatus } from "@prisma/client";
import { COStatusBadge } from "./_components/StatusBadge";
import { CostImpactBadge } from "@/components/CostImpactBadge";
import { SectionTabs } from "../_components/section-tabs";

type CORow = {
  id: string;
  number: string;
  project: { id: string; title: string };
  type: string;
  status: ChangeOrderStatus;
  title: string;
  requestedAt: string;
  requestedBy: { id: string; name: string | null };
  costImpact: number | null;
  scheduleImpactDays: number;
  itemCount: number;
  attachmentCount: number;
};

const STATUS_OPTIONS: Array<{ value: "" | ChangeOrderStatus; label: string }> = [
  { value: "", label: "Усі статуси" },
  { value: "DRAFT", label: "Чернетки" },
  { value: "PENDING_PM", label: "Очікують PM" },
  { value: "PENDING_ADMIN", label: "Очікують SUPER_ADMIN" },
  { value: "PENDING_CLIENT", label: "Очікують клієнта" },
  { value: "APPROVED", label: "Затверджені" },
  { value: "REJECTED", label: "Відхилені" },
];

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(new Date(d));
}

export default function ChangeOrdersListPage() {
  const [rows, setRows] = useState<CORow[]>([]);
  const [status, setStatus] = useState<"" | ChangeOrderStatus>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const url = new URL("/api/admin/change-orders", window.location.origin);
        if (status) url.searchParams.set("status", status);
        const r = await fetch(url.toString());
        const j = (await r.json()) as { orders?: CORow[] };
        if (!cancelled) setRows(j.orders ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="p-6 space-y-4">
      <SectionTabs
        tabs={[
          { href: "/admin-v2/estimates", label: "Робочі", exact: true },
          { href: "/admin-v2/reference-estimates", label: "Довідкові" },
          { href: "/admin-v2/change-orders", label: "Дод. угоди" },
        ]}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Додаткові угоди</h1>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="px-3 py-1.5 rounded-md border border-zinc-300 text-sm bg-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs">
            <tr className="text-left">
              <th className="px-3 py-2">№</th>
              <th className="px-3 py-2">Проєкт</th>
              <th className="px-3 py-2">Назва</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Impact</th>
              <th className="px-3 py-2 text-right">Дні</th>
              <th className="px-3 py-2">Заявник</th>
              <th className="px-3 py-2">Створено</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-400">
                  Завантаження…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-400">
                  Нічого не знайдено.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/admin-v2/change-orders?d=changeOrder:${row.id}`}
                    className="text-sky-700 hover:underline"
                  >
                    {row.number}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin-v2/projects/${row.project.id}`}
                    className="text-zinc-700 hover:underline"
                  >
                    {row.project.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.title}</td>
                <td className="px-3 py-2">
                  <COStatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CostImpactBadge amount={row.costImpact} />
                </td>
                <td className="px-3 py-2 text-right text-xs text-zinc-500">
                  {row.scheduleImpactDays > 0 ? "+" : ""}
                  {row.scheduleImpactDays}
                </td>
                <td className="px-3 py-2 text-xs">{row.requestedBy.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {fmtDate(row.requestedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
