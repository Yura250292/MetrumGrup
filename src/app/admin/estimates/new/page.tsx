"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, Plus, Trash2, Save, Package } from "lucide-react";
import Link from "next/link";

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

export default function NewEstimatePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [saving, setSaving] = useState(false);

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
      .then((d) => setMaterials(d.data || []));
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects((d.data || []).map((p: { id: string; title: string }) => ({ id: p.id, title: p.title }))));
  }, []);

  function addSection() {
    setSections((prev) => [...prev, { id: generateId(), title: "", items: [createItem()] }]);
  }

  function removeSection(sIdx: number) {
    setSections((prev) => prev.filter((_, i) => i !== sIdx));
  }

  function updateSection(sIdx: number, title: string) {
    setSections((prev) => prev.map((s, i) => (i === sIdx ? { ...s, title } : s)));
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
    if (!projectId || !title) return;
    setSaving(true);
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
      if (res.ok) {
        const { data } = await res.json();
        router.push(`/admin/estimates/${data.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link
        href="/admin/estimates"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Новий кошторис</h1>
        <Button onClick={handleSave} disabled={saving || !projectId || !title}>
          <Save className="h-4 w-4" />
          {saving ? "Збереження..." : "Зберегти"}
        </Button>
      </div>

      {/* Header info */}
      <Card className="mb-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Проєкт <span className="text-destructive">*</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Оберіть проєкт</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Назва кошторису <span className="text-destructive">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Кошторис на будівельні роботи"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">Опис</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Додаткова інформація..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
            />
          </div>
        </div>
      </Card>

      {/* Sections */}
      {sections.map((section, sIdx) => (
        <Card key={section.id} className="mb-4 p-5">
          <div className="mb-4 flex items-center gap-3">
            <input
              value={section.title}
              onChange={(e) => updateSection(sIdx, e.target.value)}
              placeholder="Назва секції"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium outline-none focus:border-primary"
            />
            {sections.length > 1 && (
              <button
                onClick={() => removeSection(sIdx)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Items */}
          <div className="space-y-3">
            {section.items.map((item, iIdx) => (
              <div key={item.id} className="rounded-lg border bg-muted/30 p-3">
                <div className="grid gap-2 sm:grid-cols-6">
                  {/* Material picker */}
                  <div className="sm:col-span-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <select
                        value={item.materialId || ""}
                        onChange={(e) => applyMaterial(sIdx, iIdx, e.target.value)}
                        className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                      >
                        <option value="">Обрати з бази матеріалів...</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.sku}) — {Number(m.basePrice).toFixed(2)} ₴/{m.unit}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-muted-foreground">Опис</label>
                    <input
                      value={item.description}
                      onChange={(e) => updateItem(sIdx, iIdx, { description: e.target.value })}
                      placeholder="Назва позиції"
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                  </div>

                  {/* Unit */}
                  <div>
                    <label className="text-[10px] text-muted-foreground">Од.</label>
                    <input
                      value={item.unit}
                      onChange={(e) => updateItem(sIdx, iIdx, { unit: e.target.value })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="text-[10px] text-muted-foreground">Кількість</label>
                    <input
                      type="number"
                      step="0.001"
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(sIdx, iIdx, { quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                  </div>

                  {/* Unit Price */}
                  <div>
                    <label className="text-[10px] text-muted-foreground">Ціна, ₴</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unitPrice || ""}
                      onChange={(e) => updateItem(sIdx, iIdx, { unitPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                  </div>

                  {/* Amount */}
                  <div className="flex items-end justify-between">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Сума</label>
                      <p className="py-1.5 text-sm font-medium">
                        {formatCurrency(item.quantity * item.unitPrice + item.laborHours * item.laborRate)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(sIdx, iIdx)}
                      className="mb-1 rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Labor */}
                  <div className="sm:col-span-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground">Тариф роботи, ₴/год</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.laborRate || ""}
                          onChange={(e) => updateItem(sIdx, iIdx, { laborRate: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground">Години роботи</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.laborHours || ""}
                          onChange={(e) => updateItem(sIdx, iIdx, { laborHours: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => addItem(sIdx)}
          >
            <Plus className="h-3.5 w-3.5" />
            Додати позицію
          </Button>
        </Card>
      ))}

      <Button variant="outline" onClick={addSection} className="mb-6">
        <Plus className="h-4 w-4" />
        Додати секцію
      </Button>

      {/* Totals */}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Підсумки</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Матеріали</span>
            <span>{formatCurrency(totalMaterials)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Роботи</span>
            <span>{formatCurrency(totalLabor)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              Накладні витрати
              <input
                type="number"
                step="0.1"
                value={overheadRate}
                onChange={(e) => setOverheadRate(parseFloat(e.target.value) || 0)}
                className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-center outline-none focus:border-primary"
              />
              %
            </span>
            <span>{formatCurrency(overhead)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between text-lg font-bold">
            <span>Всього</span>
            <span className="text-primary">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
