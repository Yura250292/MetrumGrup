"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Award, Bell } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Bid = {
  id: string;
  counterparty: { id: string; name: string };
  status: string;
  submittedAt: string | null;
  currency: string;
  deliveryTermsDays: number | null;
  totalPrice: string | null;
  score: number | null;
  priceRank: number;
  deliveryRank: number;
};

type RfqDetail = {
  rfq: {
    id: string;
    internalNumber: string;
    status: string;
    deadline: string;
    purchaseRequest: { id: string; internalNumber: string };
  };
  bids: Bid[];
};

export default function RFQDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<RfqDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/rfqs/${id}/bids`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function award(bidId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rfqs/${id}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error || `HTTP ${res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rfqs/${id}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error || `HTTP ${res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="p-6 text-[13px]" style={{ color: T.textMuted }}>
        Завантаження…
      </div>
    );
  }
  const { rfq, bids } = data;
  const rfqOpen = rfq.status === "SENT" || rfq.status === "COLLECTING";

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link
        href="/admin-v2/procurement"
        className="inline-flex items-center gap-1.5 text-[12px]"
        style={{ color: T.textMuted }}
      >
        <ArrowLeft size={12} /> До закупівель
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: T.textPrimary }}>
            RFQ {rfq.internalNumber}
          </h1>
          <p className="text-[12px]" style={{ color: T.textMuted }}>
            Заявка{" "}
            <Link
              href={`/admin-v2/procurement/requests/${rfq.purchaseRequest.id}`}
              style={{ color: T.accentPrimary }}
            >
              {rfq.purchaseRequest.internalNumber}
            </Link>{" "}
            • Статус: {rfq.status} • Дедлайн:{" "}
            {new Date(rfq.deadline).toLocaleString("uk-UA")}
          </p>
        </div>
        {rfqOpen && (
          <button
            type="button"
            onClick={remind}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <Bell size={14} /> Нагадати всім
          </button>
        )}
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: T.danger }}>
          {error}
        </p>
      )}

      <section
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${T.borderSoft}` }}
      >
        <table className="w-full text-[13px]">
          <thead style={{ backgroundColor: T.panelElevated, color: T.textMuted }}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Постачальник</th>
              <th className="px-3 py-2 text-left font-semibold">Статус</th>
              <th className="px-3 py-2 text-right font-semibold">Ціна</th>
              <th className="px-3 py-2 text-right font-semibold">Доставка (дн)</th>
              <th className="px-3 py-2 text-right font-semibold">Скор</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {bids.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center" style={{ color: T.textMuted }}>
                  Пропозицій ще немає.
                </td>
              </tr>
            ) : (
              bids.map((b) => {
                const isWon = b.status === "WON";
                return (
                  <tr key={b.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-3 py-2">{b.counterparty.name}</td>
                    <td className="px-3 py-2">{b.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {b.totalPrice ? `${b.totalPrice} ${b.currency}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {b.deliveryTermsDays ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {b.score?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {rfqOpen && b.status === "SUBMITTED" && (
                        <button
                          type="button"
                          onClick={() => award(b.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold disabled:opacity-50"
                          style={{ backgroundColor: T.success, color: "#fff" }}
                        >
                          <Award size={12} /> Обрати
                        </button>
                      )}
                      {isWon && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold"
                          style={{ backgroundColor: `${T.success}1A`, color: T.success }}
                        >
                          ✓ Переможець
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
