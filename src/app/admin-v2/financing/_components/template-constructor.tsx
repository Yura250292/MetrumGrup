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
        className="flex items-center justify-between gap-3 px-5 py-4 border-b"
        style={{ borderColor: T.borderSoft }}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold tracking-tight" style={{ color: T.textPrimary }}>
              Шаблони повторних витрат
            </span>
            {templates.length > 0 && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                {templates.length}
              </span>
            )}
          </div>
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {folderName} · повторні нарахування одним кліком
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowPayroll(true)}
            title="Нарахування ЗП за період — пакетне створення витрат для активних співробітників"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:bg-black/[0.04]"
            style={{
              backgroundColor: "transparent",
              color: T.textPrimary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <Users size={13} /> Нарахувати ЗП
          </button>
          <button
            onClick={() => openForm()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Plus size={13} /> Новий шаблон
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

      <div className="p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
            <Loader2 size={13} className="animate-spin" /> Завантаження…
          </div>
        ) : templates.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 py-10 px-6 text-center rounded-xl border-dashed border"
            style={{ borderColor: T.borderStrong, color: T.textMuted }}
          >
            <div
              className="rounded-full p-2.5"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <Zap size={20} style={{ color: T.textSecondary }} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[13.5px] font-semibold" style={{ color: T.textPrimary }}>
                Шаблонів поки немає
              </span>
              <span className="text-[11.5px] max-w-[420px]" style={{ color: T.textMuted }}>
                Оренда, інтернет, бухпослуги, готівкові ЗП — все що повторюється щомісяця.
                Створіть один раз — далі додавайте у фінанси одним кліком.
              </span>
            </div>
            <button
              onClick={() => openForm()}
              className="mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Plus size={13} /> Створити перший шаблон
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
      className="group rounded-xl p-4 flex flex-col gap-3.5 transition relative"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      {/* Type indicator — тонка ліва смуга замість кольорового фону */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
        style={{ backgroundColor: tint, opacity: 0.85 }}
      />

      {/* Header: emoji + назва + edit */}
      <div className="flex items-start gap-3 pl-2">
        {template.emoji && (
          <span className="text-[20px] leading-none flex-shrink-0 mt-0.5 select-none">
            {template.emoji}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div
            className="text-[13.5px] font-semibold leading-tight tracking-tight truncate"
            style={{ color: T.textPrimary }}
          >
            {template.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px]" style={{ color: T.textMuted }}>
            <span
              className="rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider text-[9.5px]"
              style={{
                color: tint,
                backgroundColor: isIncome ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.07)",
              }}
            >
              {isIncome ? "Дохід" : "Витрата"}
            </span>
            {template.counterparty && (
              <span className="truncate" title={template.counterparty}>
                {template.counterparty}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 transition rounded-md p-1 hover:bg-black/5"
          style={{ color: T.textMuted }}
          title="Редагувати"
        >
          <Edit2 size={13} />
        </button>
      </div>

      {/* Сума — головна цифра картки */}
      <div className="pl-2 flex items-baseline gap-1.5">
        <span
          className="text-[22px] font-bold tabular-nums leading-none tracking-tight"
          style={{ color: T.textPrimary }}
        >
          {isIncome ? "+" : "−"}
          {formatCurrency(template.defaultAmount)}
        </span>
        <span className="text-[10.5px] font-medium" style={{ color: T.textMuted }}>
          за замовчуванням
        </span>
      </div>

      {/* Дії — primary FACT + secondary PLAN */}
      <div className="grid grid-cols-2 gap-2 pl-2">
        <button
          onClick={() => onApply("PLAN")}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition disabled:opacity-50"
          style={{
            color: T.textSecondary,
            backgroundColor: "transparent",
            border: `1px solid ${T.borderStrong}`,
          }}
          title="Запланувати — створить запис у статусі План"
        >
          {applyingKind === "PLAN" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : justAppliedKind === "PLAN" ? (
            <CheckCircle2 size={12} style={{ color: T.success }} />
          ) : null}
          {justAppliedKind === "PLAN" ? "Заплановано" : "Запланувати"}
        </button>
        <button
          onClick={() => onApply("FACT")}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          style={{ backgroundColor: tint }}
          title="Зафіксувати факт — створить запис у статусі Факт"
        >
          {applyingKind === "FACT" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : justAppliedKind === "FACT" ? (
            <CheckCircle2 size={12} />
          ) : null}
          {justAppliedKind === "FACT" ? "Додано" : "Зафіксувати"}
        </button>
      </div>
    </div>
  );
}
