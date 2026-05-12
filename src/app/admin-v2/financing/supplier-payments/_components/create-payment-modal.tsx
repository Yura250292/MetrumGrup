"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

type CreatePaymentModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

/**
 * Safe Finance Migration: ручне додавання оплати постачальнику.
 *
 * Створює SupplierPayment + автоматично FIFO-розкидає по наявних
 * COMMITTED_EXPENSE FinanceEntry того контрагента. Реальний cash-out
 * (ACTUAL_EXPENSE) йде у дашборд через reader-derivation з SupplierPayment.
 */
export function CreatePaymentModal({ onClose, onCreated }: CreatePaymentModalProps) {
  const [counterpartyOptions, setCounterpartyOptions] = useState<ComboboxOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD">(
    "BANK_TRANSFER",
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [strategy, setStrategy] = useState<"HYBRID" | "FIFO" | "PROPORTIONAL">(
    "HYBRID",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    Promise.all([
      fetch("/api/admin/financing/counterparties?take=200", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      fetch("/api/admin/projects?take=200", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
    ]).then(([cps, projs]) => {
      if (aborted) return;
      setCounterpartyOptions(
        (cps.data ?? []).map((c: { id: string; name: string; type: string }) => ({
          value: c.id,
          label: c.name,
          description:
            c.type === "FOP"
              ? "ФОП"
              : c.type === "INDIVIDUAL"
                ? "Фіз.особа"
                : "ТОВ/ЮО",
        })),
      );
      setProjectOptions(projs.data ?? []);
    });
    return () => {
      aborted = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!counterpartyId) {
      setError("Виберіть постачальника");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Сума має бути > 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/financing/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartyId,
          projectId: projectId || null,
          amount: amt,
          currency: "UAH",
          occurredAt: new Date(occurredAt).toISOString(),
          method,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          strategy,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Помилка створення оплати");
        return;
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: T.borderSoft }}
        >
          <div>
            <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Записати оплату постачальнику
            </h2>
            <p className="text-[11px]" style={{ color: T.textMuted }}>
              Реальний рух грошей. FIFO-розкидка по неоплачених рахунках.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:opacity-80"
            style={{ color: T.textMuted }}
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-5">
          <Field label="Постачальник *">
            <Combobox
              value={counterpartyId}
              onChange={(v) => setCounterpartyId(v ?? "")}
              options={counterpartyOptions}
              placeholder="Пошук контрагента…"
            />
          </Field>

          <Field label="Проєкт (опційно)">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            >
              <option value="">— FIFO по всіх проєктах —</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Сума, грн *">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
                required
              />
            </Field>
            <Field label="Дата *">
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Спосіб">
              <select
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CARD")
                }
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
              >
                <option value="BANK_TRANSFER">Безготівковий</option>
                <option value="CASH">Готівка</option>
                <option value="CARD">Картка</option>
              </select>
            </Field>
            <Field label="Стратегія розподілу">
              <select
                value={strategy}
                onChange={(e) =>
                  setStrategy(
                    e.target.value as "HYBRID" | "FIFO" | "PROPORTIONAL",
                  )
                }
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
                title="HYBRID (default): по проєктах пропорційно, всередині FIFO"
              >
                <option value="HYBRID">Hybrid (рекоменд.)</option>
                <option value="FIFO">FIFO (найстарші першими)</option>
                <option value="PROPORTIONAL">Пропорційно</option>
              </select>
            </Field>
          </div>

          <Field label="№ платіжки / референс">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="наприклад: ПД-2026-0042"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
          </Field>

          <Field label="Нотатки">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
          </Field>

          {error && (
            <div
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}40`,
              }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={{
                color: T.textSecondary,
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-60"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Записати оплату
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10px] font-bold tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
