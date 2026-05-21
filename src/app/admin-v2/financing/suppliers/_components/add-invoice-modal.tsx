"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { financeCategoriesForType } from "@/lib/constants";

type AddInvoiceModalProps = {
  /** Якщо переданий — фіксується як прикріплений постачальник (форма у drawer). */
  presetCounterpartyId?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

/**
 * Ручне створення накладної постачальника (FinanceEntry, kind=FACT, type=EXPENSE).
 * Використовується фінансистом, коли немає звіту виконроба — наприклад, накладна
 * прийшла поштою, або це окрема послуга. На submit викликається POST /api/admin/financing.
 */
export function AddInvoiceModal({
  presetCounterpartyId,
  onClose,
  onCreated,
}: AddInvoiceModalProps) {
  const [counterpartyOptions, setCounterpartyOptions] = useState<ComboboxOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [counterpartyId, setCounterpartyId] = useState(presetCounterpartyId ?? "");
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"UAH" | "USD" | "EUR">("UAH");
  const [occurredAt, setOccurredAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [category, setCategory] = useState("materials");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"APPROVED" | "PAID">("APPROVED");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = financeCategoriesForType("EXPENSE");

  useEffect(() => {
    let aborted = false;
    Promise.all([
      fetch("/api/admin/financing/counterparties?role=SUPPLIER&take=200", {
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      fetch("/api/admin/projects?take=200", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
    ]).then(([cps, projs]) => {
      if (aborted) return;
      setCounterpartyOptions(
        (cps.data ?? []).map(
          (c: { id: string; name: string; type: string }) => ({
            value: c.id,
            label: c.name,
            description:
              c.type === "FOP"
                ? "ФОП"
                : c.type === "INDIVIDUAL"
                  ? "Фіз.особа"
                  : "ТОВ/ЮО",
          }),
        ),
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
    if (!title.trim()) {
      setError("Введіть назву (наприклад, «Цемент М500»)");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: "EXPENSE",
        kind: "FACT",
        amount: amt,
        currency,
        occurredAt,
        category,
        title: title.trim(),
        description: description.trim() || null,
        counterpartyId,
        projectId: projectId || null,
        invoiceNumber: invoiceNumber.trim() || null,
        status,
      };
      const res = await fetch("/api/admin/financing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Нова накладна
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-black/10">
            <X size={16} style={{ color: T.textMuted }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-5 py-4 overflow-y-auto">
          {!presetCounterpartyId && (
            <Field label="Постачальник *">
              <Combobox
                options={counterpartyOptions}
                value={counterpartyId}
                onChange={(v) => setCounterpartyId(v ?? "")}
                placeholder="Виберіть постачальника"
              />
            </Field>
          )}

          <Field label="Проєкт (необов'язково)">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px]"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            >
              <option value="">Без проєкту</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Сума *">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg px-3 py-2 text-[13px]"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <Field label="Валюта">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as typeof currency)}
                className="w-full rounded-lg px-3 py-2 text-[13px]"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
              >
                <option value="UAH">UAH</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата *">
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px]"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                  colorScheme: "light",
                }}
              />
            </Field>
            <Field label="№ накладної">
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="напр. РН-12345"
                className="w-full rounded-lg px-3 py-2 text-[13px]"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
          </div>

          <Field label="Категорія *">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px]"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            >
              {expenseCategories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Назва *">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="напр. Цемент М500, 20 мішків"
              className="w-full rounded-lg px-3 py-2 text-[13px]"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
          </Field>

          <Field label="Коментар">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-[13px] resize-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
          </Field>

          <Field label="Статус">
            <div className="flex gap-2">
              <StatusPill
                label="Борг"
                active={status === "APPROVED"}
                onClick={() => setStatus("APPROVED")}
                tone="danger"
              />
              <StatusPill
                label="Оплачено"
                active={status === "PAID"}
                onClick={() => setStatus("PAID")}
                tone="success"
              />
            </div>
          </Field>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold"
              style={{
                backgroundColor: T.accentPrimary,
                color: "#fff",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Створити
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function StatusPill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "danger" | "success";
}) {
  const bg = active
    ? tone === "danger"
      ? T.dangerSoft
      : T.successSoft
    : T.panelSoft;
  const fg = active ? (tone === "danger" ? T.danger : T.success) : T.textSecondary;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
      style={{ backgroundColor: bg, color: fg, border: `1px solid ${T.borderSoft}` }}
    >
      {label}
    </button>
  );
}
