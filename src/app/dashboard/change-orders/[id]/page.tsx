"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import type { ChangeOrderStatus } from "@prisma/client";
import { COStatusBadge } from "@/app/admin-v2/change-orders/_components/StatusBadge";

type CODetail = {
  id: string;
  number: string;
  status: ChangeOrderStatus;
  type: string;
  title: string;
  description: string;
  reasonFromClient: string | null;
  costImpact: number;
  scheduleImpactDays: number;
  pdfUrl: string | null;
  project: { id: string; title: string };
  items: Array<{
    id: string;
    description: string;
    unit: string;
    qty: number;
    unitPrice: number;
    totalPrice: number;
    costCode: { code: string; name: string };
  }>;
};

function fmt(v: number): string {
  return new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2 }).format(v);
}

export default function ClientCODetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<CODetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/dashboard/change-orders`);
        const j = (await r.json()) as { orders?: CODetail[] };
        const found = j.orders?.find((o) => o.id === id) ?? null;
        if (!cancelled) setData((found as unknown as CODetail) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function approve(): Promise<void> {
    if (!confirm("Підтвердити дод. угоду? Це фіксує умови та сум(у/и) у бюджет проєкту."))
      return;
    setActing("approve");
    try {
      const res = await fetch(`/api/dashboard/change-orders/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Помилка: ${j.error ?? res.statusText}`);
        return;
      }
      router.push("/dashboard/change-orders");
    } finally {
      setActing(null);
    }
  }

  async function reject(): Promise<void> {
    setActing("reject");
    try {
      const res = await fetch(`/api/dashboard/change-orders/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Помилка: ${j.error ?? res.statusText}`);
        return;
      }
      setRejectModal(false);
      router.push("/dashboard/change-orders");
    } finally {
      setActing(null);
    }
  }

  if (loading) return <div className="p-6 text-zinc-500">Завантаження…</div>;
  if (!data) return <div className="p-6 text-zinc-500">Не знайдено.</div>;

  const canAct = data.status === "PENDING_CLIENT";

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{data.number}</h1>
          <COStatusBadge status={data.status} />
        </div>
        <p className="text-sm text-zinc-500 mt-1">{data.project.title}</p>
      </div>

      <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
        <h2 className="font-medium mb-2">{data.title}</h2>
        <p className="text-sm whitespace-pre-wrap">{data.description}</p>
        {data.reasonFromClient && (
          <p className="text-sm mt-3 italic text-sky-800">
            «{data.reasonFromClient}»
          </p>
        )}
      </div>

      {data.items && data.items.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-zinc-500 mb-2">Позиції</h3>
          <ul className="space-y-1.5">
            {data.items.map((it) => (
              <li
                key={it.id}
                className="flex justify-between text-sm border-b border-zinc-100 py-1.5"
              >
                <span>
                  {it.description}{" "}
                  <span className="text-zinc-400 text-xs">
                    · {it.qty} {it.unit}
                  </span>
                </span>
                <span className="tabular-nums">{fmt(it.totalPrice)} ₴</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="p-4 rounded-lg border border-sky-200 bg-sky-50 space-y-2">
        <div className="flex justify-between text-base">
          <span>Зміна вартості:</span>
          <strong className="tabular-nums">
            {data.costImpact >= 0 ? "+" : "−"}
            {fmt(Math.abs(data.costImpact))} ₴
          </strong>
        </div>
        {data.scheduleImpactDays !== 0 && (
          <div className="flex justify-between text-sm text-zinc-700">
            <span>Зміна терміну:</span>
            <span>
              {data.scheduleImpactDays > 0 ? "+" : ""}
              {data.scheduleImpactDays} днів
            </span>
          </div>
        )}
      </div>

      {data.pdfUrl && (
        <a
          href={data.pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-sky-700 hover:underline inline-block"
        >
          📄 Завантажити PDF
        </a>
      )}

      {canAct && (
        <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200">
          <button
            type="button"
            onClick={() => setRejectModal(true)}
            disabled={acting !== null}
            className="px-4 py-2 rounded-md border border-rose-300 text-rose-700 text-sm font-medium disabled:opacity-60"
          >
            Відхилити
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={acting !== null}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-60"
          >
            {acting === "approve" ? "..." : "Підтвердити"}
          </button>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-[440px] space-y-3">
            <h3 className="font-semibold">Причина відмови</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full h-24 px-2 py-1.5 rounded border border-zinc-300 text-sm"
              placeholder="Що не так?"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModal(false)}
                className="px-3 py-1.5 text-sm rounded border border-zinc-300"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={acting === "reject"}
                className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white"
              >
                {acting === "reject" ? "..." : "Відхилити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
