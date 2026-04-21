"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Loader2,
  Save,
  Upload,
  Sparkles,
  FileText,
  RefreshCw,
  Plus,
  Trash2,
  Users,
  Briefcase,
  AlertTriangle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectOption } from "./types";

type ParsedItem = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: string | null;
};

type SideState = {
  file: File | null;
  scanning: boolean;
  scanned: boolean;
  items: ParsedItem[];
  totalAmount: number;
  error: string | null;
  warnings: string[];
};

const emptySide: SideState = {
  file: null,
  scanning: false,
  scanned: false,
  items: [],
  totalAmount: 0,
  error: null,
  warnings: [],
};

export function EstimateUploadModal({
  projects,
  scope,
  defaultProjectId,
  onClose,
  onCreated,
}: {
  projects: ProjectOption[];
  scope?: { id: string; title: string };
  defaultProjectId?: string | null;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(
    scope?.id ?? defaultProjectId ?? "",
  );
  const [client, setClient] = useState<SideState>(emptySide);
  const [internal, setInternal] = useState<SideState>(emptySide);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflictPair, setConflictPair] = useState<
    | null
    | { resolve: "replace" | "new_version"; ask: boolean }
  >(null);

  const projectLocked = !!scope;

  async function handleFileSelect(
    file: File,
    side: "client" | "internal",
  ) {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const nameLower = file.name.toLowerCase();
    const allowedExt = /\.(pdf|jpg|jpeg|png|webp|xlsx|xls)$/.test(nameLower);
    if (!allowedTypes.includes(file.type) && !allowedExt) {
      updateSide(side, { error: "Підтримуються Excel, PDF, JPG, PNG, WebP" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      updateSide(side, { error: "Файл завеликий (макс 20 МБ)" });
      return;
    }

    updateSide(side, {
      file,
      scanning: true,
      scanned: false,
      error: null,
      items: [],
      totalAmount: 0,
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/estimates/parse-file", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      updateSide(side, {
        scanning: false,
        scanned: true,
        items: data.items || [],
        totalAmount: data.totalAmount || 0,
        error: null,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      });
    } catch (err: any) {
      updateSide(side, {
        scanning: false,
        scanned: false,
        error: err?.message ?? "AI розпізнавання не вдалося",
      });
    }
  }

  function updateSide(side: "client" | "internal", patch: Partial<SideState>) {
    if (side === "client") setClient((p) => ({ ...p, ...patch }));
    else setInternal((p) => ({ ...p, ...patch }));
  }

  function updateItem(
    side: "client" | "internal",
    idx: number,
    patch: Partial<ParsedItem>,
  ) {
    const setter = side === "client" ? setClient : setInternal;
    setter((p) => {
      const items = [...p.items];
      items[idx] = { ...items[idx], ...patch };
      if ("quantity" in patch || "unitPrice" in patch) {
        items[idx].totalPrice = items[idx].quantity * items[idx].unitPrice;
      }
      const totalAmount = items.reduce((s, i) => s + (i.totalPrice || 0), 0);
      return { ...p, items, totalAmount };
    });
  }

  function removeItem(side: "client" | "internal", idx: number) {
    const setter = side === "client" ? setClient : setInternal;
    setter((p) => {
      const items = p.items.filter((_, i) => i !== idx);
      const totalAmount = items.reduce((s, i) => s + (i.totalPrice || 0), 0);
      return { ...p, items, totalAmount };
    });
  }

  function addItem(side: "client" | "internal") {
    const setter = side === "client" ? setClient : setInternal;
    setter((p) => ({
      ...p,
      items: [
        ...p.items,
        { description: "", unit: "шт", quantity: 1, unitPrice: 0, totalPrice: 0, category: null },
      ],
    }));
  }

  async function handleSubmit(options?: { replaceExisting?: boolean; createNewVersion?: boolean }) {
    setSubmitError(null);

    if (!projectId) {
      setSubmitError("Оберіть проєкт");
      return;
    }
    if (client.items.length === 0 && internal.items.length === 0) {
      setSubmitError("Має бути принаймні один кошторис з позиціями");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        projectId,
        ...options,
      };
      if (client.items.length > 0) {
        body.clientEstimate = {
          items: client.items,
          totalAmount: client.totalAmount,
          fileName: client.file?.name,
          fileMime: client.file?.type,
        };
      }
      if (internal.items.length > 0) {
        body.internalEstimate = {
          items: internal.items,
          totalAmount: internal.totalAmount,
          fileName: internal.file?.name,
          fileMime: internal.file?.type,
        };
      }

      const res = await fetch("/api/admin/estimates/create-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        // Existing pair — show dialog
        setSaving(false);
        setConflictPair({ resolve: "replace", ask: true });
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      onCreated(data.estimateGroupId);
      router.push(`/admin-v2/estimates/compare/${data.estimateGroupId}`);
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!projectId && (client.items.length > 0 || internal.items.length > 0) && !saving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: T.accentPrimary }} />
            <div>
              <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Завантажити кошториси
              </h3>
              <p className="text-[11px]" style={{ color: T.textMuted }}>
                2 файли: для клієнта (з націнкою) і для Metrum (собівартість)
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрити">
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-6">
          {/* Project selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ПРОЄКТ *
            </span>
            {projectLocked ? (
              <div
                className="rounded-xl px-3.5 py-3 text-sm"
                style={{
                  backgroundColor: T.accentPrimarySoft,
                  border: `1px solid ${T.accentPrimary}40`,
                  color: T.accentPrimary,
                }}
              >
                📁 {scope!.title}
              </div>
            ) : (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              >
                <option value="">— Оберіть проєкт —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Two upload slots side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SideUploader
              side="client"
              label="Кошторис для клієнта"
              hint="з націнкою, те що платить клієнт"
              icon={<Users size={16} />}
              color={T.success}
              state={client}
              onFileSelect={(f) => handleFileSelect(f, "client")}
              onRemove={() => setClient(emptySide)}
              onItemChange={(idx, patch) => updateItem("client", idx, patch)}
              onItemRemove={(idx) => removeItem("client", idx)}
              onItemAdd={() => addItem("client")}
            />

            <SideUploader
              side="internal"
              label="Кошторис Metrum"
              hint="собівартість для нас"
              icon={<Briefcase size={16} />}
              color={T.danger}
              state={internal}
              onFileSelect={(f) => handleFileSelect(f, "internal")}
              onRemove={() => setInternal(emptySide)}
              onItemChange={(idx, patch) => updateItem("internal", idx, patch)}
              onItemRemove={(idx) => removeItem("internal", idx)}
              onItemAdd={() => addItem("internal")}
            />
          </div>

          {/* Summary preview */}
          {(client.items.length > 0 || internal.items.length > 0) && (
            <div
              className="grid grid-cols-3 gap-3 rounded-xl px-4 py-3"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <SummaryCell label="Клієнт" value={client.totalAmount} color={T.success} />
              <SummaryCell label="Metrum" value={internal.totalAmount} color={T.danger} />
              <SummaryCell
                label="Прибуток"
                value={client.totalAmount - internal.totalAmount}
                color={T.accentPrimary}
              />
            </div>
          )}

          {submitError && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}`,
              }}
            >
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-2 border-t pt-4"
            style={{ borderColor: T.borderSoft }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ color: T.textSecondary }}
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!canSave}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Створити кошторис
            </button>
          </div>
        </div>
      </div>

      {/* Conflict dialog */}
      {conflictPair?.ask && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="max-w-md w-full rounded-2xl p-6 flex flex-col gap-4"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} style={{ color: T.warning }} />
              <h4 className="text-base font-bold" style={{ color: T.textPrimary }}>
                Для цього проєкту вже є кошториси
              </h4>
            </div>
            <p className="text-[13px]" style={{ color: T.textSecondary }}>
              Що зробити зі старими кошторисами?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setConflictPair(null);
                  handleSubmit({ replaceExisting: true });
                }}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: T.danger }}
              >
                🗑️ Перезаписати (видалити старі)
              </button>
              <button
                onClick={() => {
                  setConflictPair(null);
                  handleSubmit({ createNewVersion: true });
                }}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: T.accentPrimary }}
              >
                📄 Створити нову версію
              </button>
              <button
                onClick={() => setConflictPair(null)}
                className="rounded-xl px-4 py-3 text-sm font-medium"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SideUploader({
  side,
  label,
  hint,
  icon,
  color,
  state,
  onFileSelect,
  onRemove,
  onItemChange,
  onItemRemove,
  onItemAdd,
}: {
  side: "client" | "internal";
  label: string;
  hint: string;
  icon: React.ReactNode;
  color: string;
  state: SideState;
  onFileSelect: (f: File) => void;
  onRemove: () => void;
  onItemChange: (idx: number, patch: Partial<ParsedItem>) => void;
  onItemRemove: (idx: number) => void;
  onItemAdd: () => void;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: T.borderSoft }}
      >
        <span style={{ color }}>{icon}</span>
        <div className="flex-1">
          <h4 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            {label}
          </h4>
          <p className="text-[10px]" style={{ color: T.textMuted }}>
            {hint}
          </p>
        </div>
        {state.file && (
          <button onClick={onRemove} title="Видалити" style={{ color: T.textMuted }}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {!state.file && (
          <label
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl px-4 py-8 cursor-pointer transition hover:brightness-105"
            style={{
              backgroundColor: T.panel,
              border: `2px dashed ${T.borderStrong}`,
              color: T.textSecondary,
            }}
          >
            <Upload size={24} style={{ color }} />
            <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
              Клікніть або перетягніть файл
            </span>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              Excel, PDF, JPG, PNG · макс 20 МБ
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileSelect(f);
              }}
            />
          </label>
        )}

        {state.file && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <FileText size={14} style={{ color }} />
            <span className="flex-1 truncate" style={{ color: T.textPrimary }}>
              {state.file.name}
            </span>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              {(state.file.size / 1024).toFixed(0)} KB
            </span>
          </div>
        )}

        {state.scanning && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-semibold"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            <Loader2 size={13} className="animate-spin" />
            AI розпізнає…
          </div>
        )}

        {state.error && (
          <div
            className="rounded-lg px-3 py-2 text-[11px]"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}`,
            }}
          >
            {state.error}
          </div>
        )}

        {state.warnings.length > 0 && (
          <div
            className="rounded-lg px-3 py-2 text-[10px] flex flex-col gap-0.5"
            style={{
              backgroundColor: T.warningSoft,
              color: T.warning,
              border: `1px solid ${T.warning}40`,
            }}
          >
            {state.warnings.map((w, i) => (
              <div key={i}>⚠️ {w}</div>
            ))}
          </div>
        )}

        {state.scanned && !state.scanning && state.items.length === 0 && !state.error && (
          <div
            className="rounded-lg px-3 py-3 text-[11px] flex flex-col gap-2"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}`,
            }}
          >
            <span>
              ❌ Не вдалося розпізнати жодну позицію. Файл може мати нестандартну структуру.
            </span>
            <button
              type="button"
              onClick={onItemAdd}
              className="rounded-md px-2 py-1 text-[11px] font-semibold self-start"
              style={{
                backgroundColor: T.panel,
                color: T.accentPrimary,
                border: `1px solid ${T.accentPrimary}40`,
              }}
            >
              + Додати позиції вручну
            </button>
          </div>
        )}

        {state.items.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ПОЗИЦІЇ ({state.items.length})
              </span>
              <span className="text-[12px] font-bold" style={{ color }}>
                {state.totalAmount.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
              {state.items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid gap-1.5 px-2.5 py-2 border-b last:border-b-0"
                  style={{
                    gridTemplateColumns: "1fr 50px 60px 80px 80px 28px",
                    borderColor: T.borderSoft,
                  }}
                >
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => onItemChange(idx, { description: e.target.value })}
                    placeholder="Назва"
                    className="text-[11px] outline-none bg-transparent"
                    style={{ color: T.textPrimary }}
                  />
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => onItemChange(idx, { unit: e.target.value })}
                    className="text-[11px] outline-none bg-transparent text-center"
                    style={{ color: T.textMuted }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.quantity || ""}
                    onChange={(e) => onItemChange(idx, { quantity: Number(e.target.value) || 0 })}
                    className="text-[11px] outline-none bg-transparent text-right"
                    style={{ color: T.textMuted }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice || ""}
                    onChange={(e) => onItemChange(idx, { unitPrice: Number(e.target.value) || 0 })}
                    className="text-[11px] outline-none bg-transparent text-right"
                    style={{ color: T.textMuted }}
                  />
                  <span className="text-[11px] text-right font-semibold" style={{ color: T.textPrimary }}>
                    {(item.totalPrice || 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 })}
                  </span>
                  <button
                    onClick={() => onItemRemove(idx)}
                    className="flex items-center justify-center rounded"
                    style={{ color: T.danger }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={onItemAdd}
              className="flex items-center gap-1 text-[11px] font-semibold self-start"
              style={{ color: T.accentPrimary }}
            >
              <Plus size={11} /> Додати рядок
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-[16px] font-bold" style={{ color }}>
        {value.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
      </span>
    </div>
  );
}
