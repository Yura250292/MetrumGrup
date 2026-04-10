"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Package,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Material = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  basePrice: number;
  laborRate: number;
};

type EstimateItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  laborRate: number;
  laborHours: number;
  materialId: string | null;
};

type Section = {
  id: string;
  title: string;
  items: EstimateItem[];
};

type ProjectOption = { id: string; title: string };

function generateId() {
  return Math.random().toString(36).slice(2);
}

function createItem(): EstimateItem {
  return {
    id: generateId(),
    description: "",
    unit: "шт",
    quantity: 0,
    unitPrice: 0,
    laborRate: 0,
    laborHours: 0,
    materialId: null,
  };
}

export default function AdminV2NewEstimatePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [overheadRate, setOverheadRate] = useState(15);
  const [sections, setSections] = useState<Section[]>([
    { id: generateId(), title: "Основні роботи", items: [createItem()] },
  ]);

  useEffect(() => {
    fetch("/api/admin/materials")
      .then((r) => r.json())
      .then((d) => setMaterials(d.data || []))
      .catch(() => undefined);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) =>
        setProjects(
          (d.data || []).map((p: { id: string; title: string }) => ({
            id: p.id,
            title: p.title,
          }))
        )
      )
      .catch(() => undefined);
  }, []);

  function addSection() {
    setSections((prev) => [
      ...prev,
      { id: generateId(), title: "", items: [createItem()] },
    ]);
  }
  function removeSection(sIdx: number) {
    setSections((prev) => prev.filter((_, i) => i !== sIdx));
  }
  function updateSectionTitle(sIdx: number, t: string) {
    setSections((prev) => prev.map((s, i) => (i === sIdx ? { ...s, title: t } : s)));
  }
  function addItem(sIdx: number) {
    setSections((prev) =>
      prev.map((s, i) => (i === sIdx ? { ...s, items: [...s.items, createItem()] } : s))
    );
  }
  function removeItem(sIdx: number, iIdx: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, items: s.items.filter((_, j) => j !== iIdx) } : s
      )
    );
  }
  function updateItem(sIdx: number, iIdx: number, updates: Partial<EstimateItem>) {
    setSections((prev) =>
      prev.map((s, si) =>
        si === sIdx
          ? {
              ...s,
              items: s.items.map((item, ii) =>
                ii === iIdx ? { ...item, ...updates } : item
              ),
            }
          : s
      )
    );
  }
  function applyMaterial(sIdx: number, iIdx: number, materialId: string) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;
    updateItem(sIdx, iIdx, {
      materialId,
      description: mat.name,
      unit: mat.unit,
      unitPrice: Number(mat.basePrice),
      laborRate: Number(mat.laborRate),
    });
  }

  // Calculations
  let totalMaterials = 0;
  let totalLabor = 0;
  sections.forEach((s) =>
    s.items.forEach((item) => {
      totalMaterials += item.quantity * item.unitPrice;
      totalLabor += item.laborHours * item.laborRate;
    })
  );
  const overhead = (totalMaterials + totalLabor) * (overheadRate / 100);
  const grandTotal = totalMaterials + totalLabor + overhead;

  async function handleSave() {
    if (!projectId || !title) {
      setError("Заповніть проєкт і назву кошторису");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title,
          description,
          overheadRate,
          sections: sections.map((s) => ({
            title: s.title,
            items: s.items.map((item) => ({
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              laborRate: item.laborRate,
              laborHours: item.laborHours,
              materialId: item.materialId,
            })),
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Помилка збереження");
      }
      const { data } = await res.json();
      router.push(`/admin-v2/estimates/${data.id}`);
    } catch (err: any) {
      setError(err?.message || "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin-v2/estimates"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-125"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> До списку кошторисів
      </Link>

      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            СТВОРЕННЯ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Новий кошторис
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            Сформуйте кошторис вручну. Або скористайтеся{" "}
            <Link
              href="/ai-estimate-v2"
              className="font-bold transition hover:brightness-125"
              style={{ color: T.accentPrimary }}
            >
              AI генератором
            </Link>
            .
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !projectId || !title}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </section>

      {error && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-4"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}`,
          }}
        >
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: form + sections */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          {/* Header info */}
          <div
            className="flex flex-col gap-4 rounded-2xl p-6"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
              Основні дані
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Проєкт" required>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                >
                  <option value="">Оберіть проєкт</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Назва кошторису" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Кошторис на будівельні роботи"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>
            </div>
            <Field label="Опис">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Додаткова інформація…"
                className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <Field label="Накладні витрати, %">
              <input
                type="number"
                value={overheadRate}
                onChange={(e) => setOverheadRate(Number(e.target.value) || 0)}
                min="0"
                max="100"
                step="0.5"
                className="w-32 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
          </div>

          {/* Sections */}
          {sections.map((section, sIdx) => {
            const sectionTotal = section.items.reduce(
              (sum, it) => sum + it.quantity * it.unitPrice + it.laborHours * it.laborRate,
              0
            );
            return (
              <div
                key={section.id}
                className="flex flex-col gap-4 rounded-2xl p-5"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
              >
                <div className="flex items-center gap-3">
                  <input
                    value={section.title}
                    onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                    placeholder="Назва секції"
                    className="flex-1 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                  <span className="text-[13px] font-bold flex-shrink-0" style={{ color: T.textSecondary }}>
                    {formatCurrency(sectionTotal)}
                  </span>
                  {sections.length > 1 && (
                    <button
                      onClick={() => removeSection(sIdx)}
                      className="rounded-lg p-2"
                      style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      title="Видалити секцію"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Items */}
                <div className="flex flex-col gap-2">
                  {section.items.map((item, iIdx) => {
                    const itemTotal =
                      item.quantity * item.unitPrice + item.laborHours * item.laborRate;
                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 rounded-xl p-3"
                        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
                      >
                        <div className="flex items-start gap-2">
                          <select
                            value={item.materialId || ""}
                            onChange={(e) => applyMaterial(sIdx, iIdx, e.target.value)}
                            className="rounded-lg px-2 py-1.5 text-[11px] outline-none flex-shrink-0"
                            style={{
                              backgroundColor: T.panel,
                              border: `1px solid ${T.borderStrong}`,
                              color: T.textSecondary,
                            }}
                          >
                            <option value="">Без матеріалу</option>
                            {materials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <input
                            value={item.description}
                            onChange={(e) => updateItem(sIdx, iIdx, { description: e.target.value })}
                            placeholder="Опис позиції"
                            className="flex-1 rounded-lg px-3 py-1.5 text-[12px] outline-none"
                            style={{
                              backgroundColor: T.panel,
                              border: `1px solid ${T.borderStrong}`,
                              color: T.textPrimary,
                            }}
                          />
                          <button
                            onClick={() => removeItem(sIdx, iIdx)}
                            className="rounded-lg p-1.5 flex-shrink-0"
                            style={{ color: T.danger }}
                            title="Видалити"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <NumInput
                            label="К-сть"
                            value={item.quantity}
                            onChange={(v) => updateItem(sIdx, iIdx, { quantity: v })}
                          />
                          <input
                            value={item.unit}
                            onChange={(e) => updateItem(sIdx, iIdx, { unit: e.target.value })}
                            placeholder="Од."
                            className="rounded-lg px-2 py-1.5 text-[11px] outline-none"
                            style={{
                              backgroundColor: T.panel,
                              border: `1px solid ${T.borderStrong}`,
                              color: T.textPrimary,
                            }}
                          />
                          <NumInput
                            label="Ціна"
                            value={item.unitPrice}
                            onChange={(v) => updateItem(sIdx, iIdx, { unitPrice: v })}
                          />
                          <NumInput
                            label="Год праці"
                            value={item.laborHours}
                            onChange={(v) => updateItem(sIdx, iIdx, { laborHours: v })}
                          />
                          <NumInput
                            label="₴/год"
                            value={item.laborRate}
                            onChange={(v) => updateItem(sIdx, iIdx, { laborRate: v })}
                          />
                        </div>
                        <div className="flex items-center justify-end">
                          <span className="text-[12px] font-bold" style={{ color: T.textPrimary }}>
                            = {formatCurrency(itemTotal)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => addItem(sIdx)}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-medium"
                    style={{
                      backgroundColor: T.panelSoft,
                      color: T.textMuted,
                      border: `1px dashed ${T.borderSoft}`,
                    }}
                  >
                    <Plus size={12} /> Додати позицію
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add section */}
          <button
            onClick={addSection}
            className="flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-medium"
            style={{
              backgroundColor: T.panelSoft,
              color: T.textMuted,
              border: `1px dashed ${T.borderSoft}`,
            }}
          >
            <Plus size={16} /> Додати секцію
          </button>
        </div>

        {/* Right: totals sticky sidebar */}
        <aside className="flex flex-col gap-4">
          <div
            className="sticky top-24 flex flex-col gap-4 rounded-2xl p-6"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderAccent}` }}
          >
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ПІДСУМКИ
            </span>
            <Row label="Матеріали" value={formatCurrency(totalMaterials)} />
            <Row label="Праця" value={formatCurrency(totalLabor)} />
            <Row label={`Накладні ${overheadRate}%`} value={formatCurrency(overhead)} />
            <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />
            <Row label="До сплати" value={formatCurrency(grandTotal)} bold large />

            <button
              onClick={handleSave}
              disabled={saving || !projectId || !title}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Зберегти кошторис
            </button>

            <Link
              href="/ai-estimate-v2"
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold"
              style={{
                backgroundColor: T.panel,
                color: T.textSecondary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              <Sparkles size={12} /> Або через AI
            </Link>
          </div>
        </aside>
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
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
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

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min="0"
        step="0.01"
        className="rounded-lg px-2 py-1.5 text-[11px] outline-none"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
          color: T.textPrimary,
        }}
      />
    </div>
  );
}

function Row({
  label,
  value,
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`${large ? "text-[14px]" : "text-[12px]"} ${bold ? "font-bold" : ""}`}
        style={{ color: T.textSecondary }}
      >
        {label}
      </span>
      <span
        className={`${large ? "text-xl" : "text-[13px]"} ${bold ? "font-bold" : "font-semibold"}`}
        style={{ color: T.textPrimary }}
      >
        {value}
      </span>
    </div>
  );
}
