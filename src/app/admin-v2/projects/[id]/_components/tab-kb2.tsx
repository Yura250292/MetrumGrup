"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

type KB2Status = "DRAFT" | "ISSUED" | "SIGNED" | "CANCELLED";

type KB2Summary = {
  id: string;
  number: string;
  status: KB2Status;
  periodFrom: string;
  periodTo: string;
  totalAmount: number | string;
  retentionAmount: number | string;
  netPayable: number | string;
  retentionPercent: number | string;
  pdfR2Key: string | null;
  counterparty: { id: string; name: string } | null;
  estimate: { id: string; number: string; title: string } | null;
  _count: { items: number; retentions: number };
};

type EstimateOption = {
  id: string;
  number: string;
  title: string;
  items: Array<{
    id: string;
    description: string;
    unit: string;
    quantity: number | string;
    unitPrice: number | string;
    priceWithMargin: number | string;
    useCustomMargin: boolean;
    sortOrder: number;
    costCodeId: string | null;
    costType: string | null;
  }>;
};

const STATUS_LABELS: Record<KB2Status, string> = {
  DRAFT: "Чернетка",
  ISSUED: "Видано",
  SIGNED: "Підписано",
  CANCELLED: "Скасовано",
};

const STATUS_COLORS: Record<KB2Status, { bg: string; fg: string }> = {
  DRAFT: { bg: T.panelSoft, fg: T.textSecondary },
  ISSUED: { bg: T.amberSoft, fg: T.amber },
  SIGNED: { bg: T.successSoft, fg: T.success },
  CANCELLED: { bg: T.dangerSoft, fg: T.danger },
};

export function TabKB2({
  projectId,
  retentionPercentDefault,
}: {
  projectId: string;
  retentionPercentDefault: number;
}) {
  const [forms, setForms] = useState<KB2Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/kb2`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setForms(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function transition(formId: string, action: "issue" | "sign" | "cancel") {
    const reason = action === "cancel" ? prompt("Причина скасування:") ?? undefined : undefined;
    if (action === "cancel" && !reason) return;
    const res = await fetch(`/api/admin/kb2/${formId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Помилка");
      return;
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <FileText size={18} style={{ color: T.textPrimary }} />
        <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
          Акти виконаних робіт (КБ-2в)
        </h3>
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
        >
          {forms.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
        >
          <Plus size={13} /> Новий акт
        </button>
      </div>

      {showCreate && (
        <CreateKB2Panel
          projectId={projectId}
          retentionPercentDefault={retentionPercentDefault}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
          creating={creating}
          setCreating={setCreating}
        />
      )}

      {loading && forms.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: T.textMuted }}>
          <Loader2 size={14} className="animate-spin" /> Завантажуємо акти…
        </div>
      ) : forms.length === 0 && !showCreate ? (
        <div
          className="rounded-2xl px-6 py-12 text-center text-sm"
          style={{ backgroundColor: T.panelSoft, border: `1px dashed ${T.borderStrong}`, color: T.textMuted }}
        >
          Жодного акту ще не створено. Натисніть «Новий акт» — оберіть позиції з кошторису і відсоток виконання.
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-3 text-left">№</th>
                <th className="px-3 py-3 text-left">Період</th>
                <th className="px-3 py-3 text-left">Замовник</th>
                <th className="px-3 py-3 text-right">Сума</th>
                <th className="px-3 py-3 text-right">Утримання</th>
                <th className="px-3 py-3 text-right">До сплати</th>
                <th className="px-3 py-3 text-center">Статус</th>
                <th className="px-3 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => {
                const sc = STATUS_COLORS[f.status];
                return (
                  <tr key={f.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-4 py-2.5">
                      <span className="font-bold">{f.number}</span>
                      <div className="text-[10px]" style={{ color: T.textMuted }}>
                        {f._count.items} позицій
                        {f._count.retentions > 0 && ` · ${f._count.retentions} утрим.`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {format(new Date(f.periodFrom), "d MMM", { locale: uk })}
                      {" – "}
                      {format(new Date(f.periodTo), "d MMM yy", { locale: uk })}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {f.counterparty?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrencyCompact(Number(f.totalAmount))}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums text-[12px]"
                      style={{ color: T.warning }}
                    >
                      {Number(f.retentionAmount) > 0
                        ? `−${formatCurrencyCompact(Number(f.retentionAmount))}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                      {formatCurrencyCompact(Number(f.netPayable))}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: sc.bg, color: sc.fg }}
                      >
                        {STATUS_LABELS[f.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/admin/kb2/${f.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md p-1.5 hover:bg-black/10"
                          title="Завантажити PDF"
                        >
                          <ExternalLink size={13} style={{ color: T.accentPrimary }} />
                        </a>
                        {f.status === "DRAFT" && (
                          <button
                            onClick={() => transition(f.id, "issue")}
                            className="rounded-md px-2 py-1 text-[11px] font-semibold"
                            style={{ backgroundColor: T.amberSoft, color: T.amber }}
                          >
                            Видати
                          </button>
                        )}
                        {(f.status === "ISSUED" || f.status === "DRAFT") && (
                          <button
                            onClick={() => transition(f.id, "sign")}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
                            style={{ backgroundColor: T.successSoft, color: T.success }}
                          >
                            <CheckCircle2 size={11} /> Підписати
                          </button>
                        )}
                        {f.status !== "CANCELLED" && (
                          <button
                            onClick={() => transition(f.id, "cancel")}
                            className="rounded-md p-1.5 hover:bg-black/10"
                            title="Скасувати"
                          >
                            <XCircle size={13} style={{ color: T.danger }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateKB2Panel({
  projectId,
  retentionPercentDefault,
  onCancel,
  onCreated,
  creating,
  setCreating,
}: {
  projectId: string;
  retentionPercentDefault: number;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const [estimates, setEstimates] = useState<EstimateOption[]>([]);
  const [counterpartyOptions, setCounterpartyOptions] = useState<ComboboxOption[]>([]);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [retentionPercent, setRetentionPercent] = useState(retentionPercentDefault);
  const [notes, setNotes] = useState("");
  // itemId → completedQty
  const [completion, setCompletion] = useState<Record<string, number>>({});
  const [showAllItems, setShowAllItems] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [eRes, cpRes] = await Promise.all([
          fetch(`/api/admin/projects/${projectId}/estimates-with-items`).catch(() => null),
          fetch(`/api/admin/financing/counterparties?take=100`),
        ]);
        // Fallback if dedicated endpoint doesn't exist — use generic /estimates
        if (!eRes || !eRes.ok) {
          const fallback = await fetch(`/api/admin/estimates?projectId=${projectId}&include=items`, {
            cache: "no-store",
          });
          if (fallback.ok && alive) {
            const j = await fallback.json();
            setEstimates(j.data ?? []);
          }
        } else if (alive) {
          const j = await eRes.json();
          setEstimates(j.data ?? []);
        }
        if (alive && cpRes.ok) {
          const j = await cpRes.json();
          setCounterpartyOptions(
            (j.data ?? []).map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
          );
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const estimate = useMemo(
    () => estimates.find((e) => e.id === estimateId) ?? null,
    [estimates, estimateId],
  );

  const items = useMemo(() => {
    if (!estimate) return [];
    return [...estimate.items].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [estimate]);

  const visibleItems = showAllItems ? items : items.filter((it) => (completion[it.id] ?? 0) > 0);

  // Auto-set 100% when picking estimate.
  useEffect(() => {
    if (!estimate) return;
    setCompletion((prev) => {
      const next = { ...prev };
      for (const it of estimate.items) {
        if (next[it.id] === undefined) next[it.id] = Number(it.quantity);
      }
      return next;
    });
  }, [estimate]);

  const totals = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const it of items) {
      const completed = completion[it.id] ?? 0;
      if (completed <= 0) continue;
      const price = it.useCustomMargin ? Number(it.priceWithMargin) : Number(it.unitPrice);
      total += completed * price;
      count++;
    }
    const retentionAmount = (total * retentionPercent) / 100;
    return { total, count, retentionAmount, netPayable: total - retentionAmount };
  }, [items, completion, retentionPercent]);

  async function submit() {
    if (!estimateId || totals.count === 0) {
      alert("Оберіть кошторис і хоча б одну позицію з виконаною кількістю");
      return;
    }
    setCreating(true);
    try {
      const itemsPayload = items
        .filter((it) => (completion[it.id] ?? 0) > 0)
        .map((it, idx) => ({
          estimateItemId: it.id,
          description: it.description,
          unit: it.unit,
          totalQty: Number(it.quantity),
          unitPrice: it.useCustomMargin ? Number(it.priceWithMargin) : Number(it.unitPrice),
          completedQty: completion[it.id] ?? 0,
          costCodeId: it.costCodeId,
          costType: it.costType,
          sortOrder: idx,
        }));

      const res = await fetch(`/api/admin/projects/${projectId}/kb2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateId,
          counterpartyId,
          periodFrom,
          periodTo,
          retentionPercent,
          notes: notes || null,
          items: itemsPayload,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Помилка створення");
        return;
      }
      await onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.accentPrimary}40` }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Кошторис">
          <select
            value={estimateId ?? ""}
            onChange={(e) => setEstimateId(e.target.value || null)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
          >
            <option value="">— оберіть —</option>
            {estimates.map((e) => (
              <option key={e.id} value={e.id}>
                {e.number} — {e.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Замовник">
          <Combobox
            value={counterpartyId}
            options={counterpartyOptions}
            onChange={(id) => setCounterpartyId(id)}
            placeholder="Оберіть…"
            searchPlaceholder="Пошук…"
            emptyMessage="Немає"
          />
        </Field>
        <Field label="Період з">
          <input
            type="date"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}`, color: T.textPrimary, colorScheme: "dark" }}
          />
        </Field>
        <Field label="Період по">
          <input
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}`, color: T.textPrimary, colorScheme: "dark" }}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Утримання, %">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={retentionPercent}
            onChange={(e) => setRetentionPercent(Number(e.target.value))}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
          />
        </Field>
        <Field label="Примітки">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Опціонально"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
          />
        </Field>
      </div>

      {estimate && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
              Позиції ({totals.count} обрано з {items.length})
            </span>
            <button
              type="button"
              onClick={() => setShowAllItems((v) => !v)}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
              style={{ color: T.textSecondary }}
            >
              {showAllItems ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showAllItems ? "Сховати порожні" : "Показати всі"}
            </button>
          </div>
          <div
            className="overflow-x-auto rounded-xl"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, maxHeight: 360 }}
          >
            <table className="w-full text-[12.5px]">
              <thead>
                <tr
                  className="text-[10px] font-bold uppercase tracking-wider sticky top-0"
                  style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
                >
                  <th className="px-2 py-2 text-left">Опис</th>
                  <th className="px-2 py-2 text-right">Усього</th>
                  <th className="px-2 py-2 text-right">Виконано</th>
                  <th className="px-2 py-2 text-right">%</th>
                  <th className="px-2 py-2 text-right">Сума</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((it) => {
                  const completed = completion[it.id] ?? 0;
                  const total = Number(it.quantity);
                  const price = it.useCustomMargin ? Number(it.priceWithMargin) : Number(it.unitPrice);
                  const amount = completed * price;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <tr key={it.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                      <td className="px-2 py-1.5 truncate max-w-[280px]" title={it.description}>
                        {it.description}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: T.textMuted }}>
                        {Number(it.quantity).toFixed(2)} {it.unit}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          min="0"
                          max={total}
                          step="0.01"
                          value={completed}
                          onChange={(e) =>
                            setCompletion((prev) => ({ ...prev, [it.id]: Number(e.target.value) }))
                          }
                          className="w-20 rounded-md px-1.5 py-0.5 text-right text-[12px] tabular-nums"
                          style={{
                            backgroundColor: T.panelSoft,
                            border: `1px solid ${T.borderSoft}`,
                            color: T.textPrimary,
                          }}
                        />
                      </td>
                      <td
                        className="px-2 py-1.5 text-right tabular-nums text-[11px]"
                        style={{ color: pct > 100 ? T.danger : T.textSecondary }}
                      >
                        {pct}%
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {amount > 0 ? formatCurrencyCompact(amount) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[12px]" style={{ color: T.textMuted }}>
                      {showAllItems
                        ? "Кошторис без позицій."
                        : "Жодна позиція ще не виконана. Натисніть «Показати всі» і встановіть виконання."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: T.borderSoft }}>
        <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: T.textSecondary }}>
          <span>
            Всього: <strong style={{ color: T.textPrimary }}>{formatCurrencyCompact(totals.total)}</strong>
          </span>
          {totals.retentionAmount > 0 && (
            <>
              <span style={{ color: T.warning }}>
                Утримання: −{formatCurrencyCompact(totals.retentionAmount)}
              </span>
              <span>
                До сплати: <strong style={{ color: T.success }}>{formatCurrencyCompact(totals.netPayable)}</strong>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-[12px] font-semibold"
            style={{ backgroundColor: T.panel, color: T.textSecondary }}
          >
            Скасувати
          </button>
          <button
            onClick={submit}
            disabled={creating || !estimateId || totals.count === 0}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Створити акт
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}
