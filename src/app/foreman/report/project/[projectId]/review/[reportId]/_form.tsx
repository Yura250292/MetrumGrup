"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CostType } from "@prisma/client";
import { BigButton } from "../../../../../_components/big-button";
import { ItemEditCard, type EditableItem } from "../../../../../_components/item-edit-card";

interface Props {
  reportId: string;
  projectId: string;
  projectTitle: string;
  initialItems: EditableItem[];
}

let tmpId = 0;
function newRow(): EditableItem {
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
  };
}

function parseDecimal(s: string | null): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

export function ReviewForm({ reportId, projectId, initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<EditableItem[]>(
    initialItems.length > 0 ? initialItems : [newRow()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    let materials = 0;
    let labor = 0;
    let other = 0;
    for (const item of items) {
      const amount = parseDecimal(item.amount);
      if (item.costType === "MATERIAL") materials += amount;
      else if (item.costType === "LABOR") labor += amount;
      else other += amount;
    }
    return { materials, labor, other, total: materials + labor + other };
  }, [items]);

  function updateItem(idx: number, updated: EditableItem) {
    setItems((prev) => prev.map((it, i) => (i === idx ? updated : it)));
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

    // Phase 2: попередження про MATERIAL/SUBCONTRACT items без counterparty —
    // менеджер не зможе approve без цього. Не блокуємо submit, але показуємо.
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
      // 1. Save edited items
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

      // 2. Submit for approval
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

  return (
    <div className="space-y-4 pb-32 sm:pb-44">
      {items.length === 0 ? (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/40 p-4 text-amber-200 text-sm">
          AI не розпізнав витрат. Додайте їх вручну ↓
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-zinc-300">
          AI розпізнав {items.length} {items.length === 1 ? "позицію" : "позицій"}. Перевірте і виправте, якщо щось не так.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item, idx) => (
          <ItemEditCard
            key={item.id}
            item={item}
            index={idx}
            onChange={(updated) => updateItem(idx, updated)}
            onDelete={() => deleteItem(idx)}
          />
        ))}
      </div>

      <BigButton variant="secondary" onClick={addItem}>
        + Додати рядок
      </BigButton>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Матеріали</span>
          <span className="font-semibold">{totals.materials.toFixed(2)} грн</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Робота</span>
          <span className="font-semibold">{totals.labor.toFixed(2)} грн</span>
        </div>
        {totals.other > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Інше</span>
            <span className="font-semibold">{totals.other.toFixed(2)} грн</span>
          </div>
        )}
        <div className="flex justify-between text-lg pt-2 border-t border-zinc-800">
          <span className="font-bold">Всього</span>
          <span className="font-bold text-emerald-400">{totals.total.toFixed(2)} грн</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-4 py-3">
        <div className="max-w-md mx-auto space-y-2">
          <BigButton onClick={handleConfirm} disabled={submitting || cancelling} loading={submitting} size="huge">
            Підтвердити
          </BigButton>
          <BigButton
            variant="ghost"
            onClick={handleCancel}
            disabled={submitting || cancelling}
            loading={cancelling}
          >
            Скасувати чернетку
          </BigButton>
        </div>
      </div>
    </div>
  );
}
