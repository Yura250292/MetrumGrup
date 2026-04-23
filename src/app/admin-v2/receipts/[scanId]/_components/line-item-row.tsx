"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Pencil, SkipForward } from "lucide-react";
import type { ReceiptLineItemStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MaterialMatchModal } from "./material-match-modal";
import type { LineItemView } from "./review-board";

interface Props {
  scanId: string;
  item: LineItemView;
  disabled: boolean;
  onUpdated: (item: LineItemView) => void;
}

const STATUS_BADGE: Record<ReceiptLineItemStatus, { fg: string; bg: string; label: string }> = {
  MATCHED: { fg: T.success, bg: T.successSoft, label: "Знайдено" },
  CONFIRMED: { fg: T.success, bg: T.successSoft, label: "Підтверджено" },
  CREATE_NEW: { fg: T.indigo, bg: T.indigoSoft, label: "Новий матеріал" },
  SUGGESTED: { fg: T.warning, bg: T.warningSoft, label: "Перевірити" },
  UNMATCHED: { fg: T.danger, bg: T.dangerSoft, label: "Не знайдено" },
  SKIPPED: { fg: T.textMuted, bg: T.panelSoft, label: "Пропущено" },
};

export function LineItemRow({ scanId, item, disabled, onUpdated }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(item.quantity);
  const [price, setPrice] = useState(item.unitPrice);
  const [editing, setEditing] = useState(false);

  const badge = STATUS_BADGE[item.status];

  const post = async (body: object) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/receipts/${scanId}/line-items/${item.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Помилка");
      return null;
    }
    return json.data;
  };

  const onSkip = async () => {
    const updated = await post({ action: "skip" });
    if (updated) onUpdated({ ...item, status: "SKIPPED" });
  };

  const onPickCandidate = async (materialId: string) => {
    const updated = await post({ action: "match", materialId });
    if (updated) {
      const cand = item.candidates.find((c) => c.materialId === materialId);
      onUpdated({
        ...item,
        status: "CONFIRMED",
        matchedMaterial: cand
          ? { id: cand.materialId, name: cand.name, sku: cand.sku, unit: cand.unit }
          : item.matchedMaterial,
        matchConfidence: 1,
      });
    }
  };

  const onSaveEdits = async () => {
    if (qty === item.quantity && price === item.unitPrice) {
      setEditing(false);
      return;
    }
    const updated = await post({ action: "edit", edits: { quantity: qty, unitPrice: price } });
    if (updated) {
      onUpdated({ ...item, quantity: qty, unitPrice: price });
      setEditing(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl px-5 py-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium" style={{ color: T.textPrimary }}>
            {item.rawName}
          </span>
          {item.matchedMaterial && (
            <span className="text-xs" style={{ color: T.textMuted }}>
              → {item.matchedMaterial.name} ({item.matchedMaterial.sku})
            </span>
          )}
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: badge.bg, color: badge.fg }}
        >
          {badge.label}
          {item.matchConfidence !== null && item.status !== "SKIPPED"
            ? ` · ${(item.matchConfidence * 100).toFixed(0)}%`
            : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" style={{ color: T.textSecondary }}>
        {editing ? (
          <>
            <label className="flex items-center gap-1.5">
              К-сть:
              <input
                type="number"
                step="0.001"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-24 rounded-lg px-2 py-1 text-right"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
              />
              {item.rawUnit ?? "шт"}
            </label>
            <label className="flex items-center gap-1.5">
              Ціна:
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-28 rounded-lg px-2 py-1 text-right"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
              />
              ₴
            </label>
            <button
              type="button"
              onClick={onSaveEdits}
              disabled={busy || disabled}
              className="rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary, color: "white" }}
            >
              Зберегти
            </button>
            <button
              type="button"
              onClick={() => {
                setQty(item.quantity);
                setPrice(item.unitPrice);
                setEditing(false);
              }}
              className="rounded-lg px-2.5 py-1 text-xs"
              style={{ color: T.textMuted }}
            >
              Скасувати
            </button>
          </>
        ) : (
          <>
            <span>
              К-сть: <strong style={{ color: T.textPrimary }}>{item.quantity}</strong> {item.rawUnit ?? "шт"}
            </span>
            <span>
              Ціна:{" "}
              <strong style={{ color: T.textPrimary }}>
                {item.unitPrice.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
              </strong>
            </span>
            {item.totalPrice !== null && (
              <span>
                Сума:{" "}
                <strong style={{ color: T.textPrimary }}>
                  {item.totalPrice.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                </strong>
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: T.accentPrimary }}
              >
                <Pencil size={12} /> редагувати
              </button>
            )}
          </>
        )}
      </div>

      {!disabled && (item.status === "UNMATCHED" || item.status === "SUGGESTED") && (
        <div className="flex flex-col gap-2">
          {item.candidates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ЗНАЙДЕНІ КАНДИДАТИ
              </span>
              <div className="flex flex-col gap-1.5">
                {item.candidates.map((c) => (
                  <button
                    key={c.materialId}
                    type="button"
                    onClick={() => onPickCandidate(c.materialId)}
                    disabled={busy}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <span style={{ color: T.textPrimary }}>
                      {c.name}{" "}
                      <span style={{ color: T.textMuted }}>· {c.sku} · {c.unit}</span>
                    </span>
                    <span style={{ color: T.textMuted }}>{(c.score * 100).toFixed(0)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              <CheckCircle2 size={14} /> Шукати / створити
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
            >
              <SkipForward size={14} /> Пропустити
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      {modalOpen && (
        <MaterialMatchModal
          item={item}
          onClose={() => setModalOpen(false)}
          onPickExisting={async (materialId) => {
            const data = await post({ action: "match", materialId });
            if (data) {
              setModalOpen(false);
              const cand = item.candidates.find((c) => c.materialId === materialId);
              onUpdated({
                ...item,
                status: "CONFIRMED",
                matchedMaterial: cand
                  ? { id: cand.materialId, name: cand.name, sku: cand.sku, unit: cand.unit }
                  : { id: materialId, name: "", sku: "", unit: item.rawUnit ?? "шт" },
                matchConfidence: 1,
              });
            }
          }}
          onCreateNew={async (newMat) => {
            const data = await post({ action: "create", newMaterial: newMat });
            if (data) {
              setModalOpen(false);
              onUpdated({
                ...item,
                status: "CREATE_NEW",
                matchedMaterial: {
                  id: data.matchedMaterialId,
                  name: newMat.name,
                  sku: newMat.sku,
                  unit: newMat.unit,
                },
                matchConfidence: 1,
              });
            }
          }}
        />
      )}
    </div>
  );
}
