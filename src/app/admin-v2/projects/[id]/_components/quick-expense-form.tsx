"use client";

import { useMemo, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type QuickExpenseFormProps = {
  projectId: string;
  stageId: string;
  onSubmitted: () => Promise<void> | void;
};

const UNITS = ["шт", "м", "м²", "м³", "кг", "т", "л", "пог.м", "мішок", "пач", "год"];

/**
 * Форма швидкого додавання «довезень» матеріалу до етапу.
 * Створює FinanceEntry FACT EXPENSE прив'язаний до stageRecordId.
 */
export function QuickExpenseForm({
  projectId,
  stageId,
  onSubmitted,
}: QuickExpenseFormProps) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState<string>("");
  const [unit, setUnit] = useState("шт");
  const [pricePerUnit, setPricePerUnit] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => {
    const q = parseFloat(qty);
    const p = parseFloat(pricePerUnit);
    if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
    return q * p;
  }, [qty, pricePerUnit]);

  const canSubmit = name.trim() && total > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const q = parseFloat(qty);
      const p = parseFloat(pricePerUnit);
      const title = `${name.trim()} (${q} ${unit} × ${formatCurrency(p)})`;
      const res = await fetch("/api/admin/financing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "EXPENSE",
          kind: "FACT",
          amount: total,
          title,
          description: `Довезення: ${name.trim()}`,
          category: "materials",
          occurredAt: new Date().toISOString(),
          projectId,
          stageRecordId: stageId,
          status: "DRAFT",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка створення запису");
      }
      setName("");
      setQty("");
      setPricePerUnit("");
      await onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: T.textSecondary }}>
        <Plus size={12} />
        Довезення матеріалу
      </div>
      <div className="grid grid-cols-12 gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Назва (напр. клей плитковий)"
          className="col-span-12 rounded border px-2 py-1.5 text-[12px] outline-none focus:ring-1"
          style={{
            backgroundColor: T.panel,
            borderColor: T.borderSoft,
            color: T.textPrimary,
          }}
        />
        <input
          type="number"
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="К-сть"
          className="col-span-3 rounded border px-2 py-1.5 text-[12px] outline-none"
          style={{
            backgroundColor: T.panel,
            borderColor: T.borderSoft,
            color: T.textPrimary,
          }}
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="col-span-3 rounded border px-2 py-1.5 text-[12px] outline-none"
          style={{
            backgroundColor: T.panel,
            borderColor: T.borderSoft,
            color: T.textPrimary,
          }}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          value={pricePerUnit}
          onChange={(e) => setPricePerUnit(e.target.value)}
          placeholder="Ціна за од."
          className="col-span-6 rounded border px-2 py-1.5 text-[12px] outline-none"
          style={{
            backgroundColor: T.panel,
            borderColor: T.borderSoft,
            color: T.textPrimary,
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-[12px]" style={{ color: T.textSecondary }}>
          Сума:{" "}
          <span className="font-bold" style={{ color: total > 0 ? T.danger : T.textMuted }}>
            {total > 0 ? `+${formatCurrency(total)}` : "—"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
          style={{
            backgroundColor: T.accentPrimary,
            color: "white",
          }}
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Додати
        </button>
      </div>
      {error && (
        <div className="mt-1.5 text-[11px]" style={{ color: T.danger }}>
          {error}
        </div>
      )}
    </div>
  );
}
