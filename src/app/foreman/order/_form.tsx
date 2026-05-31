"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, X, Package } from "lucide-react";

interface Props {
  projects: { id: string; title: string }[];
}

interface OrderItem {
  id: string;
  description: string;
  qty: string;
  unit: string;
}

let tmpId = 0;
function newItem(): OrderItem {
  tmpId += 1;
  return { id: `tmp-${tmpId}`, description: "", qty: "", unit: "шт." };
}

export function OrderMaterialForm({ projects }: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(
    projects.length === 1 ? projects[0].id : null,
  );
  const [neededBy, setNeededBy] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (projects.length === 0) {
    return (
      <div className="mt-6 rounded-2xl bg-white border border-slate-200 p-6 text-center">
        <div className="text-sm font-semibold text-slate-700">Немає призначень</div>
        <div className="text-xs text-slate-500 mt-1">
          Зверніться до менеджера, щоб призначив вас на об{"’"}єкт.
        </div>
      </div>
    );
  }

  function updateItem(i: number, patch: Partial<OrderItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!projectId) {
      setError("Оберіть обʼєкт");
      return;
    }
    const cleaned = items
      .map((it) => ({
        description: it.description.trim(),
        qty: parseFloat(it.qty.replace(",", ".")),
        unit: it.unit.trim() || "шт.",
      }))
      .filter((it) => it.description.length >= 2 && it.qty > 0);
    if (cleaned.length === 0) {
      setError("Додайте хоча б одну позицію (назва + кількість)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/foreman/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          neededBy: neededBy || null,
          notes: notes.trim() || null,
          items: cleaned,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        internalNumber?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.message ?? body.error ?? "Не вдалось надіслати");
      }
      setSuccess(`Замовлення ${body.internalNumber ?? ""} надіслано менеджеру`);
      setTimeout(() => router.push("/foreman"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 pt-1 pb-6">
      <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
        {projects.length > 1 && (
          <label className="block">
            <span className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
              Обʼєкт
            </span>
            <select
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
              className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-[14px] focus:border-indigo-500 focus:outline-none"
            >
              <option value="">— оберіть —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
            Потрібно до
          </span>
          <input
            type="date"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-[14px] focus:border-indigo-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
            Позиції
          </h2>
          <button
            type="button"
            onClick={() => setItems((p) => [...p, newItem()])}
            className="text-[12px] font-semibold text-indigo-600"
          >
            + Додати
          </button>
        </div>

        {items.map((it, i) => (
          <div
            key={it.id}
            className="rounded-xl bg-white border border-slate-200 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600">
                <Package size={14} />
              </span>
              <input
                type="text"
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                placeholder="Напр.: Цемент М500"
                className="flex-1 px-2 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-[14px] text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-rose-50 text-rose-600"
                  aria-label="Видалити"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={it.qty}
                onChange={(e) => updateItem(i, { qty: e.target.value })}
                placeholder="К-сть"
                className="px-2 py-2 rounded-md bg-slate-50 border border-slate-200 text-[14px] text-slate-900 text-center focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="text"
                value={it.unit}
                onChange={(e) => updateItem(i, { unit: e.target.value })}
                placeholder="Од. (шт. / м² / т)"
                className="px-2 py-2 rounded-md bg-slate-50 border border-slate-200 text-[14px] text-slate-900 text-center focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      <label className="block">
        <span className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
          Коментар (опційно)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Напр.: Привезти зранку у понеділок."
          className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-[14px] text-slate-900 focus:border-indigo-500 focus:outline-none resize-y"
        />
      </label>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 text-sm font-semibold">
          {success}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setItems((p) => [...p, newItem()])}
          className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white border border-slate-200 text-slate-600"
          aria-label="Додати ще позицію"
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white font-bold text-[15px] py-3.5 active:scale-[0.99] transition disabled:opacity-60 shadow-[0_10px_24px_-10px_rgba(79,70,229,0.6)]"
        >
          <Send size={16} strokeWidth={2.2} />
          {submitting ? "Надсилаємо…" : "Надіслати ПМ"}
        </button>
      </div>
    </div>
  );
}
