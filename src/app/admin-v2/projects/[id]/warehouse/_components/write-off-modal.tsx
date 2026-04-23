"use client";

import { useState } from "react";
import { Loader2, X, MinusCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { InventoryRow } from "./project-inventory-table";

interface Props {
  item: InventoryRow;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function WriteOffModal({ item, projectId, onClose, onSuccess }: Props) {
  const [qty, setQty] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) return setError("Кількість повинна бути > 0");
    if (qty > item.quantity) return setError(`Перевищує залишок (${item.quantity})`);

    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/inventory/${item.id}/write-off`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: qty, notes: notes.trim() || undefined, projectId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Помилка списання");
      return;
    }
    onSuccess();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              СПИСАННЯ ЗІ СКЛАДУ
            </span>
            <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
              {item.materialName}
            </h2>
            <span className="text-xs" style={{ color: T.textMuted }}>
              {item.materialSku} · {item.warehouseName}
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ color: T.textMuted }}>
            <X size={20} />
          </button>
        </div>

        <div
          className="flex items-center justify-between rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: T.panelSoft }}
        >
          <span style={{ color: T.textMuted }}>Залишок зараз:</span>
          <span className="font-mono font-semibold" style={{ color: T.textPrimary }}>
            {item.quantity} {item.unit}
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium" style={{ color: T.textPrimary }}>
            Кількість для списання
          </span>
          <input
            type="number"
            step="0.001"
            min="0"
            max={item.quantity}
            value={qty || ""}
            onChange={(e) => setQty(Number(e.target.value))}
            className="rounded-xl px-3 py-2.5 text-sm"
            style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium" style={{ color: T.textPrimary }}>
            Причина / нотатка (опційно)
          </span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Напр.: використано на роботи з кладки"
            className="rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
          />
        </label>

        {error && (
          <div className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: T.dangerSoft, color: T.danger }}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ color: T.textMuted }}
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={busy || qty <= 0}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: T.danger, color: "white" }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <MinusCircle size={14} />}
            Списати
          </button>
        </div>
      </form>
    </div>
  );
}
