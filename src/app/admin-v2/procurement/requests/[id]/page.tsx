"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type PR = {
  id: string;
  internalNumber: string;
  status: string;
  neededBy: string | null;
  estimatedBudget: string | null;
  notes: string | null;
  project: { id: string; title: string } | null;
  requestedBy: { id: string; name: string | null } | null;
  items: {
    id: string;
    description: string;
    qty: string;
    unit: string;
  }[];
  rfqs: {
    id: string;
    internalNumber: string;
    status: string;
    deadline: string;
    recipientCount: number;
    bidCount: number;
  }[];
};

type Supplier = { id: string; name: string; email: string | null };

export default function PRDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [pr, setPR] = useState<PR | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/purchase-requests/${id}`);
    if (res.ok) setPR(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/counterparties?role=SUPPLIER&limit=200")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSuppliers(d.counterparties ?? d.data ?? []))
      .catch(() => setSuppliers([]));
  }, []);

  async function handleSendRfq() {
    if (selected.size === 0) {
      setError("Виберіть хоча б одного постачальника");
      return;
    }
    if (!deadline) {
      setError("Вкажіть дедлайн");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/purchase-requests/${id}/send-rfq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartyIds: Array.from(selected),
          deadline: new Date(deadline).toISOString(),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error || `HTTP ${res.status}`);
        return;
      }
      setSelected(new Set());
      setDeadline("");
      await load();
    } finally {
      setSending(false);
    }
  }

  if (!pr) {
    return (
      <div className="p-6 text-[13px]" style={{ color: T.textMuted }}>
        Завантаження…
      </div>
    );
  }

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
          Заявка {pr.internalNumber}
        </h1>
        <p className="text-[12px]" style={{ color: T.textMuted }}>
          {pr.project?.title ?? "Без проєкту"} • Статус: {pr.status}
        </p>
      </div>

      <section
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <h2 className="mb-2 text-[14px] font-semibold" style={{ color: T.textPrimary }}>
          Позиції ({pr.items.length})
        </h2>
        <ul className="flex flex-col gap-1 text-[13px]">
          {pr.items.map((it) => (
            <li key={it.id} className="flex justify-between">
              <span>{it.description}</span>
              <span style={{ color: T.textMuted }}>
                {it.qty} {it.unit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {pr.status === "DRAFT" && (
        <section
          className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <h2 className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            Розіслати RFQ постачальникам
          </h2>
          <label className="text-[12px]" style={{ color: T.textMuted }}>
            Дедлайн
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 block w-full rounded-md px-2 py-1.5 text-[13px]"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
          </label>
          <div className="max-h-64 overflow-y-auto rounded-md" style={{ border: `1px solid ${T.borderSoft}` }}>
            {suppliers.length === 0 ? (
              <p className="p-3 text-[12px]" style={{ color: T.textMuted }}>
                Постачальники не знайдені. Додайте контрагентів з роллю SUPPLIER та email.
              </p>
            ) : (
              suppliers.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer text-[13px] border-t first:border-t-0"
                    style={{ borderColor: T.borderSoft }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!s.email}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        });
                      }}
                    />
                    <span>{s.name}</span>
                    {!s.email && (
                      <span className="ml-auto text-[11px]" style={{ color: T.warning }}>
                        немає email
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          {error && (
            <p className="text-[12px]" style={{ color: T.danger }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleSendRfq}
            disabled={sending}
            className="inline-flex items-center gap-2 self-start rounded-md px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            <Send size={14} /> Розіслати RFQ
          </button>
        </section>
      )}

      {pr.rfqs.length > 0 && (
        <section
          className="rounded-2xl p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <h2 className="mb-2 text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            RFQ ({pr.rfqs.length})
          </h2>
          <ul className="flex flex-col gap-1 text-[13px]">
            {pr.rfqs.map((r) => (
              <li key={r.id} className="flex justify-between items-center">
                <Link
                  href={`/admin-v2/procurement/rfqs/${r.id}`}
                  className="font-mono"
                  style={{ color: T.accentPrimary }}
                >
                  {r.internalNumber}
                </Link>
                <span style={{ color: T.textMuted }}>
                  {r.status} • {r.recipientCount} постачальн. • {r.bidCount} пропозицій
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
