"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Check,
  Loader2,
  X,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  scheduledDate: string;
  paidDate: string | null;
  notes: string | null;
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: T.warningSoft, fg: T.warning },
  PARTIAL: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  PAID: { bg: T.successSoft, fg: T.success },
  OVERDUE: { bg: T.dangerSoft, fg: T.danger },
};

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Банк",
  CASH: "Готівка",
  CARD: "Картка",
};

export default function AdminV2ProjectFinancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    scheduledDate: "",
    method: "BANK_TRANSFER",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/projects/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProjectTitle(data.title);
        setPayments(
          (data.payments || []).map((p: any) => ({
            ...p,
            amount: Number(p.amount),
          }))
        );
      })
      .catch(() => setError("Не вдалось завантажити проєкт"))
      .finally(() => setFetching(false));
  }, [id]);

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          scheduledDate: form.scheduledDate,
          method: form.method,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Помилка додавання платежу");
      const { data } = await res.json();
      setPayments((prev) =>
        [...prev, { ...data, amount: Number(data.amount) }].sort(
          (a, b) =>
            new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
        )
      );
      setShowForm(false);
      setForm({ amount: "", scheduledDate: "", method: "BANK_TRANSFER", notes: "" });
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setLoading(false);
    }
  }

  async function markAsPaid(paymentId: string) {
    try {
      const res = await fetch(`/api/admin/projects/${id}/payments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, status: "PAID" }),
      });
      if (res.ok) {
        setPayments((prev) =>
          prev.map((p) =>
            p.id === paymentId
              ? { ...p, status: "PAID", paidDate: new Date().toISOString() }
              : p
          )
        );
      }
    } catch {
      // ignore
    }
  }

  const totalScheduled = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaid = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = totalScheduled - totalPaid;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <Link
        href={`/admin-v2/projects/${id}`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-[0.97]"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> {projectTitle || "Назад"}
      </Link>

      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ФІНАНСИ ПРОЄКТУ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Платежі
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {payments.length} {payments.length === 1 ? "платіж" : "платежів"} ·{" "}
            {payments.filter((p) => p.status === "PAID").length} сплачено
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати платіж
        </button>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-3 gap-3 sm:gap-4">
        <KpiCard label="ЗАПЛАНОВАНО" value={formatCurrency(totalScheduled)} />
        <KpiCard label="СПЛАЧЕНО" value={formatCurrency(totalPaid)} accent={T.success} />
        <KpiCard label="ОЧІКУЄ" value={formatCurrency(totalPending)} accent={T.warning} />
      </section>

      {/* Form */}
      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Новий платіж
            </h3>
            <button onClick={() => setShowForm(false)}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={addPayment} className="grid gap-3 sm:grid-cols-2">
            <Field label="Сума, ₴" required>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                required
                placeholder="0"
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <Field label="Запланована дата" required>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm((p) => ({ ...p, scheduledDate: e.target.value }))}
                required
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                  colorScheme: "dark",
                }}
              />
            </Field>
            <Field label="Метод">
              <select
                value={form.method}
                onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              >
                {Object.entries(METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Примітка">
              <input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Опціонально"
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            {error && (
              <div
                className="sm:col-span-2 rounded-xl px-3 py-2.5 text-xs"
                style={{
                  backgroundColor: T.dangerSoft,
                  color: T.danger,
                  border: `1px solid ${T.danger}`,
                }}
              >
                {error}
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Додати
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <section
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div
          className="flex items-center gap-2.5 border-b px-6 py-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
        >
          <Wallet size={18} style={{ color: T.success }} />
          <span className="text-base font-bold" style={{ color: T.textPrimary }}>
            Графік платежів
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: T.panel, color: T.textSecondary }}
          >
            {payments.length}
          </span>
        </div>

        {fetching ? (
          <div
            className="flex items-center justify-center gap-2 py-12 text-sm"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : payments.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 py-16 text-center"
          >
            <AlertCircle size={32} style={{ color: T.textMuted }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Немає платежів
            </span>
            <span className="text-[12px]" style={{ color: T.textMuted }}>
              Додайте перший платіж
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr style={{ backgroundColor: T.panelSoft }}>
                  <Th>ДАТА</Th>
                  <Th align="right">СУМА</Th>
                  <Th>МЕТОД</Th>
                  <Th>СТАТУС</Th>
                  <Th>ПРИМІТКА</Th>
                  <Th align="right">ДІЯ</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  const colors = STATUS_COLORS[p.status] || STATUS_COLORS.PENDING;
                  return (
                    <tr
                      key={p.id}
                      style={{
                        backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                        borderTop: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <td
                        className="px-4 py-3.5 text-[12px]"
                        style={{ color: T.textSecondary }}
                      >
                        {formatDateShort(p.scheduledDate)}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right text-[13px] font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {formatCurrency(Number(p.amount))}
                      </td>
                      <td
                        className="px-4 py-3.5 text-[12px]"
                        style={{ color: T.textMuted }}
                      >
                        {METHOD_LABELS[p.method] || p.method}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: colors.bg, color: colors.fg }}
                        >
                          {PAYMENT_STATUS_LABELS[
                            p.status as keyof typeof PAYMENT_STATUS_LABELS
                          ] || p.status}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3.5 text-[11px]"
                        style={{ color: T.textMuted }}
                      >
                        {p.notes || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {p.status !== "PAID" && (
                          <button
                            onClick={() => markAsPaid(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold"
                            style={{
                              backgroundColor: T.successSoft,
                              color: T.success,
                              border: `1px solid ${T.success}`,
                            }}
                            title="Позначити як сплачено"
                          >
                            <Check size={11} /> Сплачено
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent = T.textPrimary,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl sm:rounded-2xl p-3 sm:p-5 min-w-0 overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[9px] sm:text-[10px] font-bold tracking-wider truncate" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
        {required && (
          <span className="ml-1" style={{ color: T.danger }}>
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-4 py-3 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
  );
}
