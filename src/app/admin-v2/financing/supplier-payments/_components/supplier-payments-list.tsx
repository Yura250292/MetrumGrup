"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { CreatePaymentModal } from "./create-payment-modal";

type Payment = {
  id: string;
  counterpartyId: string;
  projectId: string | null;
  amount: number | string;
  currency: string;
  occurredAt: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD";
  reference: string | null;
  notes: string | null;
  status: "POSTED" | "VOIDED";
  voidedAt: string | null;
  counterparty: { id: string; name: string };
  project: { id: string; title: string; slug: string } | null;
  _count: { allocations: number };
};

const METHOD_LABELS = {
  CASH: "Готівка",
  BANK_TRANSFER: "Безготівковий",
  CARD: "Картка",
} as const;

const STATUS_FILTERS = [
  { value: "", label: "Усі" },
  { value: "POSTED", label: "Проведено" },
  { value: "VOIDED", label: "Скасовано" },
] as const;

export function SupplierPaymentsList({ currentUserRole }: { currentUserRole: string }) {
  // MANAGER веде облік постачальників разом з Адміном → дозволено void платежів.
  const canVoid = ["SUPER_ADMIN", "MANAGER"].includes(currentUserRole);
  const canCreate = ["SUPER_ADMIN", "MANAGER", "FINANCIER"].includes(currentUserRole);

  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "POSTED" | "VOIDED">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("take", "200");
      if (statusFilter) params.set("status", statusFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/financing/supplier-payments?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setItems(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) =>
        p.counterparty.name.toLowerCase().includes(q) ||
        (p.project?.title.toLowerCase().includes(q) ?? false) ||
        (p.reference?.toLowerCase().includes(q) ?? false),
    );
  }, [items, search]);

  const totals = useMemo(() => {
    let postedSum = 0;
    let voidedSum = 0;
    for (const p of filtered) {
      const v = Number(p.amount);
      if (p.status === "POSTED") postedSum += v;
      else voidedSum += v;
    }
    return { postedSum, voidedSum };
  }, [filtered]);

  async function voidPayment(id: string) {
    if (!confirm("Скасувати платіж? Розподіл буде скинуто, статус зачеплених фактів повернеться у APPROVED.")) {
      return;
    }
    setVoidingId(id);
    try {
      const res = await fetch(`/api/admin/financing/supplier-payments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Помилка скасування");
        return;
      }
      await load();
    } finally {
      setVoidingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl p-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук — постачальник / проєкт / № платіжки…"
          className="flex-1 min-w-[220px] rounded-xl px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
        />
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || "all"}
              onClick={() => setStatusFilter(s.value)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: statusFilter === s.value ? T.accentPrimary : T.panelSoft,
                color: statusFilter === s.value ? "#fff" : T.textSecondary,
                border: `1px solid ${statusFilter === s.value ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-xl px-2 py-1.5 text-sm outline-none"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
          title="Від дати"
        />
        <span style={{ color: T.textMuted }}>→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-xl px-2 py-1.5 text-sm outline-none"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
          title="До дати"
        />
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white transition active:scale-[0.97]"
            style={{ backgroundColor: T.accentPrimary }}
            title="Записати реальну оплату постачальнику. FIFO-розкидка по неоплачених рахунках."
          >
            <Plus size={14} /> Записати оплату
          </button>
        )}
      </div>

      {createOpen && (
        <CreatePaymentModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Проведено" value={totals.postedSum} tone="good" />
        <Tile label="Скасовано" value={totals.voidedSum} tone="muted" />
        <Tile label="Усього записів" value={filtered.length} format="count" />
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}40`,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="flex items-center justify-center gap-2 py-12 text-sm"
          style={{ color: T.textMuted }}
        >
          <Loader2 size={14} className="animate-spin" /> Завантажуємо…
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-3 py-3 text-left">Постачальник</th>
                <th className="px-3 py-3 text-left">Проєкт</th>
                <th className="px-3 py-3 text-left">Метод</th>
                <th className="px-3 py-3 text-left">№ / нотатка</th>
                <th className="px-3 py-3 text-right">Сума</th>
                <th className="px-3 py-3 text-right">Алок.</th>
                <th className="px-3 py-3 text-center">Статус</th>
                {canVoid && <th className="px-3 py-3 text-right" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-t"
                  style={{
                    borderColor: T.borderSoft,
                    opacity: p.status === "VOIDED" ? 0.55 : 1,
                  }}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {format(new Date(p.occurredAt), "d MMM yy", { locale: uk })}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin-v2/counterparties/${p.counterparty.id}`}
                      className="font-medium hover:underline"
                      style={{ color: T.accentPrimary }}
                    >
                      {p.counterparty.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[12px]">
                    {p.project ? (
                      <Link
                        href={`/admin-v2/projects/${p.project.slug}`}
                        className="hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {p.project.title}
                      </Link>
                    ) : (
                      <span style={{ color: T.textMuted }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                    {METHOD_LABELS[p.method]}
                  </td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                    {p.reference || p.notes ? (
                      <span className="truncate inline-block max-w-[220px] align-middle">
                        {[p.reference, p.notes].filter(Boolean).join(" · ")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {formatCurrency(Number(p.amount))}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-[12px]"
                    style={{ color: T.textMuted }}
                    title={`${p._count.allocations} рядків розподілу`}
                  >
                    {p._count.allocations}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {p.status === "POSTED" ? (
                      <span
                        className="text-[10px] font-bold rounded px-1.5 py-0.5"
                        style={{ backgroundColor: T.successSoft, color: T.success }}
                      >
                        Проведено
                      </span>
                    ) : (
                      <span
                        className="text-[10px] font-bold rounded px-1.5 py-0.5"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                        title={p.voidedAt ? `Скасовано: ${new Date(p.voidedAt).toLocaleString("uk-UA")}` : undefined}
                      >
                        Скасовано
                      </span>
                    )}
                  </td>
                  {canVoid && (
                    <td className="px-3 py-2.5 text-right">
                      {p.status === "POSTED" && (
                        <button
                          onClick={() => voidPayment(p.id)}
                          disabled={voidingId === p.id}
                          className="rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
                          title="Скасувати платіж"
                        >
                          {voidingId === p.id ? (
                            <Loader2 size={13} className="animate-spin" style={{ color: T.textMuted }} />
                          ) : (
                            <AlertTriangle size={13} style={{ color: T.danger }} />
                          )}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={canVoid ? 9 : 8}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: T.textMuted }}
                  >
                    Платежі не знайдено за фільтрами. Створювати платіж — у дос'є
                    постачальника або на картці проєкту.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "muted",
  format: kind = "money",
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "muted";
  format?: "money" | "count";
}) {
  const color =
    tone === "good" ? T.success : tone === "bad" ? T.danger : T.textPrimary;
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-base font-bold tabular-nums sm:text-lg"
        style={{ color }}
      >
        {kind === "money" ? formatCurrency(value) : value}
      </div>
    </div>
  );
}
