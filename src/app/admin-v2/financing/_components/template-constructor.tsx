"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Zap,
  Edit2,
  Trash2,
  X,
  Save,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { FINANCE_CATEGORIES, financeCategoriesForType } from "@/lib/constants";

type Template = {
  id: string;
  name: string;
  defaultAmount: number;
  type: "EXPENSE" | "INCOME";
  category: string;
  counterparty: string | null;
  description: string | null;
  emoji: string | null;
  sortOrder: number;
};

type DraftState = {
  name: string;
  defaultAmount: string;
  type: "EXPENSE" | "INCOME";
  category: string;
  counterparty: string;
  description: string;
  emoji: string;
};

const emptyDraft: DraftState = {
  name: "",
  defaultAmount: "",
  type: "EXPENSE",
  category: "",
  counterparty: "",
  description: "",
  emoji: "",
};

const EMOJI_SUGGESTIONS = ["💰", "🏢", "🍪", "☕", "🧻", "💻", "⚡", "📄", "🔧", "🚗", "🍕", "📦"];

export function TemplateConstructor({
  folderId,
  folderName,
  onEntryCreated,
}: {
  folderId: string;
  folderName: string;
  onEntryCreated: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAppliedId, setJustAppliedId] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/financing/templates?folderId=${folderId}`);
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(t: Template) {
    setApplying(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/financing/templates/${t.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setJustAppliedId(t.id);
      setTimeout(() => setJustAppliedId(null), 1500);
      onEntryCreated();
    } catch (err: any) {
      setError(err?.message ?? "Помилка");
    } finally {
      setApplying(null);
    }
  }

  function openForm(template?: Template) {
    if (template) {
      setEditing(template);
      setDraft({
        name: template.name,
        defaultAmount: String(template.defaultAmount),
        type: template.type,
        category: template.category,
        counterparty: template.counterparty ?? "",
        description: template.description ?? "",
        emoji: template.emoji ?? "",
      });
    } else {
      setEditing(null);
      setDraft(emptyDraft);
    }
    setShowForm(true);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    const amount = Number(draft.defaultAmount);
    if (!draft.name.trim()) {
      setError("Назва обов'язкова");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Сума має бути > 0");
      return;
    }
    if (!draft.category) {
      setError("Виберіть категорію");
      return;
    }

    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/financing/templates/${editing.id}`
        : `/api/admin/financing/templates`;
      const method = editing ? "PATCH" : "POST";
      const body = {
        ...(editing ? {} : { folderId }),
        name: draft.name.trim(),
        defaultAmount: amount,
        type: draft.type,
        category: draft.category,
        counterparty: draft.counterparty.trim() || null,
        description: draft.description.trim() || null,
        emoji: draft.emoji.trim() || null,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setShowForm(false);
      setEditing(null);
      setDraft(emptyDraft);
      await loadTemplates();
    } catch (err: any) {
      setError(err?.message ?? "Помилка");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Видалити шаблон "${t.name}"?`)) return;
    const res = await fetch(`/api/admin/financing/templates/${t.id}`, { method: "DELETE" });
    if (res.ok) await loadTemplates();
  }

  const availableCategories = useMemo(() => financeCategoriesForType(draft.type), [draft.type]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
      >
        <div className="flex items-center gap-2">
          <Zap size={15} style={{ color: T.accentPrimary }} />
          <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Швидке додавання — {folderName}
          </span>
          <span className="text-[10px]" style={{ color: T.textMuted }}>
            шаблони одним кліком
          </span>
        </div>
        <button
          onClick={() => openForm()}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={11} /> Новий шаблон
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
            <Loader2 size={13} className="animate-spin" /> Завантаження…
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" style={{ color: T.textMuted }}>
            <Zap size={24} style={{ color: T.accentPrimary }} />
            <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
              Немає шаблонів
            </span>
            <span className="text-[11px]">
              Створіть шаблони частих витрат (чай, оренда, зарплата...) щоб додавати їх одним кліком
            </span>
            <button
              onClick={() => openForm()}
              className="mt-1 flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Plus size={11} /> Створити перший шаблон
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onApply={() => handleApply(t)}
                onEdit={() => openForm(t)}
                onDelete={() => handleDelete(t)}
                applying={applying === t.id}
                justApplied={justAppliedId === t.id}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-[11px]"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}`,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowForm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: T.borderSoft }}
            >
              <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
                {editing ? "Редагувати шаблон" : "Новий шаблон"}
              </h3>
              <button onClick={() => setShowForm(false)}>
                <X size={18} style={{ color: T.textMuted }} />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-5">
              {/* Type */}
              <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ backgroundColor: T.panelSoft }}>
                {(["EXPENSE", "INCOME"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, type: t, category: "" }))}
                    className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold"
                    style={{
                      backgroundColor: draft.type === t
                        ? (t === "EXPENSE" ? T.danger : T.success)
                        : "transparent",
                      color: draft.type === t ? "#fff" : T.textSecondary,
                    }}
                  >
                    {t === "EXPENSE" ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                    {t === "EXPENSE" ? "Витрата" : "Дохід"}
                  </button>
                ))}
              </div>

              {/* Name + emoji */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.emoji}
                  onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
                  placeholder="🎯"
                  className="w-14 rounded-xl px-2 py-2.5 text-center text-[18px] outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                  }}
                  maxLength={4}
                />
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Наприклад: Чай, Оренда, Зарплата менеджера"
                  className="flex-1 rounded-xl px-3 py-2.5 text-[13px] outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </div>

              {/* Emoji suggestions */}
              <div className="flex flex-wrap gap-1">
                {EMOJI_SUGGESTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, emoji: e }))}
                    className="w-8 h-8 rounded-lg text-[16px]"
                    style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
                  >
                    {e}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  СУМА ЗА ЗАМОВЧУВАННЯМ (₴)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={draft.defaultAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, defaultAmount: e.target.value }))}
                  placeholder="1000"
                  className="w-full rounded-xl px-3 py-2.5 text-[14px] font-bold outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  КАТЕГОРІЯ
                </span>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                >
                  <option value="">— Оберіть —</option>
                  {availableCategories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Counterparty */}
              <input
                type="text"
                value={draft.counterparty}
                onChange={(e) => setDraft((d) => ({ ...d, counterparty: e.target.value }))}
                placeholder="Контрагент (опційно)"
                className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />

              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-[11px]"
                  style={{
                    backgroundColor: T.dangerSoft,
                    color: T.danger,
                    border: `1px solid ${T.danger}`,
                  }}
                >
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                {editing && (
                  <button
                    onClick={() => {
                      handleDelete(editing);
                      setShowForm(false);
                    }}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-[11px] font-semibold"
                    style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
                  >
                    <Trash2 size={11} /> Видалити
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => setShowForm(false)}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{ color: T.textSecondary }}
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-lg px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: T.accentPrimary }}
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Зберегти
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onApply,
  onEdit,
  onDelete,
  applying,
  justApplied,
}: {
  template: Template;
  onApply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  applying: boolean;
  justApplied: boolean;
}) {
  const isIncome = template.type === "INCOME";
  const tint = isIncome ? T.success : T.danger;

  return (
    <div
      className="group rounded-xl p-3 flex flex-col gap-2 transition"
      style={{
        backgroundColor: isIncome ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.05)",
        border: `1px solid ${isIncome ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)"}`,
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-[18px] leading-none flex-shrink-0 w-6 text-center">
          {template.emoji || (isIncome ? "💰" : "💸")}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold truncate" style={{ color: T.textPrimary }}>
            {template.name}
          </div>
          <div className="text-[10px]" style={{ color: T.textMuted }}>
            {isIncome ? "Дохід" : "Витрата"}
            {template.counterparty && ` · ${template.counterparty}`}
          </div>
        </div>
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 transition"
          style={{ color: T.textMuted }}
          title="Редагувати"
        >
          <Edit2 size={12} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-bold" style={{ color: tint }}>
          {isIncome ? "+" : "−"}
          {formatCurrency(template.defaultAmount)}
        </span>
        <button
          onClick={onApply}
          disabled={applying}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          style={{ backgroundColor: tint }}
        >
          {applying ? (
            <Loader2 size={11} className="animate-spin" />
          ) : justApplied ? (
            <CheckCircle2 size={11} />
          ) : (
            <Plus size={11} />
          )}
          {justApplied ? "Додано" : "Додати"}
        </button>
      </div>
    </div>
  );
}
