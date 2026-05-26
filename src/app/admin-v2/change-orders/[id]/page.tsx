"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import type { ChangeOrderStatus, Role } from "@prisma/client";
import { CostImpactBadge } from "@/components/CostImpactBadge";
import { COStatusBadge } from "../_components/StatusBadge";
import { TransitionBar } from "../_components/TransitionBar";
import { HistoryPanel, type Transition } from "../_components/HistoryPanel";

type CODetail = {
  id: string;
  number: string;
  type: string;
  status: ChangeOrderStatus;
  title: string;
  description: string;
  reasonFromClient: string | null;
  costImpact: number | null;
  scheduleImpactDays: number;
  pdfUrl: string | null;
  signedPdfUrl: string | null;
  requestedAt: string;
  requestedBy: { id: string; name: string | null };
  project: { id: string; title: string; address: string | null };
  items: Array<{
    id: string;
    description: string;
    unit: string;
    qty: number;
    unitPrice: number | null;
    totalPrice: number | null;
    sign: number;
    costCode: { code: string; name: string };
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    r2Url: string;
    fileSize: number;
    uploadedAt: string;
    uploadedBy: { id: string; name: string | null };
  }>;
  transitions: Transition[];
};

function fmtMoney(v: number | null): string {
  if (v === null) return "***";
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
  }).format(v);
}

export default function ChangeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<CODetail | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    setLoading(true);
    const [coRes, sessionRes] = await Promise.all([
      fetch(`/api/admin/change-orders/${id}`),
      fetch("/api/auth/session"),
    ]);
    if (coRes.ok) setData((await coRes.json()) as CODetail);
    if (sessionRes.ok) {
      const j = (await sessionRes.json()) as { user?: { role?: Role } };
      setRole(j.user?.role ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="p-6 text-zinc-500">Завантаження…</div>;
  if (!data) return <div className="p-6 text-zinc-500">Не знайдено.</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{data.number}</h1>
            <COStatusBadge status={data.status} />
            <CostImpactBadge amount={data.costImpact} />
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            <Link
              href={`/admin-v2/projects/${data.project.id}`}
              className="hover:underline"
            >
              {data.project.title}
            </Link>
            {data.project.address && <> · {data.project.address}</>}
            {" · Тип: "}
            {data.type}
            {data.scheduleImpactDays !== 0 && (
              <>
                {" · Зміна терміну: "}
                {data.scheduleImpactDays > 0 ? "+" : ""}
                {data.scheduleImpactDays} днів
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {data.pdfUrl && (
            <a
              href={data.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-sky-700 hover:underline"
            >
              📄 PDF
            </a>
          )}
          {data.signedPdfUrl && (
            <a
              href={data.signedPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-emerald-700 hover:underline"
            >
              📄 Підписаний PDF
            </a>
          )}
        </div>
      </div>

      {role && (
        <TransitionBar coId={data.id} status={data.status} role={role} onUpdated={load} />
      )}

      <section>
        <h2 className="text-lg font-medium mb-2">{data.title}</h2>
        <p className="text-sm text-zinc-700 whitespace-pre-wrap">{data.description}</p>
        {data.reasonFromClient && (
          <div className="mt-3 p-3 rounded-lg bg-sky-50 border border-sky-100">
            <div className="text-xs text-sky-700 mb-1">Обґрунтування замовника</div>
            <p className="text-sm text-sky-900 italic">{data.reasonFromClient}</p>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-500 mb-2">Зміни до кошторису</h3>
        <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs">
              <tr className="text-left">
                <th className="px-3 py-2 w-12">№</th>
                <th className="px-3 py-2 w-32">Шифр</th>
                <th className="px-3 py-2">Опис</th>
                <th className="px-3 py-2 w-20">Од.</th>
                <th className="px-3 py-2 w-24 text-right">К-сть</th>
                <th className="px-3 py-2 w-28 text-right">Ціна</th>
                <th className="px-3 py-2 w-32 text-right">Сума</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, idx) => (
                <tr key={it.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-500">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">{it.costCode.code}</td>
                  <td className="px-3 py-2">{it.description}</td>
                  <td className="px-3 py-2">{it.unit}</td>
                  <td className="px-3 py-2 text-right">{it.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(it.unitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(it.totalPrice)} ₴
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-500 mb-2">Файли</h3>
        {data.attachments.length === 0 ? (
          <div className="text-sm text-zinc-400">Немає вкладень.</div>
        ) : (
          <ul className="space-y-1">
            {data.attachments.map((a) => (
              <li key={a.id} className="text-sm">
                <a
                  href={a.r2Url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-700 hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="ml-2 text-xs text-zinc-400">
                  {(a.fileSize / 1024).toFixed(0)} КБ · {a.uploadedBy.name ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-500 mb-2">Історія</h3>
        <HistoryPanel transitions={data.transitions} />
      </section>
    </div>
  );
}
