"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Send } from "lucide-react";
import { ALLOWED_UNITS } from "@/lib/estimates/units";

type ReportableItem = {
  estimateItemId: string;
  sectionId: string | null;
  sectionName: string | null;
  description: string;
  unit: string;
  plannedQuantity: number;
  approvedQuantity: number;
  remainingQuantity: number;
  progressPercent: number;
};

type ExtraRow = { key: string; title: string; unit: string; quantity: string };

/** Пресети періоду: 1-15 та 16-останній день поточного місяця. */
function periodPresets() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const mid = new Date(Date.UTC(y, m, 15));
  const sixteenth = new Date(Date.UTC(y, m, 16));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [
    { label: `1–15 (${fmt(first)})`, start: first, end: mid },
    { label: `16–${last.getUTCDate()} (${fmt(sixteenth)})`, start: sixteenth, end: last },
  ];
}

export function ProgressReportForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const presets = useMemo(periodPresets, []);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [items, setItems] = useState<ReportableItem[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/foreman/projects/${projectId}/reportable-items`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Немає доступу"))))
      .then((d) => alive && setItems(d.items ?? []))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; rows: ReportableItem[] }>();
    for (const it of items ?? []) {
      const key = it.sectionId ?? "—";
      if (!map.has(key)) map.set(key, { name: it.sectionName ?? "Без розділу", rows: [] });
      map.get(key)!.rows.push(it);
    }
    return [...map.values()];
  }, [items]);

  function addExtra() {
    setExtras((x) => [
      ...x,
      { key: `${x.length}-${Math.random().toString(36).slice(2)}`, title: "", unit: "шт", quantity: "" },
    ]);
  }
  function updateExtra(key: string, patch: Partial<ExtraRow>) {
    setExtras((x) => x.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }
  function removeExtra(key: string) {
    setExtras((x) => x.filter((e) => e.key !== key));
  }

  const progressPayload = useMemo(
    () =>
      Object.entries(qty)
        .map(([estimateItemId, v]) => ({ estimateItemId, quantityActual: Number(v) }))
        .filter((p) => Number.isFinite(p.quantityActual) && p.quantityActual > 0),
    [qty],
  );
  const extrasPayload = useMemo(
    () =>
      extras
        .filter((e) => e.title.trim())
        .map((e) => ({
          title: e.title.trim(),
          unit: e.unit || null,
          quantity: e.quantity ? Number(e.quantity) : null,
        })),
    [extras],
  );

  const canSubmit =
    !submitting && (progressPayload.length > 0 || extrasPayload.length > 0);

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const preset = presets[periodIdx];
      // 1) створити DRAFT
      const createRes = await fetch("/api/foreman/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          periodStart: preset.start.toISOString(),
          periodEnd: preset.end.toISOString(),
        }),
      });
      if (!createRes.ok) throw new Error("Не вдалося створити звіт");
      const { report } = await createRes.json();

      // 2) записати progress + extras
      const patchRes = await fetch(`/api/foreman/reports/${report.id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: progressPayload, extras: extrasPayload }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => null);
        throw new Error(d?.message ?? "Не вдалося зберегти обсяги");
      }

      // 3) submit
      const subRes = await fetch(`/api/foreman/reports/${report.id}/submit`, {
        method: "POST",
      });
      if (!subRes.ok) {
        const d = await subRes.json().catch(() => null);
        throw new Error(d?.message ?? "Не вдалося подати звіт");
      }

      router.push("/foreman/history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setSubmitting(false);
    }
  }

  if (error && items === null) {
    return <p className="p-4 text-sm text-red-600">{error}</p>;
  }
  if (items === null) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin" /> Завантаження робіт…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      {/* Період */}
      <section>
        <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">Період</h2>
        <div className="flex gap-2">
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPeriodIdx(i)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                periodIdx === i
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Роботи кошторису */}
      <section>
        <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">
          Виконані обсяги
        </h2>
        {grouped.length === 0 && (
          <p className="text-sm text-gray-500">Немає робіт, закріплених за вами.</p>
        )}
        <div className="space-y-4">
          {grouped.map((g, gi) => (
            <div key={gi}>
              <p className="text-sm font-semibold text-gray-800 mb-1">{g.name}</p>
              <div className="space-y-2">
                {g.rows.map((it) => (
                  <div
                    key={it.estimateItemId}
                    className="rounded-xl border border-gray-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{it.description}</p>
                    <p className="text-xs text-gray-500 mb-2">
                      План {it.plannedQuantity} {it.unit} · виконано{" "}
                      {it.approvedQuantity} · лишилось {it.remainingQuantity} (
                      {Math.round(it.progressPercent)}%)
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="0"
                        value={qty[it.estimateItemId] ?? ""}
                        onChange={(e) =>
                          setQty((q) => ({ ...q, [it.estimateItemId]: e.target.value }))
                        }
                        className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <span className="text-sm text-gray-500">{it.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Додаткові роботи */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase text-gray-500">
            Додаткові роботи
          </h2>
          <button
            type="button"
            onClick={addExtra}
            className="flex items-center gap-1 text-sm font-medium text-blue-600"
          >
            <Plus size={14} /> Додати
          </button>
        </div>
        <div className="space-y-2">
          {extras.map((e) => (
            <div key={e.key} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  placeholder="Назва роботи"
                  value={e.title}
                  onChange={(ev) => updateExtra(e.key, { title: ev.target.value })}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => removeExtra(e.key)} className="text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Обсяг"
                  value={e.quantity}
                  onChange={(ev) => updateExtra(e.key, { quantity: ev.target.value })}
                  className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <select
                  value={e.unit}
                  onChange={(ev) => updateExtra(e.key, { unit: ev.target.value })}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
                >
                  {ALLOWED_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Подати */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white p-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Подати звіт
        </button>
      </div>
    </div>
  );
}
