"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit2, X, Save, FileSpreadsheet, Download, Upload } from "lucide-react";
import { MaterialsImportDialog } from "@/components/admin/MaterialsImportDialog";

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
  name: "", sku: "", category: "", unit: "", basePrice: "", laborRate: "", markup: "", description: "",
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  function loadMaterials() {
    fetch("/api/admin/materials")
      .then((r) => r.json())
      .then((d) => setMaterials(d.data || []));
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

  // Group by category
  const grouped = filtered.reduce<Record<string, Material[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  function updateField(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
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
        if (res.ok) {
          const { data } = await res.json();
          setMaterials((prev) => prev.map((m) => (m.id === editingId ? data : m)));
          setEditingId(null);
        }
      } else {
        const res = await fetch("/api/admin/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const { data } = await res.json();
          setMaterials((prev) => [...prev, data]);
        }
      }
      setShowForm(false);
      setForm(emptyForm);
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
      const response = await fetch("/api/admin/materials/template");
      if (!response.ok) throw new Error("Помилка завантаження шаблону");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Шаблон_Матеріали.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading template:", error);
      alert("Помилка завантаження шаблону");
    }
  }

  async function handleExport() {
    try {
      const response = await fetch("/api/admin/materials/export");
      if (!response.ok) throw new Error("Помилка експорту");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `Матеріали_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error exporting materials:", error);
      alert("Помилка експорту матеріалів");
    }
  }

  function handleImportSuccess() {
    loadMaterials();
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Матеріали та ціни</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {materials.length} позицій у базі
            </p>
          </div>
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); }} className="w-full md:w-auto">
            <Plus className="h-4 w-4" />
            Додати матеріал
          </Button>
        </div>

        {/* Import/Export buttons */}
        <div className="flex flex-col gap-2 md:flex-row">
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className="w-full md:w-auto"
          >
            <Download className="h-4 w-4" />
            Завантажити шаблон
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="w-full md:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Експорт в Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowImport(true)}
            className="w-full md:w-auto bg-green-50 hover:bg-green-100 border-green-200 text-green-700 hover:text-green-800"
          >
            <Upload className="h-4 w-4" />
            Імпорт з Excel
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="mb-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">
              {editingId ? "Редагувати матеріал" : "Новий матеріал"}
            </h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Назва *"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={form.sku}
              onChange={(e) => updateField("sku", e.target.value)}
              placeholder="SKU (артикул) *"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              placeholder="Категорія *"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={form.unit}
              onChange={(e) => updateField("unit", e.target.value)}
              placeholder="Одиниця (шт, м², кг) *"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="number"
              step="0.01"
              value={form.basePrice}
              onChange={(e) => updateField("basePrice", e.target.value)}
              placeholder="Ціна, ₴ *"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="number"
              step="0.01"
              value={form.laborRate}
              onChange={(e) => updateField("laborRate", e.target.value)}
              placeholder="Тариф роботи, ₴"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="number"
              step="0.01"
              value={form.markup}
              onChange={(e) => updateField("markup", e.target.value)}
              placeholder="Націнка, %"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Опис"
              className="sm:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Скасувати
              </Button>
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4" />
                {loading ? "Збереження..." : editingId ? "Оновити" : "Додати"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук матеріалів..."
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Materials grouped by category */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {category}
          </h2>
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Назва</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Од.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Ціна</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Робота</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Націнка</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.sku}</td>
                    <td className="px-4 py-2.5 text-xs">{m.unit}</td>
                    <td className="px-4 py-2.5 text-sm text-right">{Number(m.basePrice).toFixed(2)} ₴</td>
                    <td className="px-4 py-2.5 text-sm text-right">{Number(m.laborRate).toFixed(2)} ₴</td>
                    <td className="px-4 py-2.5 text-sm text-right">{Number(m.markup)}%</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => startEdit(m)}
                        className="rounded p-1 hover:bg-muted transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}

      {Object.keys(grouped).length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Матеріалів не знайдено</p>
        </Card>
      )}

      {/* Import Dialog */}
      {showImport && (
        <MaterialsImportDialog
          onClose={() => setShowImport(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}
