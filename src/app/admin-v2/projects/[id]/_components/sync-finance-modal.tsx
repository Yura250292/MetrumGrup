"use client";

import { useState } from "react";
import { Sparkles, Loader2, X, Check, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type StagePayload = {
  id: string;
  name: string;
  parentId: string | null;
  notes: string | null;
};

type EntryPayload = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  type: "INCOME" | "EXPENSE";
  kind: "PLAN" | "FACT";
  amount: number;
  counterparty: string | null;
};

type Suggestion = {
  entryId: string;
  stageRecordId: string | null;
  reasoning?: string;
};

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
};

/**
 * AI-синхронізація FinanceEntry проекту з його етапами. Показує запропонований
 * mapping від AI з можливістю редагування, потім apply через POST.
 */
export function SyncFinanceModal({ projectId, open, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [stages, setStages] = useState<StagePayload[]>([]);
  const [entries, setEntries] = useState<EntryPayload[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [reasonings, setReasonings] = useState<Record<string, string>>({});

  async function loadSuggestions() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/sync-finance`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалось отримати пропозиції");
      }
      const json = await res.json();
      setStages(json.data.stages ?? []);
      setEntries(json.data.entries ?? []);
      const m: Record<string, string | null> = {};
      const r: Record<string, string> = {};
      for (const s of (json.data.suggestions ?? []) as Suggestion[]) {
        m[s.entryId] = s.stageRecordId;
        if (s.reasoning) r[s.entryId] = s.reasoning;
      }
      setMapping(m);
      setReasonings(r);
      if (json.info) setInfo(json.info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const mappings = Object.entries(mapping).map(([entryId, stageRecordId]) => ({
        entryId,
        stageRecordId,
      }));
      const res = await fetch(`/api/admin/projects/${projectId}/sync-finance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалось застосувати");
      }
      onApplied?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: T.violet }} />
            <h2
              className="text-[15px] font-bold"
              style={{ color: T.textPrimary }}
            >
              AI-синхронізація фінансування з етапами
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:brightness-[0.97]"
            style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!loading && entries.length === 0 && stages.length === 0 && !info && !error && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Sparkles size={32} style={{ color: T.violet }} />
              <p className="text-[13px]" style={{ color: T.textSecondary }}>
                AI проаналізує усі фінансові записи проекту і запропонує до якого
                етапу віднести кожен. Ти зможеш переглянути і скоригувати перед
                застосуванням.
              </p>
              <button
                type="button"
                onClick={loadSuggestions}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97]"
                style={{ backgroundColor: T.violet }}
              >
                <Sparkles size={14} /> Запросити пропозиції AI
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-12">
              <Loader2 size={18} className="animate-spin" style={{ color: T.violet }} />
              <span className="text-[13px]" style={{ color: T.textSecondary }}>
                AI обробляє записи…
              </span>
            </div>
          )}

          {info && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
              style={{
                backgroundColor: T.warningSoft,
                color: T.textPrimary,
                border: `1px solid ${T.warning}55`,
              }}
            >
              <AlertCircle size={13} style={{ color: T.warning }} />
              {info}
            </div>
          )}

          {error && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
              style={{
                backgroundColor: T.dangerSoft ?? "#FEE2E2",
                color: T.danger,
                border: `1px solid ${T.danger}55`,
              }}
            >
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          {!loading && entries.length > 0 && (
            <div className="flex flex-col gap-2 mt-3">
              {entries.map((e) => {
                const sel = mapping[e.id] ?? null;
                const reasoning = reasonings[e.id];
                return (
                  <div
                    key={e.id}
                    className="rounded-xl p-3"
                    style={{
                      backgroundColor: T.panelElevated,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              color: e.type === "INCOME" ? T.emerald : T.danger,
                            }}
                          >
                            {e.kind} · {e.type === "INCOME" ? "Дохід" : "Витрата"}
                          </span>
                          <span
                            className="text-[13px] font-semibold truncate"
                            style={{ color: T.textPrimary }}
                          >
                            {e.title}
                          </span>
                        </div>
                        <span
                          className="text-[11px]"
                          style={{ color: T.textMuted }}
                        >
                          {e.category}
                          {e.subcategory ? ` / ${e.subcategory}` : ""} · {e.amount.toLocaleString("uk-UA")} ₴
                        </span>
                        {reasoning && (
                          <span
                            className="text-[10.5px] mt-1 italic"
                            style={{ color: T.textSecondary }}
                          >
                            AI: {reasoning}
                          </span>
                        )}
                      </div>
                      <select
                        value={sel ?? ""}
                        onChange={(ev) =>
                          setMapping((prev) => ({
                            ...prev,
                            [e.id]: ev.target.value || null,
                          }))
                        }
                        className="rounded-lg px-2.5 py-1.5 text-[12px] outline-none min-w-[180px]"
                        style={{
                          backgroundColor: T.panelSoft,
                          border: `1px solid ${T.borderStrong}`,
                          color: T.textPrimary,
                        }}
                      >
                        <option value="">— Без етапу</option>
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.parentId ? "  └ " : ""}{s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {entries.length > 0 && (
          <div
            className="flex items-center justify-between gap-3 px-5 py-4"
            style={{ borderTop: `1px solid ${T.borderSoft}` }}
          >
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {entries.length} записів. Етапи отримають allocatedBudget = сума
              PLAN-EXPENSE прив'язаних записів.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={applying}
                className="rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.97]"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={applying}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
                style={{ backgroundColor: T.violet }}
              >
                {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {applying ? "Застосовую…" : "Застосувати"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
