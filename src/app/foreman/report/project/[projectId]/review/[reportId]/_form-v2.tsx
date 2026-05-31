"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Tag, ChevronDown } from "lucide-react";
import type { CostType } from "@prisma/client";
import { Stepper } from "../../../../../_components/v2/stepper";
import { PhotoPreviewCard, type PhotoAttachment } from "../../../../../_components/v2/photo-preview-card";
import { SupplierSummaryCard } from "../../../../../_components/v2/supplier-summary-card";
import { PriceAlert } from "../../../../../_components/v2/price-alert";
import { TotalSummary } from "../../../../../_components/v2/total-summary";
import {
  ItemEditCardLight,
} from "../../../../../_components/v2/item-edit-card-light";
import type { EditableItem } from "../../../../../_components/item-edit-card";

export interface ReviewItemInput extends EditableItem {
  priceIncreaseFlag: boolean;
  previousUnitPrice: string | null;
}

interface Props {
  reportId: string;
  projectId: string;
  projectTitle: string;
  initialItems: ReviewItemInput[];
  attachments: PhotoAttachment[];
  stageName: string | null;
  stageHint: string | null;
}

let tmpId = 0;
function newRow(): ReviewItemInput {
  tmpId += 1;
  return {
    id: `tmp-${Date.now()}-${tmpId}`,
    costType: "MATERIAL" as CostType,
    title: "",
    unit: null,
    quantity: null,
    unitPrice: null,
    amount: "0",
    currency: "UAH",
    confidence: null,
    counterpartyId: null,
    supplierGuess: null,
    counterpartyName: null,
    priceIncreaseFlag: false,
    previousUnitPrice: null,
  };
}

function parseDecimal(s: string | null): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

export function ReviewFormV2({
  reportId,
  projectId,
  initialItems,
  attachments,
  stageName,
  stageHint,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItemInput[]>(
    initialItems.length > 0 ? initialItems : [newRow()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => items.reduce((acc, it) => acc + parseDecimal(it.amount), 0),
    [items],
  );

  const avgConfidence = useMemo(() => {
    const vals = items
      .map((i) => i.confidence)
      .filter((c): c is number => typeof c === "number");
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [items]);

  const primaryAlert = useMemo(() => {
    const flagged = items.find((it) => it.priceIncreaseFlag && it.previousUnitPrice);
    if (!flagged) return null;
    const prev = parseDecimal(flagged.previousUnitPrice);
    const now = parseDecimal(flagged.unitPrice);
    if (prev <= 0 || now <= 0) return null;
    const pct = Math.round(((now - prev) / prev) * 100);
    return {
      title: `Ціна ${flagged.title.toLowerCase()}`,
      pct,
      detail: `Раніше було ${formatUah(prev)}/${flagged.unit ?? "од"}, зараз ${formatUah(now)}. Перевір на касі.`,
    };
  }, [items]);

  const supplierSummary = useMemo(() => {
    const firstMaterial = items.find(
      (it) => it.costType === "MATERIAL" || it.costType === "SUBCONTRACT",
    );
    if (!firstMaterial) return null;
    const unique = new Set(
      items
        .filter((it) => it.counterpartyId || it.supplierGuess)
        .map((it) => it.counterpartyId ?? it.supplierGuess),
    );
    return {
      supplierName: firstMaterial.counterpartyName ?? null,
      supplierGuess: firstMaterial.supplierGuess ?? null,
      uniqueCount: unique.size,
    };
  }, [items]);

  function updateItem(idx: number, updated: EditableItem) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              ...updated,
              priceIncreaseFlag: it.priceIncreaseFlag,
              previousUnitPrice: it.previousUnitPrice,
            }
          : it,
      ),
    );
  }

  function deleteItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addItem() {
    setItems((prev) => [...prev, newRow()]);
  }

  async function handleConfirm() {
    if (submitting) return;
    if (items.length === 0) {
      setError("Додайте хоча б один рядок");
      return;
    }
    for (const it of items) {
      if (!it.title.trim()) {
        setError("Заповніть назву у всіх рядках");
        return;
      }
      if (parseDecimal(it.amount) <= 0) {
        setError("Сума має бути більше нуля");
        return;
      }
    }

    const supplierMissing = items.filter(
      (it) =>
        (it.costType === "MATERIAL" || it.costType === "SUBCONTRACT") &&
        !it.counterpartyId,
    );
    if (supplierMissing.length > 0) {
      const ok = confirm(
        `${supplierMissing.length} ${supplierMissing.length === 1 ? "позиція без постачальника" : "позицій без постачальника"}. Менеджер не зможе затвердити — потрібно буде довибрати. Продовжити?`,
      );
      if (!ok) return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const patchRes = await fetch(`/api/foreman/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it, idx) => ({
            costType: it.costType,
            title: it.title.trim(),
            unit: it.unit?.trim() || null,
            quantity: it.quantity ? parseDecimal(it.quantity) : null,
            unitPrice: it.unitPrice ? parseDecimal(it.unitPrice) : null,
            amount: parseDecimal(it.amount),
            currency: it.currency,
            sortOrder: idx,
            counterpartyId: it.counterpartyId ?? null,
            supplierGuess: it.supplierGuess ?? null,
          })),
        }),
      });
      if (!patchRes.ok) {
        const body = (await patchRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Не вдалось зберегти");
      }

      const submitRes = await fetch(`/api/foreman/reports/${reportId}/submit`, {
        method: "POST",
      });
      if (!submitRes.ok) {
        const body = (await submitRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Не вдалось надіслати");
      }
      router.push("/foreman/history?submitted=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (cancelling) return;
    setCancelling(true);
    try {
      await fetch(`/api/foreman/reports/${reportId}/cancel`, { method: "POST" });
    } finally {
      router.push(`/foreman/report/project/${projectId}`);
    }
  }

  const hasRecognised = initialItems.length > 0;

  return (
    <div className="space-y-3 pb-28">
      <Stepper
        steps={["Фото", "AI парсить", "Перевірка", "Готово"]}
        current={3}
        hint="Фото → AI парсить → Перевірка → Готово"
      />

      {attachments.length > 0 && (
        <PhotoPreviewCard attachments={attachments} confidence={avgConfidence} />
      )}

      {hasRecognised && (
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500">
            AI РОЗПІЗНАВ
          </h2>
          <button
            type="button"
            onClick={addItem}
            className="text-[12px] font-semibold text-indigo-600"
          >
            + Додати
          </button>
        </div>
      )}

      {supplierSummary && (
        <SupplierSummaryCard
          supplierName={supplierSummary.supplierName}
          supplierGuess={supplierSummary.supplierGuess}
          uniqueCount={supplierSummary.uniqueCount}
        />
      )}

      {!hasRecognised && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[13px] text-amber-800">
          AI не розпізнав витрат. Додайте їх вручну ↓
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, idx) => (
          <ItemEditCardLight
            key={item.id}
            item={item}
            index={idx}
            onChange={(u) => updateItem(idx, u)}
            onDelete={() => deleteItem(idx)}
          />
        ))}
      </div>

      {!hasRecognised && (
        <button
          type="button"
          onClick={addItem}
          className="w-full text-[13px] font-semibold text-indigo-600 bg-white border border-dashed border-indigo-300 rounded-xl py-2.5 active:bg-indigo-50"
        >
          + Додати рядок
        </button>
      )}

      {primaryAlert && (
        <PriceAlert
          title={primaryAlert.title}
          changePct={primaryAlert.pct}
          detail={primaryAlert.detail}
        />
      )}

      {stageName && (
        <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 flex items-center gap-2.5">
          <Tag size={16} className="text-slate-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 leading-tight">Етап</div>
            <div className="text-[13px] font-semibold text-slate-900 truncate">
              {stageName}
              {stageHint && (
                <span className="text-slate-500 font-normal"> · {stageHint}</span>
              )}
            </div>
          </div>
          <ChevronDown size={16} className="text-slate-400" />
        </div>
      )}

      <TotalSummary total={total} itemsCount={items.length} hint="ПДВ: 20% включно" />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-100/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200">
        <div className="max-w-md mx-auto space-y-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || cancelling}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white font-bold text-[15px] py-3.5 active:scale-[0.99] transition disabled:opacity-60 shadow-[0_10px_24px_-10px_rgba(79,70,229,0.6)]"
          >
            <Send size={18} strokeWidth={2.2} />
            {submitting ? "Надсилаємо…" : "Надіслати ПМ на погодження"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting || cancelling}
            className="w-full text-[13px] font-semibold text-slate-500 py-2 active:text-slate-700 disabled:opacity-60"
          >
            {cancelling ? "Скасування…" : "Зберегти як чернетку"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatUah(n: number): string {
  return `${n.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴`;
}
