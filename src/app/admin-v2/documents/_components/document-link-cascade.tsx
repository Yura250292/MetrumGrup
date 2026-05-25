"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function DocumentLinkCascade({
  documentId,
  extractedData,
  onLinked,
}: {
  documentId: string;
  extractedData: Record<string, unknown>;
  onLinked: () => void;
}) {
  const initialAmount = numericFromPath(extractedData, "amountTotal");
  const initialDate = stringFromPath(extractedData, "documentDate") ?? "";
  const initialTitle =
    stringFromPath(extractedData, "counterparty.name") ?? "Документ";
  const initialNumber = stringFromPath(extractedData, "documentNumber") ?? "";
  const counterpartyId = stringFromPath(extractedData, "autoLink.counterpartyId");
  const projectId = stringFromPath(extractedData, "autoLink.projectId");

  const [amount, setAmount] = useState(initialAmount?.toString() ?? "");
  const [occurredAt, setOccurredAt] = useState(initialDate);
  const [title, setTitle] = useState(initialTitle);
  const [invoiceNumber, setInvoiceNumber] = useState(initialNumber);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/documents/${documentId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "FINANCE_ENTRY",
          overrides: {
            amount: Number(amount.replace(",", ".")),
            occurredAt: occurredAt || undefined,
            title,
            invoiceNumber: invoiceNumber || undefined,
            counterpartyId: counterpartyId ?? null,
            projectId: projectId ?? null,
          },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Не вдалось привʼязати");
        return;
      }
      onLinked();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="m-4 rounded-2xl border p-4"
      style={{ borderColor: T.borderSoft, backgroundColor: T.panelSoft }}
    >
      <h3
        className="flex items-center gap-2 text-sm font-bold"
        style={{ color: T.textPrimary }}
      >
        <Link2 size={14} />
        Створити FinanceEntry
      </h3>
      <p className="mt-1 text-xs" style={{ color: T.textMuted }}>
        Сума і поля попередньо заповнені AI. Перевір і підтверди — створиться
        запис у фінансах (kind=FACT, source=DOCUMENT_INBOX).
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <Input label="Назва" value={title} onChange={setTitle} />
        <Input label="Номер документа" value={invoiceNumber} onChange={setInvoiceNumber} />
        <Input label="Сума" value={amount} onChange={setAmount} type="number" />
        <Input
          label="Дата (YYYY-MM-DD)"
          value={occurredAt}
          onChange={setOccurredAt}
          type="date"
        />
      </div>
      {error ? (
        <p className="mt-2 text-xs" style={{ color: T.danger }}>
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={submitting || !amount}
        onClick={submit}
        className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
        style={{
          background: T.accentPrimary,
          color: "white",
          opacity: submitting || !amount ? 0.6 : 1,
        }}
      >
        {submitting ? <Loader2 className="animate-spin" size={14} /> : <Link2 size={14} />}
        Створити та привʼязати
      </button>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: T.textSecondary }}>
      <span className="font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border bg-transparent px-2 py-1.5 text-sm"
        style={{ borderColor: T.borderSoft, color: T.textPrimary }}
      />
    </label>
  );
}

function stringFromPath(obj: Record<string, unknown>, path: string): string | null {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[p];
  }
  if (current == null) return null;
  return String(current);
}

function numericFromPath(obj: Record<string, unknown>, path: string): number | null {
  const v = stringFromPath(obj, path);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
