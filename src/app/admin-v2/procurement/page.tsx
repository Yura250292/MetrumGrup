"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, FileText, Package, ArrowRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type PR = {
  id: string;
  internalNumber: string;
  status: string;
  project: { id: string; title: string } | null;
  itemCount: number;
  rfqCount: number;
  createdAt: string;
};

type PO = {
  id: string;
  internalNumber: string;
  status: string;
  totalAmount: string | null;
  currency: string;
  counterparty?: { id: string; name: string } | null;
  project?: { id: string; title: string } | null;
  createdAt: string;
};

type Tab = "requests" | "orders";

const PR_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Чернетка",
  RFQ_SENT: "RFQ розіслано",
  BIDS_COLLECTED: "Пропозиції зібрані",
  PO_ISSUED: "PO випущено",
  CLOSED: "Закрито",
  CANCELLED: "Скасовано",
};

const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Чернетка",
  SENT: "Відправлено",
  CONFIRMED: "Підтверджено",
  PARTIALLY_DELIVERED: "Частково доставлено",
  DELIVERED: "Доставлено",
  CANCELLED: "Скасовано",
};

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(d));
}

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const tone =
    status === "DRAFT"
      ? T.textMuted
      : status === "DELIVERED" || status === "CLOSED"
        ? T.success
        : status === "CANCELLED"
          ? T.danger
          : T.accentPrimary;
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${tone}1A`, color: tone }}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default function ProcurementOverview() {
  const [tab, setTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<PR[]>([]);
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url =
      tab === "requests"
        ? "/api/admin/purchase-requests?limit=100"
        : "/api/admin/purchase-orders?limit=100";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (tab === "requests") setRequests(data.requests ?? []);
        else setOrders(data.orders ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Помилка"))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center justify-center rounded-xl"
          style={{ width: 36, height: 36, backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          <ClipboardList size={18} />
        </span>
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: T.textPrimary }}>
            Закупівлі
          </h1>
          <p className="text-[13px]" style={{ color: T.textMuted }}>
            Заявки на закупівлю, тендери (RFQ) та замовлення постачальникам (PO)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {([
          { id: "requests" as const, label: "Заявки + RFQ", icon: FileText },
          { id: "orders" as const, label: "PO (замовлення)", icon: Package },
        ]).map((t) => {
          const Active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors"
              style={{
                backgroundColor: Active ? T.panelElevated : "transparent",
                color: Active ? T.textPrimary : T.textMuted,
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="text-[12px]" style={{ color: T.textMuted }}>
          Завантаження…
        </div>
      )}
      {error && (
        <div className="text-[12px]" style={{ color: T.danger }}>
          Помилка: {error}
        </div>
      )}

      {!loading && !error && tab === "requests" && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.borderSoft}` }}>
          <table className="w-full text-[13px]">
            <thead style={{ backgroundColor: T.panelElevated, color: T.textMuted }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">№</th>
                <th className="px-3 py-2 text-left font-semibold">Проєкт</th>
                <th className="px-3 py-2 text-left font-semibold">Статус</th>
                <th className="px-3 py-2 text-right font-semibold">Позиції</th>
                <th className="px-3 py-2 text-right font-semibold">RFQs</th>
                <th className="px-3 py-2 text-left font-semibold">Створено</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center" style={{ color: T.textMuted }}>
                    Заявок на закупівлю немає.
                  </td>
                </tr>
              ) : (
                requests.map((pr) => (
                  <tr key={pr.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-3 py-2 font-mono">{pr.internalNumber}</td>
                    <td className="px-3 py-2">{pr.project?.title ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={pr.status} labels={PR_STATUS_LABEL} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{pr.itemCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pr.rfqCount}</td>
                    <td className="px-3 py-2" style={{ color: T.textMuted }}>
                      {fmtDate(pr.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin-v2/procurement/requests/${pr.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium"
                        style={{ color: T.accentPrimary }}
                      >
                        Відкрити <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && tab === "orders" && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.borderSoft}` }}>
          <table className="w-full text-[13px]">
            <thead style={{ backgroundColor: T.panelElevated, color: T.textMuted }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">№</th>
                <th className="px-3 py-2 text-left font-semibold">Постачальник</th>
                <th className="px-3 py-2 text-left font-semibold">Проєкт</th>
                <th className="px-3 py-2 text-left font-semibold">Статус</th>
                <th className="px-3 py-2 text-right font-semibold">Сума</th>
                <th className="px-3 py-2 text-left font-semibold">Створено</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center" style={{ color: T.textMuted }}>
                    Замовлень немає.
                  </td>
                </tr>
              ) : (
                orders.map((po) => (
                  <tr key={po.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-3 py-2 font-mono">{po.internalNumber}</td>
                    <td className="px-3 py-2">{po.counterparty?.name ?? "—"}</td>
                    <td className="px-3 py-2">{po.project?.title ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={po.status} labels={PO_STATUS_LABEL} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {po.totalAmount ? `${po.totalAmount} ${po.currency}` : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: T.textMuted }}>
                      {fmtDate(po.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin-v2/procurement/orders/${po.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium"
                        style={{ color: T.accentPrimary }}
                      >
                        Відкрити <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
