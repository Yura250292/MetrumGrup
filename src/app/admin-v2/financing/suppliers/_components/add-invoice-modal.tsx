"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { financeCategoriesForType } from "@/lib/constants";

type AddInvoiceModalProps = {
  presetCounterpartyId?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

type CostType = "MATERIAL" | "LABOR" | "SUBCONTRACT" | "EQUIPMENT" | "OVERHEAD" | "OTHER";

type DraftItem = {
  key: string; // local-only React key
  costType: CostType;
  title: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
  category: string;
};

type UploadedFile = {
  key: string;
  originalName: string;
  mime: string;
  size: number;
  progress: number; // 0..100
  error?: string;
};

const COST_TYPE_LABELS: Record<CostType, string> = {
  MATERIAL: "Матеріал",
  LABOR: "Робота",
  SUBCONTRACT: "Підряд",
  EQUIPMENT: "Техніка",
  OVERHEAD: "Накладні",
  OTHER: "Інше",
};

// Auto-category suggestion за costType.
const DEFAULT_CATEGORY: Record<CostType, string> = {
  MATERIAL: "materials",
  LABOR: "subcontractors",
  SUBCONTRACT: "subcontractors",
  EQUIPMENT: "equipment",
  OVERHEAD: "admin",
  OTHER: "other_expense",
};

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyItem(costType: CostType = "MATERIAL"): DraftItem {
  return {
    key: makeKey(),
    costType,
    title: "",
    description: "",
    quantity: "",
    unit: "",
    unitPrice: "",
    amount: "",
    category: DEFAULT_CATEGORY[costType],
  };
}

export function AddInvoiceModal({
  presetCounterpartyId,
  onClose,
  onCreated,
}: AddInvoiceModalProps) {
  const [counterpartyOptions, setCounterpartyOptions] = useState<ComboboxOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [counterpartyId, setCounterpartyId] = useState(presetCounterpartyId ?? "");
  const [projectId, setProjectId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [currency, setCurrency] = useState<"UAH" | "USD" | "EUR">("UAH");
  const [status, setStatus] = useState<"APPROVED" | "PAID">("APPROVED");

  // Inline counterparty creation
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newCpName, setNewCpName] = useState("");
  const [newCpType, setNewCpType] = useState<"LEGAL" | "FOP" | "INDIVIDUAL">("LEGAL");
  const [creatingCp, setCreatingCp] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);

  // AI / files
  const [aiText, setAiText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Items
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = financeCategoriesForType("EXPENSE");

  useEffect(() => {
    let aborted = false;
    Promise.all([
      fetch("/api/admin/financing/counterparties?role=SUPPLIER&take=500", {
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      fetch("/api/admin/projects?take=200", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
    ]).then(([cps, projs]) => {
      if (aborted) return;
      setCounterpartyOptions(
        (cps.data ?? []).map(
          (c: { id: string; name: string; type: string }) => ({
            value: c.id,
            label: c.name,
            description:
              c.type === "FOP"
                ? "ФОП"
                : c.type === "INDIVIDUAL"
                  ? "Фіз.особа"
                  : "ТОВ/ЮО",
          }),
        ),
      );
      setProjectOptions(projs.data ?? []);
    });
    return () => {
      aborted = true;
    };
  }, []);

  // -- Inline counterparty creation --
  async function submitInlineCp() {
    const name = newCpName.trim();
    if (!name) {
      setCpError("Введіть назву");
      return;
    }
    setCreatingCp(true);
    setCpError(null);
    try {
      const res = await fetch("/api/admin/financing/counterparties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: newCpType,
          roles: ["SUPPLIER"],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCpError(json.error ?? "Помилка створення");
        return;
      }
      // Додаємо в options і вибираємо
      const created = json.data ?? json;
      const newOption: ComboboxOption = {
        value: created.id,
        label: created.name,
        description:
          newCpType === "FOP"
            ? "ФОП"
            : newCpType === "INDIVIDUAL"
              ? "Фіз.особа"
              : "ТОВ/ЮО",
      };
      setCounterpartyOptions((prev) => [newOption, ...prev]);
      setCounterpartyId(created.id);
      setShowInlineCreate(false);
      setNewCpName("");
    } finally {
      setCreatingCp(false);
    }
  }

  // -- File upload (R2 presign) --
  async function uploadFile(file: File) {
    const local: UploadedFile = {
      key: "",
      originalName: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      progress: 0,
    };
    setFiles((prev) => [...prev, local]);
    const idx = files.length; // approximate position
    try {
      const presignRes = await fetch("/api/admin/financing/invoice-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          mimeType: local.mime,
          size: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presign.message ?? "Не вдалось отримати presign URL");
      }
      // PUT to R2
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presign.putUrl);
        xhr.setRequestHeader("Content-Type", local.mime);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setFiles((prev) =>
              prev.map((f) =>
                f.originalName === file.name && !f.key
                  ? { ...f, progress: pct }
                  : f,
              ),
            );
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload network error"));
        xhr.send(file);
      });
      setFiles((prev) =>
        prev.map((f) =>
          f.originalName === file.name && !f.key
            ? { ...f, key: presign.key, progress: 100 }
            : f,
        ),
      );
    } catch (e) {
      setFiles((prev) =>
        prev.map((f) =>
          f.originalName === file.name && !f.key
            ? { ...f, error: e instanceof Error ? e.message : "Помилка" }
            : f,
        ),
      );
    }
  }

  function onFilesPicked(picked: FileList | null) {
    if (!picked) return;
    Array.from(picked).slice(0, 5).forEach((f) => void uploadFile(f));
  }

  function removeFile(key: string) {
    setFiles((prev) => prev.filter((f) => f.key !== key && f.originalName !== key));
  }

  // -- AI Parse --
  async function runParse() {
    setParseError(null);
    const readyFiles = files.filter((f) => f.key && !f.error);
    if (!aiText.trim() && readyFiles.length === 0) {
      setParseError("Введіть текст або завантажте файл");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/admin/financing/invoice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: aiText,
          fileKeys: readyFiles.map((f) => ({
            key: f.key,
            mime: f.mime,
            originalName: f.originalName,
            size: f.size,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setParseError(json.message ?? json.error ?? "Помилка парсу");
        return;
      }
      const parsedItems: DraftItem[] = (json.items ?? []).map(
        (it: {
          costType?: CostType;
          title?: string;
          unit?: string | null;
          quantity?: number | null;
          unitPrice?: number | null;
          amount?: number;
        }) => {
          const costType: CostType = it.costType ?? "MATERIAL";
          return {
            key: makeKey(),
            costType,
            title: it.title ?? "",
            description: "",
            quantity: it.quantity != null ? String(it.quantity) : "",
            unit: it.unit ?? "",
            unitPrice: it.unitPrice != null ? String(it.unitPrice) : "",
            amount: it.amount != null ? String(it.amount) : "",
            category: DEFAULT_CATEGORY[costType],
          };
        },
      );
      if (parsedItems.length === 0) {
        setParseError("AI не розпізнав позицій — введіть вручну");
        return;
      }
      // Заміняємо порожні items або додаємо до існуючих
      const hasMeaningful = items.some((i) => i.title.trim() || i.amount.trim());
      setItems(hasMeaningful ? [...items, ...parsedItems] : parsedItems);
      // suggested counterparty
      if (json.suggestions?.counterpartyId && !counterpartyId) {
        setCounterpartyId(json.suggestions.counterpartyId);
      }
    } finally {
      setParsing(false);
    }
  }

  // -- Items handlers --
  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        // якщо змінили costType — оновити дефолтну категорію (тільки якщо вона ще дефолтна)
        if (patch.costType && DEFAULT_CATEGORY[it.costType] === it.category) {
          next.category = DEFAULT_CATEGORY[patch.costType];
        }
        // авто-розрахунок amount з quantity*unitPrice якщо обидва задані
        if (
          (patch.quantity != null || patch.unitPrice != null) &&
          next.quantity &&
          next.unitPrice
        ) {
          const q = Number(next.quantity);
          const u = Number(next.unitPrice);
          if (Number.isFinite(q) && Number.isFinite(u)) {
            next.amount = (q * u).toFixed(2);
          }
        }
        return next;
      }),
    );
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)));
  }

  const totalAmount = items.reduce((sum, it) => {
    const n = Number(it.amount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  // -- Submit --
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!counterpartyId) {
      setError("Виберіть постачальника");
      return;
    }
    const validItems = items.filter((it) => it.title.trim() && Number(it.amount) > 0);
    if (validItems.length === 0) {
      setError("Додайте хоча б одну позицію з назвою і сумою > 0");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        counterpartyId,
        projectId: projectId || null,
        invoiceNumber: invoiceNumber.trim() || null,
        occurredAt,
        currency,
        status,
        items: validItems.map((it) => ({
          title: it.title.trim(),
          description: it.description.trim() || null,
          amount: Number(it.amount),
          category: it.category,
          costType: it.costType,
          unit: it.unit.trim() || null,
          quantity: it.quantity ? Number(it.quantity) : null,
          unitPrice: it.unitPrice ? Number(it.unitPrice) : null,
        })),
      };
      const res = await fetch("/api/admin/financing/invoice-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          maxHeight: "92vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Нова накладна
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-black/10">
            <X size={16} style={{ color: T.textMuted }} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 px-5 py-4 overflow-y-auto"
        >
          {/* HEADER */}
          <section className="flex flex-col gap-3">
            <Field label="Постачальник *">
              {showInlineCreate ? (
                <div
                  className="rounded-xl p-3 flex flex-col gap-2"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCpName}
                      onChange={(e) => setNewCpName(e.target.value)}
                      placeholder="Назва, напр. ТзОВ «Будматеріали»"
                      className="flex-1 rounded-lg px-3 py-2 text-[13px]"
                      style={{
                        backgroundColor: T.panel,
                        border: `1px solid ${T.borderSoft}`,
                        color: T.textPrimary,
                      }}
                      autoFocus
                    />
                    <select
                      value={newCpType}
                      onChange={(e) => setNewCpType(e.target.value as typeof newCpType)}
                      className="rounded-lg px-2 py-2 text-[12px]"
                      style={{
                        backgroundColor: T.panel,
                        border: `1px solid ${T.borderSoft}`,
                        color: T.textPrimary,
                      }}
                    >
                      <option value="LEGAL">ТОВ/ЮО</option>
                      <option value="FOP">ФОП</option>
                      <option value="INDIVIDUAL">Фіз.особа</option>
                    </select>
                  </div>
                  {cpError && (
                    <span className="text-[11px]" style={{ color: T.danger }}>
                      {cpError}
                    </span>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowInlineCreate(false);
                        setNewCpName("");
                        setCpError(null);
                      }}
                      className="rounded px-3 py-1 text-[12px] font-semibold"
                      style={{ color: T.textMuted }}
                    >
                      Скасувати
                    </button>
                    <button
                      type="button"
                      onClick={submitInlineCp}
                      disabled={creatingCp}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                      style={{
                        backgroundColor: T.accentPrimary,
                        color: "#fff",
                        opacity: creatingCp ? 0.7 : 1,
                      }}
                    >
                      {creatingCp && <Loader2 size={12} className="animate-spin" />}
                      Створити
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Combobox
                      options={counterpartyOptions}
                      value={counterpartyId}
                      onChange={(v) => setCounterpartyId(v ?? "")}
                      placeholder="Виберіть постачальника"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInlineCreate(true)}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: T.panelSoft,
                      color: T.textPrimary,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <Plus size={12} /> Новий
                  </button>
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Проєкт (необов'язково)">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[13px]"
                  style={inputStyle}
                >
                  <option value="">Без проєкту</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="№ накладної">
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="напр. РН-12345"
                  className="w-full rounded-lg px-3 py-2 text-[13px]"
                  style={inputStyle}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Дата *">
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[13px]"
                  style={{ ...inputStyle, colorScheme: "light" }}
                />
              </Field>
              <Field label="Валюта">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as typeof currency)}
                  className="w-full rounded-lg px-3 py-2 text-[13px]"
                  style={inputStyle}
                >
                  <option value="UAH">UAH</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Field>
              <Field label="Статус">
                <div className="flex gap-2">
                  <StatusPill
                    label="Борг"
                    active={status === "APPROVED"}
                    onClick={() => setStatus("APPROVED")}
                    tone="danger"
                  />
                  <StatusPill
                    label="Оплачено"
                    active={status === "PAID"}
                    onClick={() => setStatus("PAID")}
                    tone="success"
                  />
                </div>
              </Field>
            </div>
          </section>

          {/* AI parse */}
          <section
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px dashed ${T.borderSoft}`,
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} style={{ color: T.accentPrimary }} />
              <span
                className="text-[12px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                AI РОЗПІЗНАВАННЯ
              </span>
            </div>
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={3}
              placeholder={
                "Опишіть накладну вільним текстом, AI розкладе:\n" +
                "клей 1 мішок 20кг - 450 грн матеріал\n" +
                "плитка 30 м2 - 3800 грн\n" +
                "кладка плитки 30 м2 - 3500 грн робота"
              }
              className="w-full rounded-lg px-3 py-2 text-[13px] resize-none"
              style={inputStyle}
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <div
                    key={f.key || f.originalName}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-[11px]"
                    style={{
                      backgroundColor: T.panel,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <span style={{ color: T.textPrimary }} className="max-w-[180px] truncate">
                      {f.originalName}
                    </span>
                    {f.error ? (
                      <span style={{ color: T.danger }}>помилка</span>
                    ) : f.progress < 100 ? (
                      <span style={{ color: T.textMuted }}>{f.progress}%</span>
                    ) : (
                      <span style={{ color: T.success }}>OK</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(f.key || f.originalName)}
                    >
                      <X size={11} style={{ color: T.textMuted }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.xlsx,.xls"
                onChange={(e) => {
                  onFilesPicked(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  backgroundColor: T.panel,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <Upload size={12} /> Завантажити (PDF/Excel/фото)
              </button>
              <button
                type="button"
                onClick={runParse}
                disabled={parsing}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  backgroundColor: T.accentPrimary,
                  color: "#fff",
                  opacity: parsing ? 0.7 : 1,
                }}
              >
                {parsing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                Розпізнати
              </button>
              {parseError && (
                <span className="text-[11px]" style={{ color: T.danger }}>
                  {parseError}
                </span>
              )}
            </div>
          </section>

          {/* Items */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-bold tracking-widest"
                style={{ color: T.textMuted }}
              >
                ПОЗИЦІЇ ({items.length})
              </span>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: T.panelSoft,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <Plus size={11} /> Додати позицію
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((it, idx) => (
                <ItemRow
                  key={it.key}
                  index={idx}
                  item={it}
                  categories={expenseCategories}
                  onChange={(patch) => updateItem(it.key, patch)}
                  onRemove={() => removeItem(it.key)}
                  canRemove={items.length > 1}
                />
              ))}
            </div>
            <div
              className="flex items-center justify-end gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: T.panelSoft }}
            >
              <span className="text-[12px]" style={{ color: T.textMuted }}>
                ВСЬОГО
              </span>
              <span
                className="text-[14px] font-bold tabular-nums"
                style={{ color: T.textPrimary }}
              >
                {totalAmount.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} {currency}
              </span>
            </div>
          </section>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold"
              style={{
                backgroundColor: T.accentPrimary,
                color: "#fff",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Створити накладну
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--t-panel-soft)",
  border: `1px solid var(--t-border-soft)`,
  color: "var(--t-text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function StatusPill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "danger" | "success";
}) {
  const bg = active
    ? tone === "danger"
      ? T.dangerSoft
      : T.successSoft
    : T.panelSoft;
  const fg = active ? (tone === "danger" ? T.danger : T.success) : T.textSecondary;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold"
      style={{ backgroundColor: bg, color: fg, border: `1px solid ${T.borderSoft}` }}
    >
      {label}
    </button>
  );
}

function ItemRow({
  index,
  item,
  categories,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  item: DraftItem;
  categories: ReadonlyArray<{ key: string; label: string }>;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold" style={{ color: T.textMuted }}>
          #{index + 1}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={item.costType}
            onChange={(e) => onChange({ costType: e.target.value as CostType })}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold"
            style={inputStyle}
          >
            {(Object.keys(COST_TYPE_LABELS) as CostType[]).map((ct) => (
              <option key={ct} value={ct}>
                {COST_TYPE_LABELS[ct]}
              </option>
            ))}
          </select>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded p-1 hover:bg-black/10"
              title="Видалити позицію"
            >
              <Trash2 size={13} style={{ color: T.danger }} />
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        value={item.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Назва позиції, напр. Цемент М500 / Кладка плитки"
        className="w-full rounded-lg px-3 py-2 text-[13px]"
        style={inputStyle}
      />

      <div className="grid grid-cols-4 gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.001"
          value={item.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          placeholder="К-сть"
          className="rounded-lg px-2 py-1.5 text-[12px]"
          style={inputStyle}
        />
        <input
          type="text"
          value={item.unit}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="Од."
          className="rounded-lg px-2 py-1.5 text-[12px]"
          style={inputStyle}
        />
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={item.unitPrice}
          onChange={(e) => onChange({ unitPrice: e.target.value })}
          placeholder="Ціна"
          className="rounded-lg px-2 py-1.5 text-[12px]"
          style={inputStyle}
        />
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={item.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder="Сума *"
          className="rounded-lg px-2 py-1.5 text-[12px] font-bold"
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <select
          value={item.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="col-span-1 rounded-lg px-2 py-1.5 text-[12px]"
          style={inputStyle}
        >
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Коментар (необов'язково)"
          className="col-span-2 rounded-lg px-2 py-1.5 text-[12px]"
          style={inputStyle}
        />
      </div>
    </div>
  );
}
