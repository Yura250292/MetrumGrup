"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Save,
  PlusCircle,
  Paperclip,
  Trash2,
  FileText,
  MessageCircle,
  Calculator,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { financeCategoriesForType } from "@/lib/constants";
import { CommentThread } from "@/components/collab/CommentThread";
import type { FinanceEntryDTO, FinanceEntryStatus, ProjectOption } from "./types";
import { FINANCE_STATUS_LABELS, FINANCE_STATUS_COLORS } from "./types";

export type EntryFormValues = {
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  amount: string;
  occurredAt: string;
  projectId: string;
  folderId: string;
  category: string;
  subcategory: string;
  title: string;
  description: string;
  counterparty: string;
  pendingFiles: File[];
};

export function EntryFormModal({
  mode,
  initial,
  preset,
  projects,
  scope,
  folderContext,
  currentUserId: _currentUserId,
  currentUserName,
  onClose,
  onSave,
  onStatusChange,
}: {
  mode: "create" | "edit";
  initial: FinanceEntryDTO | null;
  preset?: { kind: "PLAN" | "FACT"; type: "INCOME" | "EXPENSE"; folderId?: string; folderName?: string };
  projects: ProjectOption[];
  scope?: { id: string; title: string };
  folderContext?: { id: string; name: string } | null;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onSave: (values: EntryFormValues, andCreateAnother: boolean) => Promise<void>;
  onStatusChange?: (entry: FinanceEntryDTO, newStatus: FinanceEntryStatus) => Promise<void>;
}) {
  const contextFolderId = preset?.folderId ?? folderContext?.id ?? null;
  const contextFolderName = preset?.folderName ?? folderContext?.name ?? null;

  const [values, setValues] = useState<EntryFormValues>(() => {
    if (initial) {
      return {
        kind: initial.kind,
        type: initial.type,
        amount: String(Number(initial.amount)),
        occurredAt: initial.occurredAt.slice(0, 10),
        projectId: initial.projectId ?? "",
        folderId: initial.folderId ?? "",
        category: initial.category,
        subcategory: initial.subcategory ?? "",
        title: initial.title,
        description: initial.description ?? "",
        counterparty: initial.counterparty ?? "",
        pendingFiles: [],
      };
    }
    return {
      kind: preset?.kind ?? "FACT",
      type: preset?.type ?? "EXPENSE",
      amount: "",
      occurredAt: new Date().toISOString().slice(0, 10),
      projectId: scope ? scope.id : "",
      folderId: contextFolderId ?? "",
      category: "",
      subcategory: "",
      title: "",
      description: "",
      counterparty: "",
      pendingFiles: [],
    };
  });

  const folderLocked = mode === "create" && !!contextFolderId;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState(initial?.attachments ?? []);

  const availableCategories = useMemo(
    () => financeCategoriesForType(values.type),
    [values.type]
  );

  const isAutoFromEstimate = mode === "edit" && initial?.source === "ESTIMATE_AUTO";

  useEffect(() => {
    if (values.category) {
      const stillValid = availableCategories.some((c) => c.key === values.category);
      if (!stillValid) setValues((p) => ({ ...p, category: "" }));
    }
  }, [availableCategories, values.category]);

  async function handleSubmit(e: React.FormEvent, andCreateAnother: boolean) {
    e.preventDefault();
    setError(null);

    const amountNum = Number(values.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Сума має бути більшою за 0");
      return;
    }
    if (!values.title.trim()) {
      setError("Назва обов'язкова");
      return;
    }
    if (!values.category) {
      setError("Виберіть категорію");
      return;
    }

    const projectId = scope ? scope.id : values.projectId;
    const folderId = folderLocked ? (contextFolderId ?? "") : values.folderId;

    if (!scope && !projectId && !folderId) {
      setError("Виберіть проєкт або папку");
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...values, projectId, folderId }, andCreateAnother);
      if (andCreateAnother) {
        setValues((p) => ({
          ...p,
          amount: "",
          title: "",
          description: "",
          counterparty: "",
          subcategory: "",
          pendingFiles: [],
        }));
      }
    } catch (err: any) {
      setError(err?.message ?? "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAttachment(attId: string) {
    if (!initial) return;
    if (!confirm("Видалити файл?")) return;
    setDeletingAttachment(attId);
    try {
      const res = await fetch(
        `/api/admin/financing/${initial.id}/attachments/${attId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
      }
    } finally {
      setDeletingAttachment(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          <div>
            <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>
              {mode === "edit" ? "Редагувати операцію" : "Нова операція"}
            </h3>
            <p className="text-[11px]" style={{ color: T.textMuted }}>
              {mode === "edit"
                ? "Зміни запишуться в історію"
                : `Автор: ${currentUserName}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Закрити">
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="flex flex-col gap-4 p-6">
          {isAutoFromEstimate && (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3"
              style={{ backgroundColor: T.accentPrimarySoft, border: `1px solid ${T.accentPrimary}40` }}
            >
              <Lock size={14} style={{ color: T.accentPrimary }} className="mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-[12px] font-bold" style={{ color: T.accentPrimary }}>
                  Запис синхронізовано з кошторису
                </span>
                <span className="text-[11px]" style={{ color: T.textSecondary }}>
                  Сума, категорія та опис керуються у
                  {initial?.estimate ? (
                    <Link
                      href={`/admin/estimates/${initial.estimate.id}`}
                      className="mx-1 inline-flex items-center gap-1 underline"
                      style={{ color: T.accentPrimary }}
                    >
                      <Calculator size={10} /> кошторисі {initial.estimate.number}
                    </Link>
                  ) : (
                    " пов'язаному кошторисі"
                  )}
                  . Тут можна лише змінювати статус та прикріплювати файли.
                </span>
              </div>
            </div>
          )}

          {/* Status workflow (edit mode only) */}
          {mode === "edit" && initial && onStatusChange && (
            <div
              className="flex items-center gap-2 rounded-xl p-3"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <span className="text-[10px] font-bold tracking-wider mr-2" style={{ color: T.textMuted }}>
                СТАТУС:
              </span>
              <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${FINANCE_STATUS_COLORS[initial.status]}`}>
                {FINANCE_STATUS_LABELS[initial.status]}
              </span>
              <div className="ml-auto flex gap-1.5">
                {initial.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => onStatusChange(initial, "PENDING")}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary, border: `1px solid ${T.accentPrimary}` }}
                  >
                    На погодження
                  </button>
                )}
                {initial.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => onStatusChange(initial, "APPROVED")}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    style={{ backgroundColor: "#dbeafe", color: "#1d4ed8", border: "1px solid #1d4ed8" }}
                  >
                    Підтвердити
                  </button>
                )}
                {(initial.status === "APPROVED" || initial.status === "PENDING") && (
                  <button
                    type="button"
                    onClick={() => onStatusChange(initial, "PAID")}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    style={{ backgroundColor: "#dcfce7", color: "#166534", border: "1px solid #166534" }}
                  >
                    Оплачено
                  </button>
                )}
                {initial.status !== "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => onStatusChange(initial, "DRAFT")}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    style={{ backgroundColor: T.panelElevated, color: T.textMuted, border: `1px solid ${T.borderStrong}` }}
                  >
                    Повернути в чернетку
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Kind + Type segmented controls */}
          <fieldset disabled={isAutoFromEstimate} className="contents">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span
                className="text-[10px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                ВИД ЗАПИСУ *
              </span>
              <div
                className="grid grid-cols-2 gap-1 rounded-xl p-1"
                style={{ backgroundColor: T.panelSoft }}
              >
                {(["PLAN", "FACT"] as const).map((k) => {
                  const active = values.kind === k;
                  const label = k === "PLAN" ? "План" : "Факт";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setValues((p) => ({ ...p, kind: k }))}
                      className="rounded-lg px-3 py-2 text-sm font-bold transition"
                      style={{
                        backgroundColor: active
                          ? k === "PLAN"
                            ? T.accentPrimarySoft
                            : T.successSoft
                          : "transparent",
                        color: active
                          ? k === "PLAN"
                            ? T.accentPrimary
                            : T.success
                          : T.textMuted,
                        border: `1px solid ${active ? (k === "PLAN" ? T.accentPrimary : T.success) : "transparent"}`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span
                className="text-[10px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                ТИП *
              </span>
              <div
                className="grid grid-cols-2 gap-1 rounded-xl p-1"
                style={{ backgroundColor: T.panelSoft }}
              >
                {(["INCOME", "EXPENSE"] as const).map((t) => {
                  const active = values.type === t;
                  const isIncome = t === "INCOME";
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setValues((p) => ({ ...p, type: t }))}
                      className="rounded-lg px-3 py-2 text-sm font-bold transition"
                      style={{
                        backgroundColor: active
                          ? isIncome
                            ? T.successSoft
                            : T.dangerSoft
                          : "transparent",
                        color: active
                          ? isIncome
                            ? T.success
                            : T.danger
                          : T.textMuted,
                        border: `1px solid ${active ? (isIncome ? T.success : T.danger) : "transparent"}`,
                      }}
                    >
                      {isIncome ? "+ Дохід" : "− Витрата"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Folder context banner (create-in-block) */}
          {!scope && folderLocked && contextFolderName && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <div>
                <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                  У папці: {contextFolderName}
                </span>
                <p className="text-[10px]" style={{ color: T.textMuted }}>
                  Запис прив'яжеться до цієї папки автоматично
                </p>
              </div>
            </div>
          )}

          {/* Grid of inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!scope && !folderLocked && (
              <Field label="Проєкт">
                <select
                  value={values.projectId}
                  onChange={(e) => setValues((p) => ({ ...p, projectId: e.target.value }))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                >
                  <option value="">— без проєкту —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Категорія" required>
              <select
                value={values.category}
                onChange={(e) => setValues((p) => ({ ...p, category: e.target.value }))}
                required
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              >
                <option value="">— виберіть —</option>
                {availableCategories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Підкатегорія">
              <input
                value={values.subcategory}
                onChange={(e) => setValues((p) => ({ ...p, subcategory: e.target.value }))}
                placeholder="Опціонально"
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>

            <Field label="Сума, ₴" required>
              <input
                type="number"
                step="0.01"
                min="0"
                value={values.amount}
                onChange={(e) => setValues((p) => ({ ...p, amount: e.target.value }))}
                required
                placeholder="0"
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>

            <Field label={values.kind === "PLAN" ? "Запланована дата" : "Дата операції"} required>
              <input
                type="date"
                value={values.occurredAt}
                onChange={(e) => setValues((p) => ({ ...p, occurredAt: e.target.value }))}
                required
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                  colorScheme: "dark",
                }}
              />
            </Field>

            <Field label="Контрагент">
              <input
                value={values.counterparty}
                onChange={(e) => setValues((p) => ({ ...p, counterparty: e.target.value }))}
                placeholder="Опціонально"
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Коротка назва" required>
                <input
                  value={values.title}
                  onChange={(e) => setValues((p) => ({ ...p, title: e.target.value }))}
                  required
                  placeholder={
                    values.kind === "PLAN"
                      ? "Напр. «Закупка бетону на фундамент (план)»"
                      : "Напр. «Бетон М300 для фундаменту»"
                  }
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Коментар">
                <textarea
                  value={values.description}
                  onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="Деталі, номер чеку, уточнення…"
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>
            </div>
          </div>
          </fieldset>

          {/* Attachments */}
          <div className="flex flex-col gap-2">
            <span
              className="text-[10px] font-bold tracking-wider"
              style={{ color: T.textMuted }}
            >
              ВКЛАДЕННЯ
            </span>

            {existingAttachments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {existingAttachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <FileText size={14} style={{ color: T.accentPrimary }} />
                    <span
                      className="flex-1 text-[12px] truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {a.originalName}
                    </span>
                    <span className="text-[10px]" style={{ color: T.textMuted }}>
                      {(a.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(a.id)}
                      disabled={deletingAttachment === a.id}
                      className="rounded-md p-1"
                      style={{ color: T.danger }}
                    >
                      {deletingAttachment === a.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px dashed ${T.borderStrong}`,
                color: T.textSecondary,
              }}
            >
              <Paperclip size={14} />
              Додати файли (чек, фото, PDF)
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) {
                    setValues((p) => ({
                      ...p,
                      pendingFiles: [...p.pendingFiles, ...files],
                    }));
                  }
                  e.target.value = "";
                }}
              />
            </label>

            {values.pendingFiles.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {values.pendingFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: T.accentPrimarySoft,
                      border: `1px solid ${T.borderAccent}`,
                    }}
                  >
                    <FileText size={14} style={{ color: T.accentPrimary }} />
                    <span
                      className="flex-1 text-[12px] truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {f.name}
                    </span>
                    <span className="text-[10px]" style={{ color: T.textMuted }}>
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setValues((p) => ({
                          ...p,
                          pendingFiles: p.pendingFiles.filter((_, i) => i !== idx),
                        }))
                      }
                      className="rounded-md p-1"
                      style={{ color: T.danger }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments section (edit mode only) */}
          {mode === "edit" && initial && (
            <div className="border-t pt-4" style={{ borderColor: T.borderSoft }}>
              <CommentThread entityType="FINANCE_ENTRY" entityId={initial.id} />
            </div>
          )}

          {error && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}`,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div
            className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap justify-end gap-2 border-t px-6 py-4"
            style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ color: T.textSecondary }}
            >
              Скасувати
            </button>
            {mode === "create" && (
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={saving || isAutoFromEstimate}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.accentPrimary,
                  border: `1px solid ${T.borderAccent}`,
                }}
              >
                <PlusCircle size={14} /> Зберегти і створити нову
              </button>
            )}
            <button
              type="submit"
              disabled={saving || isAutoFromEstimate}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
              title={isAutoFromEstimate ? "Редагуйте через кошторис" : undefined}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Зберегти
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label.toUpperCase()}
        {required && (
          <span className="ml-1" style={{ color: T.danger }}>
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

