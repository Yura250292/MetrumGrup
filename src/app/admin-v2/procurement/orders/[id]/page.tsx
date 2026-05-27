"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type PO = {
  id: string;
  internalNumber: string;
  status: string;
  totalAmount?: string | null;
  currency: string;
  actualDeliveredAt: string | null;
  counterparty: { id: string; name: string; email: string | null } | null;
  project: { id: string; title: string } | null;
};

export default function PODetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [po, setPO] = useState<PO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveredAt, setDeliveredAt] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/purchase-orders/${id}`);
    if (res.ok) setPO(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelivery(fully: boolean) {
    if (!deliveredAt) {
      setError("Вкажіть дату поставки");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/purchase-orders/${id}/confirm-delivery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deliveredAt: new Date(deliveredAt).toISOString(),
            fullyDelivered: fully,
            notes: notes || undefined,
          }),
        },
      );
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

  if (!po) {
    return (
      <div className="p-6 text-[13px]" style={{ color: T.textMuted }}>
        Завантаження…
      </div>
    );
  }

  const canConfirm =
    po.status !== "CANCELLED" && po.status !== "DELIVERED";

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link
        href="/admin-v2/procurement"
        className="inline-flex items-center gap-1.5 text-[12px]"
        style={{ color: T.textMuted }}
      >
        <ArrowLeft size={12} /> До закупівель
      </Link>

      <div>
        <h1 className="text-[20px] font-bold" style={{ color: T.textPrimary }}>
          PO {po.internalNumber}
        </h1>
        <p className="text-[12px]" style={{ color: T.textMuted }}>
          {po.counterparty?.name ?? "—"} • {po.project?.title ?? "Без проєкту"} • Статус: {po.status}
        </p>
      </div>

      <section
        className="rounded-2xl p-4 flex flex-col gap-1 text-[13px]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div>
          <span style={{ color: T.textMuted }}>Сума: </span>
          <strong>
            {po.totalAmount ? `${po.totalAmount} ${po.currency}` : "—"}
          </strong>
        </div>
        <div>
          <span style={{ color: T.textMuted }}>Фактична поставка: </span>
          {po.actualDeliveredAt
            ? new Date(po.actualDeliveredAt).toLocaleDateString("uk-UA")
            : "ще не зафіксована"}
        </div>
      </section>

      {canConfirm && (
        <section
          className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <h2 className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            Підтвердити поставку
          </h2>
          <label className="text-[12px]" style={{ color: T.textMuted }}>
            Дата поставки
            <input
              type="date"
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
              className="mt-1 block w-full rounded-md px-2 py-1.5 text-[13px]"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
          </label>
          <label className="text-[12px]" style={{ color: T.textMuted }}>
            Примітки
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="(опціонально)"
              className="mt-1 block w-full rounded-md px-2 py-1.5 text-[13px]"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
          </label>
          {error && (
            <p className="text-[12px]" style={{ color: T.danger }}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => confirmDelivery(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: T.success, color: "#fff" }}
            >
              <CheckCircle2 size={14} /> Доставлено повністю
            </button>
            <button
              type="button"
              onClick={() => confirmDelivery(false)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            >
              Частково доставлено
            </button>
          </div>
          <p className="text-[11px]" style={{ color: T.textMuted }}>
            При повній поставці автоматично створюється FinanceEntry (FACT, EXPENSE) у фінансах.
          </p>
        </section>
      )}
    </div>
  );
}
