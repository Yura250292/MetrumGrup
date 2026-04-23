"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
import type { ReceiptLineItemStatus, ReceiptScanStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { LineItemRow } from "./line-item-row";

export interface MatchCandidateView {
  materialId: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: number;
  score: number;
}

export interface MatchedMaterialView {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

export interface LineItemView {
  id: string;
  rawName: string;
  rawUnit: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number | null;
  status: ReceiptLineItemStatus;
  matchConfidence: number | null;
  proposedSku: string | null;
  proposedCategory: string | null;
  matchedMaterial: MatchedMaterialView | null;
  candidates: MatchCandidateView[];
}

interface Props {
  scanId: string;
  status: ReceiptScanStatus;
  rejectionReason: string | null;
  totalAmount: number | null;
  currency: string;
  lineItems: LineItemView[];
  canApprove: boolean;
}

export function ReviewBoard({
  scanId,
  status: initialStatus,
  rejectionReason,
  totalAmount,
  currency,
  lineItems: initialItems,
  canApprove,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<LineItemView[]>(initialItems);
  const [status, setStatus] = useState<ReceiptScanStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");

  const blocking = useMemo(
    () => items.filter((i) => i.status === "UNMATCHED" || i.status === "SUGGESTED").length,
    [items],
  );

  const updateItem = (next: LineItemView) => {
    setItems((prev) => prev.map((it) => (it.id === next.id ? next : it)));
  };

  const onApprove = async () => {
    if (blocking > 0) {
      setError(`Залишилось ${blocking} непідтверджених позицій`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/receipts/${scanId}/approve`, { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Помилка підтвердження");
      return;
    }
    setStatus("APPROVED");
    router.refresh();
  };

  const onReject = async () => {
    if (!reason.trim()) {
      setError("Вкажіть причину");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/receipts/${scanId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Помилка відхилення");
      return;
    }
    setStatus("REJECTED");
    setRejectMode(false);
    router.refresh();
  };

  const isFinal = status !== "PENDING";

  return (
    <div className="flex flex-col gap-5">
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {totalAmount !== null && (
            <span className="text-sm" style={{ color: T.textSecondary }}>
              Загалом:{" "}
              <span className="font-semibold" style={{ color: T.textPrimary }}>
                {totalAmount.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} {currency}
              </span>
            </span>
          )}
          <span className="text-sm" style={{ color: T.textSecondary }}>
            Позицій: {items.length}
          </span>
        </div>
        {!isFinal && canApprove && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRejectMode((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}33`,
              }}
            >
              <XCircle size={14} /> Відхилити
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy || blocking > 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary, color: "white" }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Підтвердити та провести на склад
            </button>
          </div>
        )}
      </section>

      {rejectionReason && status === "REJECTED" && (
        <section
          className="rounded-2xl px-5 py-3 text-sm"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          Причина відхилення: {rejectionReason}
        </section>
      )}

      {!isFinal && rejectMode && (
        <section
          className="flex flex-col gap-2 rounded-2xl px-5 py-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <label className="text-sm font-medium" style={{ color: T.textPrimary }}>
            Причина відхилення
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectMode(false)}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ color: T.textMuted }}
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: T.danger, color: "white" }}
            >
              Відхилити
            </button>
          </div>
        </section>
      )}

      {!isFinal && blocking > 0 && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: T.warningSoft, color: T.warning }}
        >
          <AlertCircle size={16} />
          Залишилось {blocking} позицій без матчингу. Підтвердіть, створіть новий
          матеріал або пропустіть кожну з них перед підтвердженням.
        </div>
      )}

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      <section className="flex flex-col gap-3">
        {items.map((item) => (
          <LineItemRow
            key={item.id}
            scanId={scanId}
            item={item}
            disabled={isFinal || busy}
            onUpdated={updateItem}
          />
        ))}
        {items.length === 0 && (
          <div
            className="rounded-2xl px-6 py-12 text-center"
            style={{ backgroundColor: T.panel, border: `1px dashed ${T.borderSoft}`, color: T.textMuted }}
          >
            Жодної позиції не розпізнано. Завантажте іншу накладну або додайте позиції вручну (TODO).
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: ReceiptScanStatus }) {
  const colors: Record<ReceiptScanStatus, { bg: string; fg: string; label: string }> = {
    PENDING: { bg: T.warningSoft, fg: T.warning, label: "На погодженні" },
    APPROVED: { bg: T.successSoft, fg: T.success, label: "Підтверджено" },
    REJECTED: { bg: T.dangerSoft, fg: T.danger, label: "Відхилено" },
    CANCELLED: { bg: T.panelSoft, fg: T.textMuted, label: "Скасовано" },
  };
  const c = colors[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}
