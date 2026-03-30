"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowLeft,
  Upload,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  X,
  Sparkles,
  Loader2,
  Download,
  FileDown,
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Trash2,
  ExternalLink,
  Info,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type EstimateItem = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  laborCost: number;
  totalCost: number;
  priceSource?: string | null;
  priceNote?: string | null;
};

type EstimateSection = {
  title: string;
  items: EstimateItem[];
  sectionTotal: number;
};

type EstimateData = {
  title: string;
  description?: string;
  area?: string;
  areaSource?: string;
  sections: EstimateSection[];
  summary?: {
    materialsCost?: number;
    laborCost?: number;
    overheadPercent?: number;
    overheadCost?: number;
    totalBeforeDiscount?: number;
    recommendations?: string;
  };
};

type AIGeneratedEstimate = EstimateData;

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  csv: FileSpreadsheet,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  png: ImageIcon,
  webp: ImageIcon,
};

const WORK_CATEGORIES = [
  { id: "demolition", label: "Демонтажні роботи", icon: "🔨" },
  { id: "earthworks", label: "Земляні роботи", icon: "⛏️" },
  { id: "foundation", label: "Фундамент", icon: "🏗️" },
  { id: "walls", label: "Стіни та перегородки", icon: "🧱" },
  { id: "ceiling", label: "Стеля", icon: "⬆️" },
  { id: "floor", label: "Підлога", icon: "⬇️" },
  { id: "electrical", label: "Електрика", icon: "⚡" },
  { id: "plumbing", label: "Сантехніка", icon: "🚰" },
  { id: "heating", label: "Опалення та вентиляція", icon: "🔥" },
  { id: "windows", label: "Вікна та двері", icon: "🚪" },
  { id: "finishing", label: "Оздоблювальні роботи", icon: "🎨" },
  { id: "kitchen", label: "Кухня", icon: "🍳" },
  { id: "bathroom", label: "Санвузол", icon: "🚿" },
  { id: "roof", label: "Покрівля", icon: "🏠" },
  { id: "facade", label: "Фасад", icon: "🏛️" },
] as const;

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || FileText;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AIEstimatePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [projectType, setProjectType] = useState("ремонт квартири");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(WORK_CATEGORIES.map(c => c.id)) // За замовчуванням всі категорії вибрані
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [editingItem, setEditingItem] = useState<{ s: number; i: number } | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState<number | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [refining, setRefining] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"gemini" | "openai" | "anthropic">("openai");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projects, setProjects] = useState<Array<{ id: string; title: string; client: { name: string } }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const router = useRouter();

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/admin/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(data.data || []);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    }
    loadProjects();
  }, []);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Toggle work category
  function toggleCategory(categoryId: string) {
    setSelectedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  }

  // Toggle all categories
  function toggleAllCategories() {
    if (selectedCategories.size === WORK_CATEGORIES.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(WORK_CATEGORIES.map(c => c.id)));
    }
  }

  // Generate estimate
  async function generate() {
    if (files.length === 0) {
      setError("Завантажте хоча б один файл проєкту");
      return;
    }
    setLoading(true);
    setError("");
    setEstimate(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("projectType", projectType);
      formData.append("area", area);
      formData.append("notes", notes);
      formData.append("categories", Array.from(selectedCategories).join(","));

      const res = await fetch("/api/admin/estimates/generate", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Помилка генерації кошторису");
        return;
      }

      setEstimate(json.data);
      // Expand all sections by default
      setExpandedSections(new Set(json.data.sections.map((_: unknown, i: number) => i)));
    } catch (err) {
      setError("Не вдалось з'єднатись з сервером");
    } finally {
      setLoading(false);
    }
  }

  // Edit item
  function updateItem(sIdx: number, iIdx: number, field: keyof EstimateItem, value: string) {
    if (!estimate) return;
    const newEstimate = { ...estimate };
    const sections = [...newEstimate.sections];
    const items = [...sections[sIdx].items];
    items[iIdx] = { ...items[iIdx], [field]: isNaN(Number(value)) ? value : Number(value) };

    // Recalculate totalCost
    const item = items[iIdx];
    item.totalCost = item.quantity * item.unitPrice + item.laborCost;

    sections[sIdx] = {
      ...sections[sIdx],
      items,
      sectionTotal: items.reduce((sum, it) => sum + (it.totalCost || 0), 0),
    };
    newEstimate.sections = sections;

    // Recalculate summary
    recalculateSummary(newEstimate);
    setEstimate(newEstimate);
  }

  function addItem(sIdx: number) {
    if (!estimate) return;
    const newEstimate = { ...estimate };
    const sections = [...newEstimate.sections];
    const items = [...sections[sIdx].items];

    // Add new empty item
    const newItem: EstimateItem = {
      description: "Нова позиція",
      unit: "шт",
      quantity: 1,
      unitPrice: 0,
      laborCost: 0,
      totalCost: 0,
      priceSource: "",
      priceNote: ""
    };

    items.push(newItem);

    sections[sIdx] = {
      ...sections[sIdx],
      items,
      sectionTotal: items.reduce((sum, it) => sum + (it.totalCost || 0), 0),
    };
    newEstimate.sections = sections;

    recalculateSummary(newEstimate);
    setEstimate(newEstimate);

    // Auto-edit the new item
    setEditingItem({ s: sIdx, i: items.length - 1 });
  }

  function deleteItem(sIdx: number, iIdx: number) {
    if (!estimate) return;
    const newEstimate = { ...estimate };
    const sections = [...newEstimate.sections];
    const items = [...sections[sIdx].items];

    items.splice(iIdx, 1);

    sections[sIdx] = {
      ...sections[sIdx],
      items,
      sectionTotal: items.reduce((sum, it) => sum + (it.totalCost || 0), 0),
    };
    newEstimate.sections = sections;

    recalculateSummary(newEstimate);
    setEstimate(newEstimate);
    setEditingItem(null);
  }

  function addSection() {
    if (!estimate) return;
    const newEstimate = { ...estimate };
    const sections = [...newEstimate.sections];

    const newSection: EstimateSection = {
      title: "Нова секція",
      items: [],
      sectionTotal: 0
    };

    sections.push(newSection);
    newEstimate.sections = sections;

    setEstimate(newEstimate);
    setExpandedSections(new Set([...expandedSections, sections.length - 1]));
  }

  function deleteSection(sIdx: number) {
    if (!estimate) return;
    const newEstimate = { ...estimate };
    const sections = [...newEstimate.sections];

    sections.splice(sIdx, 1);
    newEstimate.sections = sections;

    recalculateSummary(newEstimate);
    setEstimate(newEstimate);
  }

  function updateSectionTitle(sIdx: number, title: string) {
    if (!estimate) return;
    const newEstimate = { ...estimate };
    const sections = [...newEstimate.sections];
    sections[sIdx] = { ...sections[sIdx], title };
    newEstimate.sections = sections;
    setEstimate(newEstimate);
  }

  function recalculateSummary(est: AIGeneratedEstimate) {
    const sections = est.sections;
    const totalMaterials = sections.reduce(
      (sum: number, s: EstimateSection) => sum + s.items.reduce((is: number, it: EstimateItem) => is + it.quantity * it.unitPrice, 0), 0
    );
    const totalLabor = sections.reduce(
      (sum: number, s: EstimateSection) => sum + s.items.reduce((is: number, it: EstimateItem) => is + (it.laborCost || 0), 0), 0
    );
    const overheadPercent = est.summary?.overheadPercent || 15;
    const overhead = (totalMaterials + totalLabor) * (overheadPercent / 100);

    est.summary = {
      ...est.summary,
      materialsCost: totalMaterials,
      laborCost: totalLabor,
      overheadCost: overhead,
      totalBeforeDiscount: totalMaterials + totalLabor + overhead,
    };
  }

  // Export
  async function exportEstimate(format: "pdf" | "excel") {
    if (!estimate) return;
    setExporting(format);
    try {
      const res = await fetch("/api/admin/estimates/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, estimate }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `koshtorys-metrum.${format === "excel" ? "xlsx" : "pdf"}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  }

  // Refine estimate with AI engineer
  async function refineEstimate() {
    if (!estimate || !refinePrompt.trim()) {
      setError("Введіть вказівки для інженера");
      return;
    }

    setRefining(true);
    setError("");

    try {
      const res = await fetch("/api/admin/estimates/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimate,
          engineerPrompt: refinePrompt,
          model: selectedModel,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Помилка редагування кошторису");
        return;
      }

      // Update estimate with refined version
      setEstimate(json.estimate);
      setRefineModalOpen(false);
      setRefinePrompt("");
      // Expand all sections to show changes
      setExpandedSections(new Set(json.estimate.sections.map((_: unknown, i: number) => i)));
    } catch (err) {
      setError("Не вдалось з'єднатись з сервером");
    } finally {
      setRefining(false);
    }
  }

  // Save estimate to database
  async function saveEstimate() {
    if (!estimate || !selectedProjectId) {
      setError("Оберіть проєкт для збереження кошторису");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Convert AI estimate format to API format
      const sectionsForApi = estimate.sections.map((section) => ({
        title: section.title,
        items: section.items.map((item) => ({
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          laborRate: 0, // AI format має laborCost, а не laborRate/laborHours
          laborHours: item.laborCost > 0 ? item.laborCost / 200 : 0, // Оцінюємо години (припускаємо 200₴/год)
        })),
      }));

      const res = await fetch("/api/admin/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          title: estimate.title,
          description: estimate.description || "",
          sections: sectionsForApi,
          overheadRate: estimate.summary?.overheadPercent || 15,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Помилка збереження кошторису");
        return;
      }

      // Success - redirect to estimate details
      router.push(`/admin/estimates/${json.data.id}`);
    } catch (err) {
      setError("Не вдалось з'єднатись з сервером");
      setSaving(false);
    }
  }

  function toggleSection(idx: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const grandTotal = estimate?.summary?.totalBeforeDiscount || 0;

  return (
    <div>
      <Link
        href="/admin/estimates"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до кошторисів
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-amber-500 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Генератор кошторисів</h1>
            <p className="text-sm text-muted-foreground">
              Завантажте файли проєкту — Gemini AI створить детальний кошторис
            </p>
          </div>
        </div>
      </div>

      {!estimate ? (
        /* ════════ UPLOAD STATE ════════ */
        <div className="max-w-3xl space-y-6">
          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "relative rounded-2xl border-2 border-dashed transition-all duration-200 p-10 text-center cursor-pointer",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/40 hover:bg-muted/30",
              files.length > 0 && "pb-5"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.txt,.doc,.docx,.jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="flex flex-col items-center">
              <div className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl transition-colors mb-4",
                isDragging ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <Upload className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold">
                {isDragging ? "Відпустіть файли тут" : "Перетягніть файли сюди"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                або натисніть для вибору • PDF, Excel, CSV, зображення, Word
              </p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-6 space-y-2" onClick={(e) => e.stopPropagation()}>
                {files.map((file, i) => {
                  const Icon = getFileIcon(file.name);
                  return (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 rounded-xl bg-white border border-border/50 px-4 py-3 text-left"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatSize(file.size)}</p>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Settings */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Параметри проєкту</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Тип проєкту</label>
                <select
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
                >
                  <option>ремонт квартири</option>
                  <option>ремонт комерційного приміщення</option>
                  <option>будівництво під ключ</option>
                  <option>капітальний ремонт</option>
                  <option>дизайн інтер&apos;єру + ремонт</option>
                  <option>фасадні роботи</option>
                  <option>інженерні мережі</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Площа (м²)</label>
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="напр. 85"
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">Додаткові побажання</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Наприклад: преміум матеріали, теплий пол у всіх кімнатах, два санвузли..."
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-primary resize-none transition-colors"
                />
              </div>
            </div>
          </Card>

          {/* Work Categories Selection */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold">Категорії робіт</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Оберіть які категорії включити в кошторис
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllCategories}
                type="button"
              >
                {selectedCategories.size === WORK_CATEGORIES.length ? "Зняти всі" : "Обрати всі"}
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {WORK_CATEGORIES.map((category) => {
                const isSelected = selectedCategories.has(category.id);
                return (
                  <label
                    key={category.id}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/50",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-white"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCategory(category.id)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{category.icon}</span>
                        <span className="text-xs font-medium leading-tight">{category.label}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedCategories.size === 0 && (
              <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    Оберіть хоча б одну категорію робіт для генерації кошторису
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 text-xs text-muted-foreground">
              Обрано: {selectedCategories.size} з {WORK_CATEGORIES.length} категорій
            </div>
          </Card>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-destructive/10 border border-destructive/20 p-4">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Помилка</p>
                <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Generate button */}
          <Button
            onClick={generate}
            disabled={loading || files.length === 0 || selectedCategories.size === 0}
            size="lg"
            className="w-full h-14 text-base gap-3"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                AI аналізує файли... Це може зайняти 15-30 секунд
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Згенерувати кошторис ({files.length} файл{files.length > 1 ? "ів" : ""})
              </>
            )}
          </Button>
        </div>
      ) : (
        /* ════════ RESULT STATE ════════ */
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{estimate.title}</h2>
              {estimate.description && (
                <p className="mt-1 text-sm text-muted-foreground">{estimate.description}</p>
              )}
              {estimate.area && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">Площа: {estimate.area}</Badge>
                  {estimate.areaSource && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" /> {estimate.areaSource}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setEstimate(null); setFiles([]); }}
              >
                <ArrowLeft className="h-4 w-4" /> Новий кошторис
              </Button>
              <Button
                onClick={() => setSaveModalOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="h-4 w-4" /> Зберегти кошторис
              </Button>
              <Button
                variant="outline"
                onClick={() => setRefineModalOpen(true)}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                <Sparkles className="h-4 w-4" /> Редагувати через AI
              </Button>
              <Button
                variant="outline"
                onClick={() => exportEstimate("excel")}
                disabled={exporting === "excel"}
              >
                {exporting === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Excel
              </Button>
              <Button
                onClick={() => exportEstimate("pdf")}
                disabled={exporting === "pdf"}
              >
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                PDF
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Матеріали", value: estimate.summary?.materialsCost || 0, color: "text-blue-600" },
              { label: "Роботи", value: estimate.summary?.laborCost || 0, color: "text-green-600" },
              { label: "Накладні", value: estimate.summary?.overheadCost || 0, color: "text-orange-600" },
              { label: "ВСЬОГО", value: grandTotal, color: "text-primary" },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                <p className={cn("text-xl font-bold mt-1", stat.color)}>
                  {formatCurrency(stat.value)}
                </p>
              </Card>
            ))}
          </div>

          {/* Sections */}
          {estimate.sections.map((section, sIdx) => (
            <Card key={sIdx} className="overflow-hidden">
              <div className="flex items-center justify-between w-full px-5 py-4 bg-muted/10">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => toggleSection(sIdx)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold hover:opacity-80 transition-opacity"
                  >
                    {sIdx + 1}
                  </button>
                  <div className="flex-1">
                    {editingSectionTitle === sIdx ? (
                      <input
                        value={section.title}
                        onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                        onBlur={() => setEditingSectionTitle(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setEditingSectionTitle(null);
                        }}
                        autoFocus
                        className="w-full max-w-md rounded border border-primary/30 bg-primary/5 px-2 py-1 text-sm font-semibold outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => toggleSection(sIdx)}
                        className="text-left hover:opacity-80 transition-opacity"
                      >
                        <h3 className="font-semibold">{section.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {section.items.length} позицій
                        </p>
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{formatCurrency(section.sectionTotal)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSectionTitle(sIdx);
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Редагувати назву секції"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Видалити секцію "${section.title}"?`)) {
                          deleteSection(sIdx);
                        }
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Видалити секцію"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleSection(sIdx)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-primary transition-colors"
                      title={expandedSections.has(sIdx) ? "Згорнути" : "Розгорнути"}
                    >
                      {expandedSections.has(sIdx) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {expandedSections.has(sIdx) && (
                <div className="border-t overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-8">#</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Опис</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-16">Од.</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-20">К-ть</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-28">Ціна, ₴</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-28">Робота, ₴</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-28">Разом, ₴</th>
                        <th className="px-4 py-2.5 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item, iIdx) => {
                        const isEditing = editingItem?.s === sIdx && editingItem?.i === iIdx;
                        return (
                          <tr key={iIdx} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{iIdx + 1}</td>
                            <td className="px-4 py-2.5">
                              {isEditing ? (
                                <input
                                  value={item.description}
                                  onChange={(e) => updateItem(sIdx, iIdx, "description", e.target.value)}
                                  className="w-full rounded border border-primary/30 bg-primary/5 px-2 py-1 text-sm outline-none"
                                />
                              ) : (
                                <div>
                                  <span className="text-sm">{item.description}</span>
                                  {item.priceSource && (
                                    <a
                                      href={item.priceSource}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 mt-1 text-[10px] text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-2.5 w-2.5" />
                                      {item.priceNote || "Переглянути ціну"}
                                    </a>
                                  )}
                                  {!item.priceSource && item.priceNote && (
                                    <p className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                      <Info className="h-2.5 w-2.5" />
                                      {item.priceNote}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {isEditing ? (
                                <input
                                  value={item.unit}
                                  onChange={(e) => updateItem(sIdx, iIdx, "unit", e.target.value)}
                                  className="w-12 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs outline-none"
                                />
                              ) : (
                                item.unit
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(sIdx, iIdx, "quantity", e.target.value)}
                                  className="w-16 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-sm text-right outline-none"
                                />
                              ) : (
                                item.quantity
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) => updateItem(sIdx, iIdx, "unitPrice", e.target.value)}
                                  className="w-24 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-sm text-right outline-none"
                                />
                              ) : (
                                formatCurrency(item.unitPrice)
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={item.laborCost}
                                  onChange={(e) => updateItem(sIdx, iIdx, "laborCost", e.target.value)}
                                  className="w-24 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-sm text-right outline-none"
                                />
                              ) : (
                                formatCurrency(item.laborCost)
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium">
                              {formatCurrency(item.totalCost)}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    setEditingItem(isEditing ? null : { s: sIdx, i: iIdx })
                                  }
                                  className="rounded-lg p-1 text-muted-foreground hover:text-primary transition-colors"
                                  title={isEditing ? "Зберегти" : "Редагувати"}
                                >
                                  {isEditing ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("Видалити цю позицію?")) {
                                      deleteItem(sIdx, iIdx);
                                    }
                                  }}
                                  className="rounded-lg p-1 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Видалити"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Add item button */}
                  <div className="border-t p-3 bg-muted/5">
                    <button
                      onClick={() => addItem(sIdx)}
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                    >
                      <Plus className="h-4 w-4" />
                      Додати позицію
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}

          {/* Add section button */}
          <Button
            onClick={addSection}
            variant="outline"
            className="w-full border-dashed border-2 h-12 hover:bg-primary/5 hover:border-primary/50"
          >
            <Plus className="h-4 w-4" />
            Додати нову секцію
          </Button>

          {/* Recommendations */}
          {estimate.summary?.recommendations && (
            <Card className="p-5 border-primary/20 bg-primary/5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Рекомендації AI
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {estimate.summary.recommendations}
              </p>
            </Card>
          )}

          {/* Grand total bar */}
          <Card className="p-6 bg-dark text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-white/50 uppercase tracking-wide">Загальна вартість проєкту</p>
                <p className="text-3xl font-bold mt-1 gradient-text">{formatCurrency(grandTotal)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => exportEstimate("excel")}
                  disabled={!!exporting}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Завантажити Excel
                </Button>
                <Button
                  onClick={() => exportEstimate("pdf")}
                  disabled={!!exporting}
                >
                  <FileDown className="h-4 w-4" /> Завантажити PDF
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ════════ REFINE MODAL ════════ */}
      {refineModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Редагування кошторису через AI інженера
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Опишіть які зміни потрібно внести в кошторис
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setRefineModalOpen(false);
                    setRefinePrompt("");
                    setError("");
                  }}
                  disabled={refining}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive/80">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">AI Модель</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as "gemini" | "openai" | "anthropic")}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={refining}
                >
                  <option value="openai">🤖 OpenAI GPT-4o (Найкраща точність)</option>
                  <option value="gemini">✨ Google Gemini 2.0 Flash (Швидка)</option>
                  <option value="anthropic">🧠 Anthropic Claude Opus 4.6 (Найрозумніша)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Виберіть AI модель для редагування кошторису. Кожна модель має свої сильні сторони.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Вказівки для інженера</label>
                <textarea
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder="Наприклад:&#10;- Збільш кількість шпаклівки на 20%&#10;- Додай позиції для утеплення стін&#10;- Замість звичайної фарби використай преміум марку Dulux&#10;- Видали позиції демонтажу, це вже зроблено"
                  className="w-full min-h-[200px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  disabled={refining}
                />
                <p className="text-xs text-muted-foreground">
                  AI інженер проаналізує поточний кошторис та внесе зміни відповідно до ваших вказівок
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRefineModalOpen(false);
                    setRefinePrompt("");
                    setError("");
                  }}
                  disabled={refining}
                >
                  Скасувати
                </Button>
                <Button
                  onClick={refineEstimate}
                  disabled={refining || !refinePrompt.trim()}
                >
                  {refining ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      AI обробляє...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Застосувати зміни
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ════════ SAVE MODAL ════════ */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-600" />
                    Зберегти кошторис в базу даних
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Виберіть проєкт для прив'язки кошторису
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSaveModalOpen(false);
                    setSelectedProjectId("");
                    setError("");
                  }}
                  disabled={saving}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive/80">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Проєкт</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={saving}
                >
                  <option value="">Оберіть проєкт...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title} — {project.client.name}
                    </option>
                  ))}
                </select>
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Завантаження проектів...
                  </p>
                )}
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">{estimate?.title}</p>
                {estimate?.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {estimate.description}
                  </p>
                )}
                {estimate?.sections && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {estimate.sections.length} секцій, {" "}
                    {estimate.sections.reduce((sum, s) => sum + s.items.length, 0)} позицій
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSaveModalOpen(false);
                    setSelectedProjectId("");
                    setError("");
                  }}
                  disabled={saving}
                >
                  Скасувати
                </Button>
                <Button
                  onClick={saveEstimate}
                  disabled={saving || !selectedProjectId}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Збереження...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Зберегти кошторис
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
