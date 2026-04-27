"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Zap,
  Edit2,
  CheckCircle2,
  Users,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { PayrollModal } from "./payroll-modal";
import { TemplateFormModal, type TemplateDraft } from "./template-form-modal";

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

const emptyDraft: TemplateDraft = {
  name: "",
  defaultAmount: "",
  type: "EXPENSE",
  category: "",
  counterparty: "",
  description: "",
  emoji: "",
};

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
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAppliedId, setJustAppliedId] = useState<string | null>(null);
  const [showPayroll, setShowPayroll] = useState(false);

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

  async function handleApply(t: Template, kind: "PLAN" | "FACT" = "FACT") {
    setApplying(`${t.id}:${kind}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/financing/templates/${t.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setJustAppliedId(`${t.id}:${kind}`);
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

  async function handleSave(): Promise<boolean> {
    setError(null);
    const amount = Number(draft.defaultAmount);
    if (!draft.name.trim()) {
      setError("Назва обов'язкова");
      return false;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Сума має бути > 0");
      return false;
    }
    if (!draft.category) {
      setError("Виберіть категорію");
      return false;
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
      await loadTemplates();
      // brief delay so the success state on the modal's Save button is visible
      setTimeout(() => {
        setShowForm(false);
        setEditing(null);
        setDraft(emptyDraft);
      }, 850);
      return true;
    } catch (err: any) {
      setError(err?.message ?? "Помилка");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Видалити шаблон "${t.name}"?`)) return;
    const res = await fetch(`/api/admin/financing/templates/${t.id}`, { method: "DELETE" });
    if (res.ok) await loadTemplates();
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Zap size={15} style={{ color: T.accentPrimary }} className="flex-shrink-0" />
          <span className="text-[13px] font-bold truncate" style={{ color: T.textPrimary }}>
            Швидке додавання — {folderName}
          </span>
          <span className="text-[10px] hidden sm:inline" style={{ color: T.textMuted }}>
            шаблони одним кліком
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShowPayroll(true)}
            title="Нарахування ЗП за період — пакетне створення витрат для активних співробітників"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold"
            style={{
              backgroundColor: T.panel,
              color: T.textPrimary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <Users size={11} /> ЗП
          </button>
          <button
            onClick={() => openForm()}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Plus size={11} /> Новий шаблон
          </button>
        </div>
      </div>

      <PayrollModal
        open={showPayroll}
        folderId={folderId}
        onClose={() => setShowPayroll(false)}
        onSuccess={() => {
          onEntryCreated();
        }}
      />

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
                onApply={(kind) => handleApply(t, kind)}
                onEdit={() => openForm(t)}
                onDelete={() => handleDelete(t)}
                applyingKind={
                  applying === `${t.id}:PLAN`
                    ? "PLAN"
                    : applying === `${t.id}:FACT`
                      ? "FACT"
                      : null
                }
                justAppliedKind={
                  justAppliedId === `${t.id}:PLAN`
                    ? "PLAN"
                    : justAppliedId === `${t.id}:FACT`
                      ? "FACT"
                      : null
                }
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

      <TemplateFormModal
        open={showForm}
        editing={!!editing}
        draft={draft}
        saving={saving}
        error={error}
        onChange={setDraft}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
          setDraft(emptyDraft);
          setError(null);
        }}
        onSave={handleSave}
        onDelete={
          editing
            ? () => {
                const target = editing;
                setShowForm(false);
                setEditing(null);
                handleDelete(target);
              }
            : undefined
        }
      />
    </div>
  );
}

function TemplateCard({
  template,
  onApply,
  onEdit,
  onDelete,
  applyingKind,
  justAppliedKind,
}: {
  template: Template;
  onApply: (kind: "PLAN" | "FACT") => void;
  onEdit: () => void;
  onDelete: () => void;
  applyingKind: "PLAN" | "FACT" | null;
  justAppliedKind: "PLAN" | "FACT" | null;
}) {
  const isIncome = template.type === "INCOME";
  const tint = isIncome ? T.success : T.danger;
  const busy = applyingKind !== null;

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
        <div className="flex items-stretch rounded-lg overflow-hidden" style={{ border: `1px solid ${tint}` }}>
          <button
            onClick={() => onApply("PLAN")}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] font-bold transition hover:bg-black/5 disabled:opacity-50"
            style={{ color: tint, backgroundColor: "transparent" }}
            title="Запланувати — створить запис у статусі План"
          >
            {applyingKind === "PLAN" ? (
              <Loader2 size={10} className="animate-spin" />
            ) : justAppliedKind === "PLAN" ? (
              <CheckCircle2 size={10} />
            ) : (
              <Plus size={10} />
            )}
            {justAppliedKind === "PLAN" ? "План ✓" : "План"}
          </button>
          <div className="w-px" style={{ backgroundColor: tint, opacity: 0.4 }} />
          <button
            onClick={() => onApply("FACT")}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: tint }}
            title="Зафіксувати факт — створить запис у статусі Факт"
          >
            {applyingKind === "FACT" ? (
              <Loader2 size={10} className="animate-spin" />
            ) : justAppliedKind === "FACT" ? (
              <CheckCircle2 size={10} />
            ) : (
              <Plus size={10} />
            )}
            {justAppliedKind === "FACT" ? "Факт ✓" : "Факт"}
          </button>
        </div>
      </div>
    </div>
  );
}
