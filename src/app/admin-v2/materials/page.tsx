"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Edit2,
  X,
  Save,
  FileSpreadsheet,
  Download,
  Loader2,
  Package,
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
  markup: number;
  description: string | null;
  isActive: boolean;
};

const emptyForm = {
  name: "",
  sku: "",
  category: "",
  unit: "",
  basePrice: "",
  laborRate: "",
  markup: "",
  description: "",
};

export default function AdminV2MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function loadMaterials() {
    setFetching(true);
    fetch("/api/admin/materials")
      .then((r) => r.json())
      .then((d) => setMaterials(d.data || []))
      .catch(() => setError("Не вдалось завантажити матеріали"))
      .finally(() => setFetching(false));
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  const filtered = materials.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.sku.toLowerCase().includes(search.toLowerCase()) ||
      m.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, Material[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  function updateField(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...form,
        basePrice: parseFloat(form.basePrice) || 0,
        laborRate: parseFloat(form.laborRate) || 0,
        markup: parseFloat(form.markup) || 0,
      };
      if (editingId) {
        const res = await fetch("/api/admin/materials", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        if (!res.ok) throw new Error("Помилка оновлення");
        const { data } = await res.json();
        setMaterials((prev) => prev.map((m) => (m.id === editingId ? data : m)));
      } else {
        const res = await fetch("/api/admin/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Помилка створення");
        const { data } = await res.json();
        setMaterials((prev) => [...prev, data]);
      }
      resetForm();
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(m: Material) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      sku: m.sku,
      category: m.category,
      unit: m.unit,
      basePrice: String(m.basePrice),
      laborRate: String(m.laborRate),
      markup: String(m.markup),
      description: m.description || "",
    });
    setShowForm(true);
  }

  async function handleDownloadTemplate() {
    try {
      const r = await fetch("/api/admin/materials/template");
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Шаблон_Матеріали.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Помилка завантаження шаблону");
    }
  }

  async function handleExport() {
    try {
      const r = await fetch("/api/admin/materials/export");
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Матеріали_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Помилка експорту");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            БАЗА МАТЕРІАЛІВ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Матеріали та ціни
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {materials.length} позицій · {Object.keys(grouped).length} категорій
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textSecondary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <Download size={16} /> Шаблон
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textSecondary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <FileSpreadsheet size={16} /> Експорт
          </button>
          <button
            onClick={() => {
              if (showForm) resetForm();
              else {
                setEditingId(null);
                setForm(emptyForm);
                setShowForm(true);
              }
            }}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Plus size={16} /> Додати матеріал
          </button>
        </div>
      </section>

      {/* Form */}
      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              {editingId ? "Редагувати матеріал" : "Новий матеріал"}
            </h3>
            <button onClick={resetForm}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormInput label="Назва" required value={form.name} onChange={(v) => updateField("name", v)} />
            <FormInput label="Артикул (SKU)" required value={form.sku} onChange={(v) => updateField("sku", v)} />
            <FormInput
              label="Категорія"
              required
              value={form.category}
              onChange={(v) => updateField("category", v)}
            />
            <FormInput label="Од. виміру" required value={form.unit} onChange={(v) => updateField("unit", v)} />
            <FormInput
              label="Базова ціна"
              type="number"
              value={form.basePrice}
              onChange={(v) => updateField("basePrice", v)}
            />
            <FormInput
              label="Вартість роботи"
              type="number"
              value={form.laborRate}
              onChange={(v) => updateField("laborRate", v)}
            />
            <FormInput
              label="Націнка %"
              type="number"
              value={form.markup}
              onChange={(v) => updateField("markup", v)}
            />
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ОПИС
              </span>
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={2}
                className="rounded-xl px-3.5 py-3 text-sm outline-none resize-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </label>
            {error && (
              <div
                className="sm:col-span-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
              >
                {error}
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? "Оновити" : "Створити"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={16} style={{ color: T.textMuted }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за назвою, SKU або категорією…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: T.textPrimary }}
        />
      </div>

      {/* List grouped by category */}
      <section className="flex flex-col gap-5">
        {fetching ? (
          <div
            className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
            style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState />
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div
              key={category}
              className="overflow-hidden rounded-2xl"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div
                className="flex items-center justify-between border-b px-6 py-3"
                style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
              >
                <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  {category}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: T.panel, color: T.textSecondary }}
                >
                  {items.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr style={{ backgroundColor: T.panelSoft }}>
                      <Th>НАЗВА</Th>
                      <Th>SKU</Th>
                      <Th>ОД.</Th>
                      <Th align="right">ЦІНА</Th>
                      <Th align="right">РОБОТА</Th>
                      <Th align="right">НАЦІНКА</Th>
                      <Th align="right">ДІЇ</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m, i) => (
                      <tr
                        key={m.id}
                        className={i < 20 ? "data-table-row-enter" : undefined}
                        style={{
                          backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                          borderTop: `1px solid ${T.borderSoft}`,
                          ...(i < 20 ? { animationDelay: `${i * 50}ms` } : {}),
                        }}
                      >
                        <td className="px-4 py-3.5">
                          <div className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                            {m.name}
                          </div>
                          {m.description && (
                            <div className="text-[10px] truncate max-w-[300px]" style={{ color: T.textMuted }}>
                              {m.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[12px]" style={{ color: T.textMuted }}>
                          {m.sku}
                        </td>
                        <td className="px-4 py-3.5 text-[12px]" style={{ color: T.textSecondary }}>
                          {m.unit}
                        </td>
                        <td
                          className="px-4 py-3.5 text-right text-[13px] font-semibold"
                          style={{ color: T.textPrimary }}
                        >
                          {formatCurrency(Number(m.basePrice))}
                        </td>
                        <td
                          className="px-4 py-3.5 text-right text-[12px]"
                          style={{ color: T.textSecondary }}
                        >
                          {formatCurrency(Number(m.laborRate))}
                        </td>
                        <td
                          className="px-4 py-3.5 text-right text-[12px]"
                          style={{ color: T.textSecondary }}
                        >
                          {Number(m.markup)}%
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => startEdit(m)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
                          >
                            <Edit2 size={12} /> Редаг.
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function FormInput({
  label,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="rounded-xl px-3.5 py-3 text-sm outline-none"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderStrong}`,
          color: T.textPrimary,
        }}
      />
    </label>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-4 py-3 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <Package size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Матеріалів немає
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Додайте перший матеріал або імпортуйте з Excel
      </span>
    </div>
  );
}
