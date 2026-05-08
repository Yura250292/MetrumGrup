"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2, Wallet, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Готівка",
  BANK_TRANSFER: "Безготівковий",
  CARD: "Картка",
};

type PreviewLine = {
  financeEntryId: string;
  occurredAt: string;
  title: string;
  projectId: string | null;
  outstandingBefore: string;
  allocate: string;
  outstandingAfter: string;
  willBecomePaid: boolean;
};

type Preview = {
  lines: PreviewLine[];
  totalAllocated: string;
  unallocated: string;
};

export function SupplierPaymentModal({
  open,
  counterpartyId,
  counterpartyName,
  /** Optional project pre-fill — заборгованість з картки проєкту обмежує FIFO одним проєктом. */
  projectId,
  projectTitle,
  /** Підказка користувачу — поточний загальний борг. Не обовʼязково. */
  outstandingHint,
  onClose,
  onCreated,
}: {
  open: boolean;
  counterpartyId: string;
  counterpartyName: string;
  projectId?: string | null;
  projectTitle?: string | null;
  outstandingHint?: number;
  onClose: () => void;
  onCreated: (paymentId: string) => void;
}) {
  const reduce = useReducedMotion();
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [amountStr, setAmountStr] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset on open/close.
  useEffect(() => {
    if (!open) {
      setAmountStr("");
      setReference("");
      setNotes("");
      setPreview(null);
      setPreviewError(null);
      setSubmitError(null);
      return;
    }
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting, onClose]);

  // Debounced preview fetch.
  useEffect(() => {
    if (!open) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("counterpartyId", counterpartyId);
        params.set("amount", String(amount));
        if (projectId) params.set("projectId", projectId);
        const res = await fetch(
          `/api/admin/financing/supplier-payments/preview?${params}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const j = await res.json();
        if (!res.ok) {
          setPreviewError(j.error ?? `HTTP ${res.status}`);
          setPreview(null);
        } else {
          setPreview(j.data);
        }
      } catch (e: unknown) {
        if ((e as { name?: string }).name === "AbortError") return;
        setPreviewError(e instanceof Error ? e.message : "Network error");
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [amountStr, counterpartyId, projectId, open]);

  async function submit() {
    if (submitting) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setSubmitError("Сума має бути більше 0");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const idempotencyKey = `${counterpartyId}-${occurredAt}-${amount}-${Date.now()}`;
      const res = await fetch("/api/admin/financing/supplier-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          counterpartyId,
          projectId: projectId ?? null,
          amount,
          occurredAt: new Date(occurredAt).toISOString(),
          method,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSubmitError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onCreated(j.data.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Помилка запиту");
    } finally {
      setSubmitting(false);
    }
  }

  const amountNum = Number(amountStr);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overpayment = preview ? Number(preview.unallocated) > 0.005 : false;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={(e) => {
            if (e.target === overlayRef.current && !submitting) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
              boxShadow: T.shadow2,
              maxHeight: "92vh",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between gap-3 px-6 py-4 border-b"
              style={{
                borderColor: T.borderSoft,
                backgroundColor: T.panelElevated,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: T.successSoft, color: T.success }}
                >
                  <Wallet size={16} />
                </div>
                <div className="min-w-0">
                  <h3
                    className="text-[15px] font-bold truncate"
                    style={{ color: T.textPrimary }}
                  >
                    Оплата постачальнику
                  </h3>
                  <p
                    className="text-[11px] truncate"
                    style={{ color: T.textMuted }}
                  >
                    {counterpartyName}
                    {projectTitle ? ` • ${projectTitle}` : ""}
                    {outstandingHint && outstandingHint > 0
                      ? ` • Борг: ${formatCurrency(outstandingHint)}`
                      : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={submitting}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:bg-black/10 disabled:opacity-50"
                style={{ color: T.textMuted }}
                aria-label="Закрити"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form + Preview */}
            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Сума *">
                  <input
                    ref={firstFieldRef}
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none tabular-nums"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Дата платежу *">
                  <input
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Метод оплати">
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  >
                    {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="№ платіжки / чек">
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="напр. 12345"
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="Примітка">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Опис, посилання на договір тощо…"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                  style={inputStyle}
                />
              </Field>

              {/* FIFO preview */}
              <div
                className="rounded-2xl p-3 flex flex-col gap-2"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px dashed ${T.borderSoft}`,
                }}
              >
                <div
                  className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  <span>Що буде оплачено (FIFO)</span>
                  {previewing && (
                    <Loader2 size={12} className="animate-spin" />
                  )}
                </div>
                {!amountValid && (
                  <div
                    className="text-[12px] py-2"
                    style={{ color: T.textMuted }}
                  >
                    Вкажіть суму, щоб побачити план оплати.
                  </div>
                )}
                {previewError && (
                  <div className="text-[12px]" style={{ color: T.danger }}>
                    {previewError}
                  </div>
                )}
                {amountValid && preview && preview.lines.length === 0 && (
                  <div className="text-[12px]" style={{ color: T.textMuted }}>
                    {projectId
                      ? "На цьому проєкті у постачальника немає несплачених фактів."
                      : "У цього постачальника немає несплачених фактів."}
                    {Number(preview.unallocated) > 0 &&
                      ` Сума ${formatCurrency(Number(preview.unallocated))} лишиться невикористаною (overpayment).`}
                  </div>
                )}
                {preview && preview.lines.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {preview.lines.map((l) => (
                      <div
                        key={l.financeEntryId}
                        className="flex items-center justify-between gap-3 text-[12px] px-2 py-1.5 rounded-lg"
                        style={{ backgroundColor: T.panel }}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className="truncate"
                            style={{ color: T.textPrimary }}
                          >
                            {l.title || "—"}
                          </div>
                          <div
                            className="text-[10px]"
                            style={{ color: T.textMuted }}
                          >
                            {new Date(l.occurredAt).toLocaleDateString("uk-UA")}
                            {" • "}
                            Borg до:{" "}
                            <span className="tabular-nums">
                              {formatCurrency(Number(l.outstandingBefore))}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            className="tabular-nums font-semibold"
                            style={{ color: T.success }}
                          >
                            −{formatCurrency(Number(l.allocate))}
                          </span>
                          {l.willBecomePaid ? (
                            <span
                              className="text-[10px] font-bold rounded px-1.5 py-0.5"
                              style={{
                                backgroundColor: T.successSoft,
                                color: T.success,
                              }}
                            >
                              ОПЛАЧЕНО
                            </span>
                          ) : (
                            <span
                              className="text-[10px] rounded px-1.5 py-0.5 tabular-nums"
                              style={{
                                backgroundColor: T.panelSoft,
                                color: T.textMuted,
                              }}
                            >
                              залишок {formatCurrency(Number(l.outstandingAfter))}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {preview && (
                  <div
                    className="flex items-center justify-between text-[12px] pt-2 border-t mt-1"
                    style={{ borderColor: T.borderSoft }}
                  >
                    <span style={{ color: T.textSecondary }}>
                      Усього розподілено:{" "}
                      <span
                        className="tabular-nums font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {formatCurrency(Number(preview.totalAllocated))}
                      </span>
                    </span>
                    {overpayment && (
                      <span style={{ color: T.amber }}>
                        Переплата:{" "}
                        <span className="tabular-nums font-semibold">
                          +{formatCurrency(Number(preview.unallocated))}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between gap-3 px-6 py-4 border-t"
              style={{
                borderColor: T.borderSoft,
                backgroundColor: T.panelElevated,
              }}
            >
              <div className="text-[12px]" style={{ color: T.danger }}>
                {submitError}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-xl px-4 py-2 text-[13px] font-semibold transition hover:bg-black/5 disabled:opacity-50"
                  style={{
                    color: T.textSecondary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  Скасувати
                </button>
                <button
                  onClick={submit}
                  disabled={!amountValid || submitting}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition disabled:opacity-50"
                  style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Створення…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} /> Внести оплату
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
        className="text-[10.5px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: T.panelSoft,
  border: `1px solid ${T.borderStrong}`,
  color: T.textPrimary,
};
