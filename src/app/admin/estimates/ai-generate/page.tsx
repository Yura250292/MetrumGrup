"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { uploadFilesToR2, formatFileSize, type UploadProgress } from "@/lib/r2-upload";
// import { generateEngineeringReport, generateQuickSummary } from "@/lib/engineering-report"; // Temporarily disabled
import { generateQuickSummary } from "@/lib/engineering-report";
import { PROJECT_TEMPLATES } from "@/lib/constants";
import { WizardData, ObjectType, WorkScope, RenovationStage } from "@/lib/wizard-types";
import { ProzorroTenderSearch } from "@/components/admin/ProzorroTenderSearch";

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

function getDocumentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'site_plan': '🗺️ План ділянки',
    'topography': '🗺️ Топографія',
    'geological': '🪨 Геологія',
    'review': '📝 Рецензія',
    'photos': '📸 Фото',
    'master_plan': '📊 Генплан',
    'landscaping': '🌳 Благоустрій',
    'networks': '🔌 Схеми мереж',
    'specification': '📚 Специфікація',
    'architectural_plan': '📐 План',
    'unknown': '❓ Невідомо'
  };

  return labels[type] || type;
}

// Компонент для відображення результатів верифікації
function VerificationResults({ result }: { result: any }) {
  if (!result?.verification) return null;

  const { status, overallScore, issues, improvements, summary } = result.verification;

  const statusConfig = {
    passed: { color: "#22c55e", bgColor: "#f0fdf4", borderColor: "#86efac", label: "Пройдено", icon: "✓" },
    warnings: { color: "#f59e0b", bgColor: "#fffbeb", borderColor: "#fde68a", label: "Попередження", icon: "⚠" },
    critical: { color: "#ef4444", bgColor: "#fef2f2", borderColor: "#fca5a5", label: "Критичні помилки", icon: "✕" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.warnings;

  return (
    <Card className="p-6 mb-6 border-2" style={{ borderColor: config.borderColor }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{config.icon}</span>
          <div>
            <h3 className="text-xl font-bold">Результати верифікації OpenAI</h3>
            <Badge
              variant={status === "passed" ? "default" : "secondary"}
              style={{
                backgroundColor: config.bgColor,
                color: config.color,
                borderColor: config.borderColor
              }}
            >
              {config.label}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold" style={{ color: config.color }}>
            {overallScore}/100
          </div>
          <div className="text-sm text-muted-foreground">Оцінка якості</div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4 p-4 bg-muted rounded-lg">
        <p className="text-sm">{summary}</p>
      </div>

      {/* Issues */}
      {issues && issues.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold mb-2">Знайдені проблеми ({issues.length}):</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {issues.map((issue: any, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: issue.severity === "error" ? "#fef2f2" : "#f9fafb",
                  borderColor: issue.severity === "error" ? "#fca5a5" : "#e5e7eb",
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {issue.category === "calculation" && "Розрахунок"}
                      {issue.category === "pricing" && "Ціна"}
                      {issue.category === "completeness" && "Повнота"}
                      {issue.category === "logic" && "Логіка"}
                      {issue.category === "specifications" && "Специфікації"}
                      {" - "}
                      Секція {issue.sectionIndex + 1}, Позиція {issue.itemIndex + 1}
                    </div>
                    <div className="text-sm mt-1">{issue.message}</div>
                    {issue.suggestion && (
                      <div className="text-sm mt-1 text-muted-foreground">
                        <strong>Рекомендація:</strong> {issue.suggestion}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvements */}
      {improvements && improvements.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Рекомендації для покращення ({improvements.length}):</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {improvements.map((improvement: any, idx: number) => (
              <div key={idx} className="p-3 bg-blue-50 rounded-lg text-sm">
                <div className="font-medium">
                  {improvement.type === "add" && "➕ Додати"}
                  {improvement.type === "modify" && "✏️ Змінити"}
                  {improvement.type === "remove" && "🗑️ Видалити"}
                </div>
                <div>{improvement.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Wizard Modal Component
function EstimateWizardModal({
  isOpen,
  onClose,
  wizardData,
  setWizardData,
  wizardStep,
  setWizardStep,
  onComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  wizardData: WizardData;
  setWizardData: (data: WizardData) => void;
  wizardStep: number;
  setWizardStep: (step: number) => void;
  onComplete: () => void;
}) {
  // Автоматично прокручувати на початок сторінки коли модальне вікно відкривається
  useEffect(() => {
    if (isOpen) {
      // Прокрутити на початок сторінки щоб модальне вікно було видиме
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Заблокувати прокручування body коли модальне вікно відкрите
      document.body.style.overflow = 'hidden';
    } else {
      // Відновити прокручування body
      document.body.style.overflow = '';
    }

    // Cleanup
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate total steps based on object type and work scope
  const calculateTotalSteps = () => {
    // Step 0: Object Type (always)
    // Step 1: Work Scope (always)
    // Step 2: General Info (always)
    let steps = 3;

    if (wizardData.objectType === 'house') {
      steps += 1; // Step 3: Current State (NEW!)
      if (wizardData.workScope === 'foundation_only') {
        steps += 2; // Terrain + Foundation
      } else if (wizardData.workScope === 'foundation_walls') {
        steps += 3; // Terrain + Foundation + Walls
      } else if (wizardData.workScope === 'foundation_walls_roof') {
        steps += 4; // Terrain + Foundation + Walls + Roof
      } else if (wizardData.workScope === 'full_cycle') {
        steps += 6; // Terrain + Foundation + Walls + Roof + Utilities + Finishing
      }
    } else if (wizardData.objectType === 'townhouse') {
      steps += 1; // Step 3: Current State (NEW!)
      steps += 1; // Townhouse specifics
      if (wizardData.workScope === 'full_cycle') {
        steps += 6; // Terrain + Foundation + Walls + Roof + Utilities + Finishing (same as house)
      }
    } else if (['apartment', 'office'].includes(wizardData.objectType)) {
      if (wizardData.workScope === 'renovation') {
        steps += 3; // Current stage + Work required + Finishing
      }
    } else if (wizardData.objectType === 'commercial') {
      steps += 3; // Commercial specifics + Utilities + Finishing
    }

    return steps;
  };

  const totalSteps = calculateTotalSteps();
  const progress = ((wizardStep + 1) / totalSteps) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Progress Bar */}
        <div className="h-2 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Детальний опитувальник проекту</h2>
              <p className="text-sm text-muted-foreground">
                Крок {wizardStep + 1} з {totalSteps}
              </p>
            </div>
            <Button variant="ghost" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Step Content */}
          {wizardStep === 0 && <WizardStep0_ObjectType data={wizardData} setData={setWizardData} />}
          {wizardStep === 1 && <WizardStep1_WorkScope data={wizardData} setData={setWizardData} />}
          {wizardStep === 2 && <WizardStep2_GeneralInfo data={wizardData} setData={setWizardData} />}

          {/* House: Current State (NEW!) */}
          {wizardStep === 3 && wizardData.objectType === 'house' && <WizardStep3_CurrentState data={wizardData} setData={setWizardData} objectType="house" />}

          {/* House: Construction steps (offset +1) */}
          {wizardStep === 4 && wizardData.objectType === 'house' && <WizardStep3_Terrain data={wizardData} setData={setWizardData} />}
          {wizardStep === 5 && wizardData.objectType === 'house' && <WizardStep4_Foundation data={wizardData} setData={setWizardData} />}
          {wizardStep === 6 && wizardData.objectType === 'house' && <WizardStep5_Walls data={wizardData} setData={setWizardData} />}
          {wizardStep === 7 && wizardData.objectType === 'house' && <WizardStep6_Roof data={wizardData} setData={setWizardData} />}
          {wizardStep === 8 && wizardData.objectType === 'house' && <WizardStep7_Utilities data={wizardData} setData={setWizardData} />}
          {wizardStep === 9 && wizardData.objectType === 'house' && <WizardStep8_Finishing data={wizardData} setData={setWizardData} />}

          {/* Townhouse: Current State (NEW!) */}
          {wizardStep === 3 && wizardData.objectType === 'townhouse' && <WizardStep3_CurrentState data={wizardData} setData={setWizardData} objectType="townhouse" />}

          {/* Townhouse-specific step (offset +1) */}
          {wizardStep === 4 && wizardData.objectType === 'townhouse' && <WizardStepTownhouse data={wizardData} setData={setWizardData} />}

          {/* Townhouse construction steps (offset +2) */}
          {wizardStep === 5 && wizardData.objectType === 'townhouse' && <WizardStep3_Terrain data={wizardData} setData={setWizardData} />}
          {wizardStep === 6 && wizardData.objectType === 'townhouse' && <WizardStep4_Foundation data={wizardData} setData={setWizardData} />}
          {wizardStep === 7 && wizardData.objectType === 'townhouse' && <WizardStep5_Walls data={wizardData} setData={setWizardData} />}
          {wizardStep === 8 && wizardData.objectType === 'townhouse' && <WizardStep6_Roof data={wizardData} setData={setWizardData} />}
          {wizardStep === 9 && wizardData.objectType === 'townhouse' && <WizardStep7_Utilities data={wizardData} setData={setWizardData} />}
          {wizardStep === 10 && wizardData.objectType === 'townhouse' && <WizardStep8_Finishing data={wizardData} setData={setWizardData} />}

          {/* Renovation steps for apartment/office */}
          {wizardStep === 3 && ['apartment', 'office'].includes(wizardData.objectType) && <WizardStepRenovation_CurrentState data={wizardData} setData={setWizardData} />}

          {/* Commercial-specific step */}
          {wizardStep === 3 && wizardData.objectType === 'commercial' && <WizardStepCommercial data={wizardData} setData={setWizardData} />}
          {wizardStep === 4 && wizardData.objectType === 'commercial' && <WizardStep7_Utilities data={wizardData} setData={setWizardData} />}
          {wizardStep === 5 && wizardData.objectType === 'commercial' && <WizardStep8_Finishing data={wizardData} setData={setWizardData} />}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => setWizardStep(Math.max(0, wizardStep - 1))}
              disabled={wizardStep === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Назад
            </Button>

            {wizardStep < totalSteps - 1 ? (
              <Button onClick={() => setWizardStep(wizardStep + 1)}>
                Далі <ChevronDown className="ml-2 h-4 w-4 rotate-[-90deg]" />
              </Button>
            ) : (
              <Button onClick={onComplete} className="bg-green-600 hover:bg-green-700">
                <Check className="mr-2 h-4 w-4" /> Завершити
              </Button>
            )}
          </div>

          {/* Skip */}
          <div className="text-center mt-4">
            <Button variant="link" onClick={onComplete} className="text-xs text-muted-foreground">
              Пропустити опитувальник
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Step 0: Object Type Selection
function WizardStep0_ObjectType({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const objectTypes = [
    { value: 'house' as ObjectType, label: 'Будинок', icon: '🏡', desc: 'Приватний будинок з нуля' },
    { value: 'townhouse' as ObjectType, label: 'Котедж (Таунхаус)', icon: '🏘️', desc: 'Будинок із суміжними стінами' },
    { value: 'apartment' as ObjectType, label: 'Квартира', icon: '🏢', desc: 'Квартира в багатоповерховому будинку' },
    { value: 'office' as ObjectType, label: 'Офісне приміщення', icon: '🏪', desc: 'Офіс або бізнес-простір' },
    { value: 'commercial' as ObjectType, label: 'Комерційне приміщення', icon: '🏭', desc: 'Магазин, склад, виробництво' },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Оберіть тип об'єкта</h3>
        <p className="text-sm text-muted-foreground">
          Це допоможе нам задати правильні питання для вашого проекту
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {objectTypes.map((type) => (
          <label
            key={type.value}
            className={cn(
              "relative flex flex-col gap-3 p-6 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md",
              data.objectType === type.value
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <input
              type="radio"
              name="objectType"
              value={type.value}
              checked={data.objectType === type.value}
              onChange={(e) => setData({ ...data, objectType: e.target.value as ObjectType })}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <span className="text-4xl">{type.icon}</span>
              <div className="flex-1">
                <div className="font-semibold text-base">{type.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{type.desc}</div>
              </div>
              {data.objectType === type.value && (
                <Check className="h-6 w-6 text-primary flex-shrink-0" />
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// Step 1: Work Scope Selection
function WizardStep1_WorkScope({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const getWorkScopes = () => {
    if (data.objectType === 'house' || data.objectType === 'townhouse') {
      return [
        { value: 'foundation_only' as WorkScope, label: 'Тільки фундамент', icon: '🏗️', desc: 'Нульовий цикл та фундаментні роботи' },
        { value: 'foundation_walls' as WorkScope, label: 'Фундамент + Коробка', icon: '🧱', desc: 'Фундамент та зведення стін' },
        { value: 'foundation_walls_roof' as WorkScope, label: 'Коробка з дахом', icon: '🏠', desc: 'Фундамент, стіни та дах' },
        { value: 'full_cycle' as WorkScope, label: 'Повний цикл', icon: '✨', desc: 'Від фундаменту до оздоблення' },
      ];
    } else if (data.objectType === 'commercial') {
      return [
        { value: 'full_cycle' as WorkScope, label: 'Будівництво з нуля', icon: '🏗️', desc: 'Нове будівництво під ключ (фундамент, стіни, дах, комунікації, оздоблення)' },
        { value: 'reconstruction' as WorkScope, label: 'Реконструкція', icon: '🔄', desc: 'Демонтаж існуючої будівлі + нове будівництво' },
        { value: 'renovation' as WorkScope, label: 'Ремонт', icon: '🔨', desc: 'Ремонт та оздоблення існуючого приміщення' },
      ];
    } else {
      return [
        { value: 'renovation' as WorkScope, label: 'Ремонт', icon: '🔨', desc: 'Ремонт та оздоблення приміщення' },
      ];
    }
  };

  const workScopes = getWorkScopes();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Оберіть обсяг робіт</h3>
        <p className="text-sm text-muted-foreground">
          Що саме плануєте робити?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {workScopes.map((scope) => (
          <label
            key={scope.value}
            className={cn(
              "relative flex items-center gap-4 p-5 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md",
              data.workScope === scope.value
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <input
              type="radio"
              name="workScope"
              value={scope.value}
              checked={data.workScope === scope.value}
              onChange={(e) => setData({ ...data, workScope: e.target.value as WorkScope })}
              className="sr-only"
            />
            <span className="text-3xl">{scope.icon}</span>
            <div className="flex-1">
              <div className="font-semibold">{scope.label}</div>
              <div className="text-sm text-muted-foreground mt-1">{scope.desc}</div>
            </div>
            {data.workScope === scope.value && (
              <Check className="h-6 w-6 text-primary flex-shrink-0" />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

// Step 2: General Info (Area, Floors, Ceiling Height)
function WizardStep2_GeneralInfo({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const isHouse = data.objectType === 'house' || data.objectType === 'townhouse';

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Загальна площа (м²)</label>
        <input
          type="number"
          value={data.totalArea}
          onChange={(e) => setData({ ...data, totalArea: e.target.value })}
          className="w-full px-4 py-2 border rounded-lg"
          placeholder="150"
        />
      </div>

      {isHouse && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">Кількість поверхів</label>
            <select
              value={data.floors || 1}
              onChange={(e) => setData({ ...data, floors: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="1">1 поверх</option>
              <option value="2">2 поверхи</option>
              <option value="3">3 поверхи</option>
              <option value="4">4+ поверхів</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Висота стелі (м)</label>
            <input
              type="number"
              step="0.1"
              min="2.4"
              max="4.0"
              value={data.ceilingHeight || '2.7'}
              onChange={(e) => setData({ ...data, ceilingHeight: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={data.houseData?.hasBasement || false}
                onChange={(e) => setData({
                  ...data,
                  houseData: { ...data.houseData, hasBasement: e.target.checked } as any
                })}
                className="rounded"
              />
              <span className="text-sm font-medium">Підвал</span>
            </label>

            <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={data.houseData?.hasAttic || false}
                onChange={(e) => setData({
                  ...data,
                  houseData: { ...data.houseData, hasAttic: e.target.checked } as any
                })}
                className="rounded"
              />
              <span className="text-sm font-medium">Мансарда</span>
            </label>

            <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={data.houseData?.hasGarage || false}
                onChange={(e) => setData({
                  ...data,
                  houseData: { ...data.houseData, hasGarage: e.target.checked } as any
                })}
                className="rounded"
              />
              <span className="text-sm font-medium">Гараж</span>
            </label>
          </div>
        </>
      )}

      {!isHouse && (
        <div>
          <label className="block text-sm font-medium mb-2">Висота стелі (м)</label>
          <input
            type="number"
            step="0.1"
            min="2.4"
            max="4.0"
            value={data.ceilingHeight || '2.7'}
            onChange={(e) => setData({ ...data, ceilingHeight: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
      )}
    </div>
  );
}

// Step 3: Current Building State (NEW! for house/townhouse)
function WizardStep3_CurrentState({
  data,
  setData,
  objectType
}: {
  data: WizardData;
  setData: (d: WizardData) => void;
  objectType: 'house' | 'townhouse';
}) {
  const getCurrentState = () => {
    if (objectType === 'house') {
      return data.houseData?.currentState || 'greenfield';
    } else {
      return data.townhouseData?.currentState || 'greenfield';
    }
  };

  const updateCurrentState = (state: 'greenfield' | 'foundation_only' | 'shell' | 'rough_utilities' | 'existing_building') => {
    // Auto-set demolitionRequired based on state
    let autoDemolition = false;
    if (state === 'existing_building') {
      autoDemolition = true; // Реконструкція завжди має демонтаж
    }

    if (objectType === 'house') {
      setData({
        ...data,
        houseData: {
          ...data.houseData,
          currentState: state,
          demolitionRequired: autoDemolition,
          demolitionDescription: autoDemolition ? data.houseData?.demolitionDescription : '',
        } as any
      });
    } else {
      setData({
        ...data,
        townhouseData: {
          ...data.townhouseData,
          currentState: state,
          demolitionRequired: autoDemolition,
          demolitionDescription: autoDemolition ? data.townhouseData?.demolitionDescription : '',
        } as any
      });
    }
  };

  const getDemolitionRequired = () => {
    if (objectType === 'house') {
      return data.houseData?.demolitionRequired || false;
    } else {
      return data.townhouseData?.demolitionRequired || false;
    }
  };

  const getDemolitionDescription = () => {
    if (objectType === 'house') {
      return data.houseData?.demolitionDescription || '';
    } else {
      return data.townhouseData?.demolitionDescription || '';
    }
  };

  const updateDemolitionRequired = (required: boolean) => {
    if (objectType === 'house') {
      setData({
        ...data,
        houseData: {
          ...data.houseData,
          demolitionRequired: required,
          demolitionDescription: required ? data.houseData?.demolitionDescription : '',
        } as any
      });
    } else {
      setData({
        ...data,
        townhouseData: {
          ...data.townhouseData,
          demolitionRequired: required,
          demolitionDescription: required ? data.townhouseData?.demolitionDescription : '',
        } as any
      });
    }
  };

  const updateDemolitionDescription = (desc: string) => {
    if (objectType === 'house') {
      setData({
        ...data,
        houseData: {
          ...data.houseData,
          demolitionDescription: desc,
        } as any
      });
    } else {
      setData({
        ...data,
        townhouseData: {
          ...data.townhouseData,
          demolitionDescription: desc,
        } as any
      });
    }
  };

  const currentState = getCurrentState();
  const demolitionRequired = getDemolitionRequired();
  const demolitionDescription = getDemolitionDescription();

  const stateOptions = [
    {
      value: 'greenfield' as const,
      label: 'Чиста ділянка',
      icon: '🌳',
      desc: 'Будівництво з нуля на пустій ділянці',
      demolition: false,
      construction: 'Повний цикл з фундаменту'
    },
    {
      value: 'foundation_only' as const,
      label: 'Є фундамент',
      icon: '🏗️',
      desc: 'Фундамент готовий, потрібно будувати далі',
      demolition: false,
      construction: 'Зведення стін та дах'
    },
    {
      value: 'shell' as const,
      label: 'Коробка (стіни + дах)',
      icon: '🏚️',
      desc: 'Є фундамент, стіни та дах. Голі стіни, комунікацій немає',
      demolition: false,
      construction: 'Тільки нові комунікації та оздоблення'
    },
    {
      value: 'rough_utilities' as const,
      label: 'Коробка + комунікації',
      icon: '🔌',
      desc: 'Коробка з прокладеними комунікаціями, готова під оздоблення',
      demolition: false,
      construction: 'Тільки оздоблювальні роботи'
    },
    {
      value: 'existing_building' as const,
      label: 'Існуюча будівля',
      icon: '🏡',
      desc: 'Реконструкція/ремонт готового будинку',
      demolition: true,
      construction: 'Демонтаж старого + нове'
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Поточний стан будівлі</h3>
        <p className="text-sm text-muted-foreground">
          Що вже є на ділянці? Це критично важливо для точного кошторису
        </p>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-800">
            <strong>Чому це важливо:</strong> Якщо будівля в стані "коробка" (голі стіни),
            AI НЕ додасть демонтаж плитки, шпалер, підлоги - бо їх ще немає.
            Це запобігає зайвим позиціям у кошторисі.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {stateOptions.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative flex items-start gap-4 p-5 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md",
              currentState === option.value
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <input
              type="radio"
              name="currentState"
              value={option.value}
              checked={currentState === option.value}
              onChange={(e) => updateCurrentState(e.target.value as any)}
              className="sr-only"
            />
            <span className="text-4xl flex-shrink-0">{option.icon}</span>
            <div className="flex-1">
              <div className="font-semibold text-base mb-1">{option.label}</div>
              <div className="text-sm text-muted-foreground mb-2">{option.desc}</div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant={option.demolition ? "destructive" : "outline"} className="text-xs">
                  {option.demolition ? '🔨 Потрібен демонтаж' : '✓ БЕЗ демонтажу'}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {option.construction}
                </Badge>
              </div>
            </div>
            {currentState === option.value && (
              <Check className="h-6 w-6 text-primary flex-shrink-0" />
            )}
          </label>
        ))}
      </div>

      {/* Питання про демонтаж (показувати для всіх станів окрім greenfield) */}
      {currentState && currentState !== 'greenfield' && (
        <div className="mt-6 p-6 border-2 border-dashed border-orange-300 rounded-xl bg-orange-50/30">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="h-6 w-6 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-base mb-1">Чи потрібен демонтаж?</h4>
              <p className="text-sm text-muted-foreground">
                {currentState === 'existing_building'
                  ? 'Реконструкція зазвичай включає демонтаж старого'
                  : currentState === 'shell'
                  ? 'Коробка має голі стіни, але можливо треба демонтувати якісь перегородки?'
                  : 'Чи потрібно щось демонтувати перед будівництвом?'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label
              className={cn(
                "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all",
                !demolitionRequired && "border-green-500 bg-green-50"
              )}
            >
              <input
                type="radio"
                name={`demolition-${objectType}`}
                checked={!demolitionRequired}
                onChange={() => updateDemolitionRequired(false)}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="font-medium">❌ Ні, демонтажні роботи НЕ потрібні</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Тільки будівництво нового. AI НЕ додасть жодних позицій демонтажу.
                </div>
              </div>
            </label>

            <label
              className={cn(
                "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all",
                demolitionRequired && "border-orange-500 bg-orange-50"
              )}
            >
              <input
                type="radio"
                name={`demolition-${objectType}`}
                checked={demolitionRequired}
                onChange={() => updateDemolitionRequired(true)}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="font-medium">✅ Так, є демонтажні роботи</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Вкажіть що саме потрібно демонтувати (AI врахує це)
                </div>
              </div>
            </label>
          </div>

          {demolitionRequired && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">
                Опишіть що потрібно демонтувати:
              </label>
              <textarea
                value={demolitionDescription}
                onChange={(e) => updateDemolitionDescription(e.target.value)}
                placeholder="Наприклад: демонтаж 2 перегородок (12 м.п. з газоблоку), демонтаж старого дверного прорізу..."
                rows={3}
                className="w-full px-4 py-2 border rounded-lg text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                💡 Підказка: Вкажіть конкретно що демонтувати. Все інше AI вважатиме "голими стінами" і не додасть зайвий демонтаж.
              </p>
            </div>
          )}

          {!demolitionRequired && currentState === 'shell' && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-green-100 border border-green-300 rounded-lg">
              <Check className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-800">
                <strong>Відмінно!</strong> AI НЕ додасть демонтаж плитки, шпалер, стяжки, підлоги.
                Кошторис буде тільки на нове будівництво.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 3: Terrain and Site Preparation (only for house)
function WizardStep3_Terrain({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const terrain = data.houseData?.terrain || {
    soilType: 'unknown',
    groundwaterDepth: 'unknown',
    slope: 'flat',
    needsExcavation: false,
    needsDrainage: false,
  };

  const updateTerrain = (updates: Partial<typeof terrain>) => {
    setData({
      ...data,
      houseData: {
        ...data.houseData,
        terrain: { ...terrain, ...updates },
      } as any
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 <strong>Підготовка ділянки:</strong> Інформація про місцевість допоможе точно розрахувати роботи з підготовки та фундаменту
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Тип ґрунту</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'clay', label: 'Глина' },
            { value: 'sand', label: 'Пісок' },
            { value: 'rock', label: 'Скеля' },
            { value: 'mixed', label: 'Змішаний' },
            { value: 'unknown', label: 'Не знаю' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-2 p-3 border rounded-lg cursor-pointer",
                terrain.soilType === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="soilType"
                value={option.value}
                checked={terrain.soilType === option.value}
                onChange={(e) => updateTerrain({ soilType: e.target.value as any })}
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Рівень ґрунтових вод</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'shallow', label: 'Близько (< 2м)' },
            { value: 'medium', label: 'Середньо (2-5м)' },
            { value: 'deep', label: 'Глибоко (> 5м)' },
            { value: 'unknown', label: 'Не знаю' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-2 p-3 border rounded-lg cursor-pointer",
                terrain.groundwaterDepth === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="groundwaterDepth"
                value={option.value}
                checked={terrain.groundwaterDepth === option.value}
                onChange={(e) => updateTerrain({ groundwaterDepth: e.target.value as any })}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Ухил ділянки</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'flat', label: 'Рівна' },
            { value: 'slight', label: 'Невеликий' },
            { value: 'steep', label: 'Крутий' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-2 p-3 border rounded-lg cursor-pointer",
                terrain.slope === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="slope"
                value={option.value}
                checked={terrain.slope === option.value}
                onChange={(e) => updateTerrain({ slope: e.target.value as any })}
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={terrain.needsExcavation}
            onChange={(e) => updateTerrain({ needsExcavation: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Потрібна розкопка</div>
            <div className="text-xs text-muted-foreground">Виїмка грунту</div>
          </div>
        </label>

        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={terrain.needsDrainage}
            onChange={(e) => updateTerrain({ needsDrainage: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Потрібен дренаж</div>
            <div className="text-xs text-muted-foreground">Відведення води</div>
          </div>
        </label>
      </div>
    </div>
  );
}

// Step 4: Foundation (only for house, if workScope includes foundation)
function WizardStep4_Foundation({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const foundation = data.houseData?.foundation || {
    type: 'strip',
    depth: '',
    width: '',
    reinforcement: 'standard',
    waterproofing: true,
    insulation: false,
  };

  const updateFoundation = (updates: Partial<typeof foundation>) => {
    setData({
      ...data,
      houseData: {
        ...data.houseData,
        foundation: { ...foundation, ...updates },
      } as any
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          🏗️ <strong>Фундамент:</strong> Основа вашого будинку - від цього залежить міцність всієї конструкції
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Тип фундаменту</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'strip', label: 'Стрічковий', desc: 'Найпопулярніший' },
            { value: 'slab', label: 'Плитний', desc: 'Монолітна плита' },
            { value: 'pile', label: 'Пальовий', desc: 'Для складного грунту' },
            { value: 'combined', label: 'Комбінований', desc: 'Змішаний тип' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                foundation.type === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="foundationType"
                value={option.value}
                checked={foundation.type === option.value}
                onChange={(e) => updateFoundation({ type: e.target.value as any })}
                className="sr-only"
              />
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Глибина (м)</label>
          <input
            type="number"
            step="0.1"
            value={foundation.depth}
            onChange={(e) => updateFoundation({ depth: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="1.2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Ширина (м)</label>
          <input
            type="number"
            step="0.1"
            value={foundation.width}
            onChange={(e) => updateFoundation({ width: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="0.4"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Армування</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'light', label: 'Легке' },
            { value: 'standard', label: 'Стандарт' },
            { value: 'heavy', label: 'Посилене' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-2 p-3 border rounded-lg cursor-pointer",
                foundation.reinforcement === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="reinforcement"
                value={option.value}
                checked={foundation.reinforcement === option.value}
                onChange={(e) => updateFoundation({ reinforcement: e.target.value as any })}
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={foundation.waterproofing}
            onChange={(e) => updateFoundation({ waterproofing: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Гідроізоляція</div>
            <div className="text-xs text-muted-foreground">Захист від вологи</div>
          </div>
        </label>

        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={foundation.insulation}
            onChange={(e) => updateFoundation({ insulation: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Утеплення</div>
            <div className="text-xs text-muted-foreground">Теплоізоляція</div>
          </div>
        </label>
      </div>

      {foundation.insulation && (
        <div>
          <label className="block text-sm font-medium mb-2">Товщина утеплення (мм)</label>
          <input
            type="number"
            value={foundation.insulationThickness || ''}
            onChange={(e) => updateFoundation({ insulationThickness: parseInt(e.target.value) || undefined })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="50"
          />
        </div>
      )}
    </div>
  );
}

// Step 5: Walls (only for house, if workScope includes walls)
function WizardStep5_Walls({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const walls = data.houseData?.walls || {
    material: 'gasblock',
    thickness: '',
    insulation: false,
    hasLoadBearing: true,
    partitionMaterial: 'same',
  };

  const updateWalls = (updates: Partial<typeof walls>) => {
    setData({
      ...data,
      houseData: {
        ...data.houseData,
        walls: { ...walls, ...updates },
      } as any
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          🧱 <strong>Стіни:</strong> Матеріал стін впливає на термоізоляцію, міцність та вартість будівництва
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Матеріал несучих стін</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'gasblock', label: 'Газоблок', desc: 'Популярний, теплий' },
            { value: 'brick', label: 'Цегла', desc: 'Надійний, класичний' },
            { value: 'wood', label: 'Дерево', desc: 'Екологічний' },
            { value: 'panel', label: 'Панель', desc: 'Швидка збудова' },
            { value: 'monolith', label: 'Моноліт', desc: 'Максимальна міцність' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                walls.material === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="wallMaterial"
                value={option.value}
                checked={walls.material === option.value}
                onChange={(e) => updateWalls({ material: e.target.value as any })}
                className="sr-only"
              />
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Товщина стін (мм)</label>
        <input
          type="number"
          value={walls.thickness}
          onChange={(e) => updateWalls({ thickness: e.target.value })}
          className="w-full px-4 py-2 border rounded-lg"
          placeholder="400"
        />
      </div>

      <div>
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={walls.insulation}
            onChange={(e) => updateWalls({ insulation: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Додаткове утеплення стін</div>
            <div className="text-xs text-muted-foreground">Зовнішня теплоізоляція</div>
          </div>
        </label>
      </div>

      {walls.insulation && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">Тип утеплення</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'foam', label: 'Пінопласт' },
                { value: 'mineral', label: 'Мінвата' },
                { value: 'ecowool', label: 'Екова' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-center gap-2 p-3 border rounded-lg cursor-pointer",
                    walls.insulationType === option.value && "border-primary bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    name="insulationType"
                    value={option.value}
                    checked={walls.insulationType === option.value}
                    onChange={(e) => updateWalls({ insulationType: e.target.value as any })}
                  />
                  <span className="text-sm font-medium">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Товщина утеплення (мм)</label>
            <input
              type="number"
              value={walls.insulationThickness || ''}
              onChange={(e) => updateWalls({ insulationThickness: parseInt(e.target.value) || undefined })}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="100"
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Матеріал перегородок</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'same', label: 'Такий самий' },
            { value: 'gasblock', label: 'Газоблок' },
            { value: 'brick', label: 'Цегла' },
            { value: 'gypsum', label: 'Гіпсокартон' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-2 p-3 border rounded-lg cursor-pointer",
                walls.partitionMaterial === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="partitionMaterial"
                value={option.value}
                checked={walls.partitionMaterial === option.value}
                onChange={(e) => updateWalls({ partitionMaterial: e.target.value as any })}
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Step 6: Roof (only for house, if workScope includes roof)
function WizardStep6_Roof({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const roof = data.houseData?.roof || {
    type: 'pitched',
    material: 'metal_tile',
    insulation: true,
    attic: 'cold',
    gutterSystem: true,
    roofWindows: 0,
  };

  const updateRoof = (updates: Partial<typeof roof>) => {
    setData({
      ...data,
      houseData: {
        ...data.houseData,
        roof: { ...roof, ...updates },
      } as any
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          🏠 <strong>Покрівля:</strong> Надійний дах захищає будинок від негоди та забезпечує комфорт
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Тип даху</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'pitched', label: 'Скатний', desc: 'Класичний варіант' },
            { value: 'flat', label: 'Плоский', desc: 'Сучасний стиль' },
            { value: 'mansard', label: 'Мансардний', desc: 'Житловий горищ' },
            { value: 'combined', label: 'Комбінований', desc: 'Складна форма' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                roof.type === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="roofType"
                value={option.value}
                checked={roof.type === option.value}
                onChange={(e) => updateRoof({ type: e.target.value as any })}
                className="sr-only"
              />
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {(roof.type === 'pitched' || roof.type === 'mansard') && (
        <div>
          <label className="block text-sm font-medium mb-2">Кут нахилу (градуси)</label>
          <input
            type="number"
            min="15"
            max="60"
            value={roof.pitchAngle || ''}
            onChange={(e) => updateRoof({ pitchAngle: parseInt(e.target.value) || undefined })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="30"
          />
          <p className="text-xs text-muted-foreground mt-1">Рекомендовано: 25-45°</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Покрівельний матеріал</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'metal_tile', label: 'Металочерепиця', desc: 'Популярний вибір' },
            { value: 'soft_tile', label: 'М\'яка черепиця', desc: 'Безшумна' },
            { value: 'profiled_sheet', label: 'Профнастил', desc: 'Економ варіант' },
            { value: 'ceramic', label: 'Керамічна', desc: 'Преміум класу' },
            { value: 'slate', label: 'Шифер', desc: 'Бюджетний' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                roof.material === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="roofMaterial"
                value={option.value}
                checked={roof.material === option.value}
                onChange={(e) => updateRoof({ material: e.target.value as any })}
                className="sr-only"
              />
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={roof.insulation}
            onChange={(e) => updateRoof({ insulation: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Утеплення даху</div>
            <div className="text-xs text-muted-foreground">Теплоізоляція покрівлі</div>
          </div>
        </label>
      </div>

      {roof.insulation && (
        <div>
          <label className="block text-sm font-medium mb-2">Товщина утеплення (мм)</label>
          <input
            type="number"
            value={roof.insulationThickness || ''}
            onChange={(e) => updateRoof({ insulationThickness: parseInt(e.target.value) || undefined })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="200"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Використання горища/мансарди</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'cold', label: 'Холодне', desc: 'Не опалюється' },
            { value: 'warm', label: 'Тепле', desc: 'Опалення є' },
            { value: 'living', label: 'Житлове', desc: 'Повноцінна кімната' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                roof.attic === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="attic"
                value={option.value}
                checked={roof.attic === option.value}
                onChange={(e) => updateRoof({ attic: e.target.value as any })}
                className="sr-only"
              />
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={roof.gutterSystem}
            onChange={(e) => updateRoof({ gutterSystem: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Система водостоків</div>
            <div className="text-xs text-muted-foreground">Ринви та труби</div>
          </div>
        </label>

        <div>
          <label className="block text-sm font-medium mb-2">Мансардні вікна</label>
          <input
            type="number"
            min="0"
            value={roof.roofWindows || 0}
            onChange={(e) => updateRoof({ roofWindows: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}

// Step 7: Utilities (Engineering Systems)
function WizardStep7_Utilities({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const utilities = data.utilities || {
    electrical: { power: 'three_phase', outlets: 20, switches: 15, lightPoints: 25, outdoorLighting: true },
    heating: { type: 'gas', radiators: 10, underfloor: false },
    water: { coldWater: true, hotWater: true, source: 'central', boilerType: 'gas' },
    sewerage: { type: 'central', pumpNeeded: false },
    ventilation: { natural: true, forced: true, recuperation: false },
  };

  const updateUtilities = (section: keyof typeof utilities, updates: any) => {
    setData({
      ...data,
      utilities: {
        ...utilities,
        [section]: { ...utilities[section], ...updates },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          ⚡ <strong>Інженерні системи:</strong> Детально вкажіть всі комунікації для точного розрахунку
        </p>
      </div>

      {/* Electrical */}
      <div className="border rounded-lg p-4 space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          ⚡ Електрика
        </h4>

        <div>
          <label className="block text-sm font-medium mb-2">Тип електроживлення</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'single_phase', label: '1-фазна (220В)', desc: 'Стандартна' },
              { value: 'three_phase', label: '3-фазна (380В)', desc: 'Потужна' },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                  utilities.electrical.power === option.value && "border-primary bg-primary/5"
                )}
              >
                <input
                  type="radio"
                  name="electricalPower"
                  value={option.value}
                  checked={utilities.electrical.power === option.value}
                  onChange={(e) => updateUtilities('electrical', { power: e.target.value })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Розетки (шт)</label>
            <input
              type="number"
              min="0"
              value={utilities.electrical.outlets || 0}
              onChange={(e) => updateUtilities('electrical', { outlets: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Вимикачі (шт)</label>
            <input
              type="number"
              min="0"
              value={utilities.electrical.switches || 0}
              onChange={(e) => updateUtilities('electrical', { switches: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="15"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Світильники (шт)</label>
            <input
              type="number"
              min="0"
              value={utilities.electrical.lightPoints || 0}
              onChange={(e) => updateUtilities('electrical', { lightPoints: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="25"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={utilities.electrical.outdoorLighting || false}
            onChange={(e) => updateUtilities('electrical', { outdoorLighting: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm font-medium">Зовнішнє освітлення</span>
        </label>
      </div>

      {/* Heating */}
      <div className="border rounded-lg p-4 space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          🔥 Опалення
        </h4>

        <div>
          <label className="block text-sm font-medium mb-2">Тип опалення</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'gas', label: 'Газове', desc: 'Економічне' },
              { value: 'electric', label: 'Електричне', desc: 'Без газу' },
              { value: 'solid_fuel', label: 'Тверде паливо', desc: 'Дрова/пелети' },
              { value: 'heat_pump', label: 'Тепловий насос', desc: 'Енергоефективне' },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                  utilities.heating.type === option.value && "border-primary bg-primary/5"
                )}
              >
                <input
                  type="radio"
                  name="heatingType"
                  value={option.value}
                  checked={utilities.heating.type === option.value}
                  onChange={(e) => updateUtilities('heating', { type: e.target.value })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Радіатори (шт)</label>
            <input
              type="number"
              min="0"
              value={utilities.heating.radiators || 0}
              onChange={(e) => updateUtilities('heating', { radiators: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="10"
            />
          </div>
          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={utilities.heating.underfloor || false}
              onChange={(e) => updateUtilities('heating', { underfloor: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm font-medium">Тепла підлога</span>
          </label>
        </div>
      </div>

      {/* Water & Sewerage */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            💧 Водопостачання
          </h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={utilities.water.coldWater}
                onChange={(e) => updateUtilities('water', { coldWater: e.target.checked })}
                className="rounded"
              />
              Холодна вода
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={utilities.water.hotWater}
                onChange={(e) => updateUtilities('water', { hotWater: e.target.checked })}
                className="rounded"
              />
              Гаряча вода
            </label>
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            🚰 Каналізація
          </h4>
          <div>
            <label className="block text-sm font-medium mb-2">Тип</label>
            <select
              value={utilities.sewerage.type}
              onChange={(e) => updateUtilities('sewerage', { type: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="central">Центральна</option>
              <option value="septic">Септик</option>
              <option value="treatment">Очисні споруди</option>
            </select>
          </div>
        </div>
      </div>

      {/* Ventilation */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          💨 Вентиляція
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm p-2 border rounded cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={utilities.ventilation.natural}
              onChange={(e) => updateUtilities('ventilation', { natural: e.target.checked })}
              className="rounded"
            />
            Природна
          </label>
          <label className="flex items-center gap-2 text-sm p-2 border rounded cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={utilities.ventilation.forced}
              onChange={(e) => updateUtilities('ventilation', { forced: e.target.checked })}
              className="rounded"
            />
            Примусова
          </label>
          <label className="flex items-center gap-2 text-sm p-2 border rounded cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={utilities.ventilation.recuperation || false}
              onChange={(e) => updateUtilities('ventilation', { recuperation: e.target.checked })}
              className="rounded"
            />
            Рекуперація
          </label>
        </div>
      </div>
    </div>
  );
}

// Step 8: Finishing
function WizardStep8_Finishing({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const finishing = data.finishing || {
    walls: { material: 'paint', qualityLevel: 'standard' },
    flooring: {},
    ceiling: { type: 'paint', levels: 1, lighting: 'spots' },
  };

  const updateFinishing = (section: keyof typeof finishing, updates: any) => {
    setData({
      ...data,
      finishing: {
        ...finishing,
        [section]: { ...finishing[section], ...updates },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          🎨 <strong>Оздоблення:</strong> Вкажіть матеріали для фінішних робіт
        </p>
      </div>

      {/* Walls */}
      <div className="border rounded-lg p-4 space-y-4">
        <h4 className="font-semibold">Стіни</h4>

        <div>
          <label className="block text-sm font-medium mb-2">Основний матеріал</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'paint', label: 'Фарба', desc: 'Класичний варіант' },
              { value: 'wallpaper', label: 'Шпалери', desc: 'Затишок' },
              { value: 'tile', label: 'Плитка', desc: 'Ванна/кухня' },
              { value: 'panels', label: 'Панелі', desc: 'Декоративні' },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                  finishing.walls.material === option.value && "border-primary bg-primary/5"
                )}
              >
                <input
                  type="radio"
                  name="wallMaterial"
                  value={option.value}
                  checked={finishing.walls.material === option.value}
                  onChange={(e) => updateFinishing('walls', { material: e.target.value })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Рівень якості</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'economy', label: 'Економ' },
              { value: 'standard', label: 'Стандарт' },
              { value: 'premium', label: 'Преміум' },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex items-center justify-center p-3 border rounded-lg cursor-pointer",
                  finishing.walls.qualityLevel === option.value && "border-primary bg-primary/5"
                )}
              >
                <input
                  type="radio"
                  name="wallQuality"
                  value={option.value}
                  checked={finishing.walls.qualityLevel === option.value}
                  onChange={(e) => updateFinishing('walls', { qualityLevel: e.target.value })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Flooring */}
      <div className="border rounded-lg p-4 space-y-4">
        <h4 className="font-semibold">Підлога</h4>
        <p className="text-xs text-muted-foreground">Вкажіть площу для кожного типу покриття (м²)</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Плитка (м²)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={finishing.flooring.tile || ''}
              onChange={(e) => updateFinishing('flooring', { tile: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ламінат (м²)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={finishing.flooring.laminate || ''}
              onChange={(e) => updateFinishing('flooring', { laminate: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Паркет (м²)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={finishing.flooring.parquet || ''}
              onChange={(e) => updateFinishing('flooring', { parquet: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Вініл (м²)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={finishing.flooring.vinyl || ''}
              onChange={(e) => updateFinishing('flooring', { vinyl: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Ceiling */}
      <div className="border rounded-lg p-4 space-y-4">
        <h4 className="font-semibold">Стеля</h4>

        <div>
          <label className="block text-sm font-medium mb-2">Тип</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'paint', label: 'Фарба', desc: 'Просто' },
              { value: 'drywall', label: 'Гіпсокартон', desc: 'Вирівнювання' },
              { value: 'suspended', label: 'Підвісна', desc: 'Модульна' },
              { value: 'stretch', label: 'Натяжна', desc: 'Швидко' },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex flex-col gap-1 p-3 border rounded-lg cursor-pointer",
                  finishing.ceiling.type === option.value && "border-primary bg-primary/5"
                )}
              >
                <input
                  type="radio"
                  name="ceilingType"
                  value={option.value}
                  checked={finishing.ceiling.type === option.value}
                  onChange={(e) => updateFinishing('ceiling', { type: e.target.value })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Рівні стелі</label>
            <select
              value={finishing.ceiling.levels}
              onChange={(e) => updateFinishing('ceiling', { levels: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="1">1 рівень</option>
              <option value="2">2 рівні</option>
              <option value="3">3 рівні</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Освітлення</label>
            <select
              value={finishing.ceiling.lighting}
              onChange={(e) => updateFinishing('ceiling', { lighting: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="spots">Точкові світильники</option>
              <option value="chandelier">Люстра</option>
              <option value="led">LED стрічка</option>
              <option value="mixed">Змішане</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// Townhouse-specific step (after general info for townhouses)
function WizardStepTownhouse({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const townhouseData = data.townhouseData || {
    currentState: 'shell' as const,
    adjacentWalls: 1,
    isEndUnit: false,
    sharedUtilities: false,
  };

  const updateTownhouse = (updates: Partial<typeof townhouseData>) => {
    setData({
      ...data,
      townhouseData: { ...townhouseData, ...updates },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          🏘️ <strong>Особливості котеджу:</strong> Таунхаус має специфіку через суміжні стіни з сусідами
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Кількість суміжних стін</label>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={cn(
              "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer",
              townhouseData.adjacentWalls === 1 && "border-primary bg-primary/5"
            )}
          >
            <input
              type="radio"
              name="adjacentWalls"
              value="1"
              checked={townhouseData.adjacentWalls === 1}
              onChange={() => updateTownhouse({ adjacentWalls: 1 })}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="font-semibold">Одна суміжна стіна</div>
              <div className="text-xs text-muted-foreground mt-1">Крайній в ряді</div>
            </div>
            {townhouseData.adjacentWalls === 1 && <Check className="h-5 w-5 text-primary" />}
          </label>

          <label
            className={cn(
              "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer",
              townhouseData.adjacentWalls === 2 && "border-primary bg-primary/5"
            )}
          >
            <input
              type="radio"
              name="adjacentWalls"
              value="2"
              checked={townhouseData.adjacentWalls === 2}
              onChange={() => updateTownhouse({ adjacentWalls: 2 })}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="font-semibold">Дві суміжні стіни</div>
              <div className="text-xs text-muted-foreground mt-1">Середній в ряді</div>
            </div>
            {townhouseData.adjacentWalls === 2 && <Check className="h-5 w-5 text-primary" />}
          </label>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={townhouseData.isEndUnit}
            onChange={(e) => updateTownhouse({ isEndUnit: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Крайній в ряді</div>
            <div className="text-xs text-muted-foreground">З одного боку відкрита стіна</div>
          </div>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={townhouseData.sharedUtilities}
            onChange={(e) => updateTownhouse({ sharedUtilities: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Спільні комунікації</div>
            <div className="text-xs text-muted-foreground">Загальна котельня, водопостачання тощо</div>
          </div>
        </label>
      </div>
    </div>
  );
}

// Renovation: Current State (for apartments/offices)
function WizardStepRenovation_CurrentState({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const renovationData = data.renovationData || {
    currentStage: 'bare_concrete' as RenovationStage,
    existing: {
      roughPlaster: false,
      roughFloor: false,
      finishFloor: false,
      electricalRoughIn: false,
      plumbingRoughIn: false,
      heatingRoughIn: false,
      windowsInstalled: false,
      doorsInstalled: false,
    },
    workRequired: {
      demolition: false,
      roughPlaster: false,
      roughFloor: false,
      electrical: false,
      plumbing: false,
      heating: false,
      finishPlaster: false,
      painting: false,
      flooring: false,
      tiling: false,
      ceiling: 'none',
      windows: false,
      doors: false,
    },
    layoutChange: false,
    newPartitions: false,
    rooms: {
      bedrooms: 0,
      bathrooms: 0,
      kitchen: 0,
      living: 0,
      other: 0,
    },
  };

  const updateRenovation = (updates: Partial<typeof renovationData>) => {
    setData({
      ...data,
      renovationData: { ...renovationData, ...updates },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          🔨 <strong>Поточний стан:</strong> Визначте що вже є, щоб точно розрахувати обсяг робіт
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">На якій стадії приміщення зараз?</label>
        <div className="grid grid-cols-1 gap-3">
          {[
            { value: 'bare_concrete' as RenovationStage, label: 'Голий бетон', desc: 'Нова будівля без обробки' },
            { value: 'rough_walls' as RenovationStage, label: 'Чорнова штукатурка є', desc: 'Стіни вирівняні' },
            { value: 'rough_floor' as RenovationStage, label: 'Чорнова стяжка є', desc: 'Підлога вирівняна' },
            { value: 'utilities_installed' as RenovationStage, label: 'Комунікації встановлені', desc: 'Електрика, сантехніка прокладені' },
            { value: 'ready_for_finish' as RenovationStage, label: 'Готово під чистове', desc: 'Все готово для фінішного оздоблення' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer",
                renovationData.currentStage === option.value && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="currentStage"
                value={option.value}
                checked={renovationData.currentStage === option.value}
                onChange={(e) => updateRenovation({ currentStage: e.target.value as RenovationStage })}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="font-semibold">{option.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{option.desc}</div>
              </div>
              {renovationData.currentStage === option.value && <Check className="h-5 w-5 text-primary" />}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-3">Що вже є в приміщенні?</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={renovationData.existing.roughPlaster}
              onChange={(e) => updateRenovation({
                existing: { ...renovationData.existing, roughPlaster: e.target.checked }
              })}
              className="rounded"
            />
            <span className="text-sm">Чорнова штукатурка</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={renovationData.existing.roughFloor}
              onChange={(e) => updateRenovation({
                existing: { ...renovationData.existing, roughFloor: e.target.checked }
              })}
              className="rounded"
            />
            <span className="text-sm">Чорнова стяжка</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={renovationData.existing.electricalRoughIn}
              onChange={(e) => updateRenovation({
                existing: { ...renovationData.existing, electricalRoughIn: e.target.checked }
              })}
              className="rounded"
            />
            <span className="text-sm">Електрика прокладена</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={renovationData.existing.plumbingRoughIn}
              onChange={(e) => updateRenovation({
                existing: { ...renovationData.existing, plumbingRoughIn: e.target.checked }
              })}
              className="rounded"
            />
            <span className="text-sm">Сантехніка прокладена</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={renovationData.existing.windowsInstalled}
              onChange={(e) => updateRenovation({
                existing: { ...renovationData.existing, windowsInstalled: e.target.checked }
              })}
              className="rounded"
            />
            <span className="text-sm">Вікна встановлені</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={renovationData.existing.doorsInstalled}
              onChange={(e) => updateRenovation({
                existing: { ...renovationData.existing, doorsInstalled: e.target.checked }
              })}
              className="rounded"
            />
            <span className="text-sm">Двері встановлені</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={renovationData.layoutChange}
            onChange={(e) => updateRenovation({ layoutChange: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Зміна планування</div>
            <div className="text-xs text-muted-foreground">Перенесення стін</div>
          </div>
        </label>

        <label className="flex items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted">
          <input
            type="checkbox"
            checked={renovationData.newPartitions}
            onChange={(e) => updateRenovation({ newPartitions: e.target.checked })}
            className="rounded"
          />
          <div>
            <div className="text-sm font-medium">Нові перегородки</div>
            <div className="text-xs text-muted-foreground">Додаткові стіни</div>
          </div>
        </label>
      </div>
    </div>
  );
}

// Commercial-specific step
function WizardStepCommercial({ data, setData }: { data: WizardData; setData: (d: WizardData) => void }) {
  const commercialData = data.commercialData || {
    purpose: 'shop' as const,
    floor: {
      type: 'standard' as const,
      antiStatic: false,
    },
    fireRating: false,
    hvac: false,
    heavyDutyElectrical: false,
    accessControl: false,
    surveillance: false,
  };

  const updateCommercial = (updates: Partial<typeof commercialData>) => {
    setData({
      ...data,
      commercialData: { ...commercialData, ...updates },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          🏭 <strong>Комерційне приміщення:</strong> Спеціальні вимоги для бізнесу
        </p>
      </div>

      {/* Current State - для нового будівництва / реконструкції */}
      {(data.workScope === 'full_cycle' || data.workScope === 'reconstruction') && (
        <div>
          <label className="block text-sm font-medium mb-2">Поточний стан об'єкта</label>
          <div className="grid grid-cols-1 gap-3">
            {[
              { value: 'greenfield', label: 'Чиста ділянка', icon: '🟢', desc: 'Будівництво з нуля на пустій ділянці' },
              { value: 'existing_building', label: 'Існуюча будівля', icon: '🏢', desc: 'Є стара будівля (потрібен демонтаж + нове будівництво)' },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer",
                  commercialData.currentState === option.value && "border-primary bg-primary/5"
                )}
              >
                <span className="text-2xl">{option.icon}</span>
                <div className="flex-1">
                  <input
                    type="radio"
                    name="currentState"
                    value={option.value}
                    checked={commercialData.currentState === option.value}
                    onChange={(e) => updateCommercial({ currentState: e.target.value as any })}
                    className="sr-only"
                  />
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{option.desc}</div>
                </div>
                {commercialData.currentState === option.value && <Check className="h-5 w-5 text-primary" />}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Demolition details - якщо existing_building */}
      {commercialData.currentState === 'existing_building' && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={commercialData.demolitionRequired !== false}
              onChange={(e) => updateCommercial({ demolitionRequired: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-sm">Потрібен демонтаж існуючої будівлі</div>
              <div className="text-xs text-muted-foreground mt-1">
                Повний демонтаж старої будівлі перед новим будівництвом
              </div>
            </div>
          </label>

          {commercialData.demolitionRequired !== false && (
            <div>
              <label className="block text-sm font-medium mb-2">Опис демонтажних робіт (опціонально)</label>
              <textarea
                value={commercialData.demolitionDescription || ''}
                onChange={(e) => updateCommercial({ demolitionDescription: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                rows={3}
                placeholder="Наприклад: Демонтаж одноповерхової цегляної будівлі 400 м², вивіз сміття, планування ділянки"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Призначення приміщення</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'shop', label: 'Магазин', icon: '🛒' },
            { value: 'restaurant', label: 'Ресторан/Кафе', icon: '🍽️' },
            { value: 'warehouse', label: 'Склад', icon: '📦' },
            { value: 'production', label: 'Виробництво', icon: '🏭' },
            { value: 'showroom', label: 'Шоурум', icon: '✨' },
            { value: 'other', label: 'Інше', icon: '🏪' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer",
                commercialData.purpose === option.value && "border-primary bg-primary/5"
              )}
            >
              <span className="text-2xl">{option.icon}</span>
              <input
                type="radio"
                name="purpose"
                value={option.value}
                checked={commercialData.purpose === option.value}
                onChange={(e) => updateCommercial({ purpose: e.target.value as any })}
                className="sr-only"
              />
              <span className="text-sm font-medium flex-1">{option.label}</span>
              {commercialData.purpose === option.value && <Check className="h-5 w-5 text-primary" />}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Тип підлоги</label>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={cn(
              "flex flex-col gap-2 p-4 border-2 rounded-lg cursor-pointer",
              commercialData.floor.type === 'standard' && "border-primary bg-primary/5"
            )}
          >
            <input
              type="radio"
              name="floorType"
              value="standard"
              checked={commercialData.floor.type === 'standard'}
              onChange={(e) => updateCommercial({
                floor: { ...commercialData.floor, type: e.target.value as any }
              })}
              className="sr-only"
            />
            <div className="font-semibold">Стандартна</div>
            <div className="text-xs text-muted-foreground">Звичайне навантаження</div>
          </label>

          <label
            className={cn(
              "flex flex-col gap-2 p-4 border-2 rounded-lg cursor-pointer",
              commercialData.floor.type === 'industrial' && "border-primary bg-primary/5"
            )}
          >
            <input
              type="radio"
              name="floorType"
              value="industrial"
              checked={commercialData.floor.type === 'industrial'}
              onChange={(e) => updateCommercial({
                floor: { ...commercialData.floor, type: e.target.value as any }
              })}
              className="sr-only"
            />
            <div className="font-semibold">Промислова</div>
            <div className="text-xs text-muted-foreground">Високе навантаження</div>
          </label>
        </div>
      </div>

      {commercialData.floor.type === 'industrial' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">Покриття підлоги</label>
            <select
              value={commercialData.floor.coating || ''}
              onChange={(e) => updateCommercial({
                floor: { ...commercialData.floor, coating: e.target.value as any }
              })}
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="">Оберіть покриття</option>
              <option value="epoxy">Епоксидне</option>
              <option value="polyurethane">Поліуретанове</option>
              <option value="tile">Плитка</option>
              <option value="concrete">Бетон</option>
              <option value="other">Інше</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Навантаження на підлогу (кг/м²)</label>
            <input
              type="number"
              value={commercialData.floor.loadCapacity || ''}
              onChange={(e) => updateCommercial({
                floor: { ...commercialData.floor, loadCapacity: parseInt(e.target.value) || undefined }
              })}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="500"
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium mb-3">Додаткові вимоги</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={commercialData.floor.antiStatic}
              onChange={(e) => updateCommercial({
                floor: { ...commercialData.floor, antiStatic: e.target.checked }
              })}
              className="rounded"
            />
            <span className="text-sm">Антистатична підлога</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={commercialData.fireRating}
              onChange={(e) => updateCommercial({ fireRating: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Протипожежні вимоги</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={commercialData.hvac}
              onChange={(e) => updateCommercial({ hvac: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Потужна вентиляція</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={commercialData.heavyDutyElectrical}
              onChange={(e) => updateCommercial({ heavyDutyElectrical: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Підвищене навантаження електрики</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={commercialData.accessControl}
              onChange={(e) => updateCommercial({ accessControl: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Контроль доступу</span>
          </label>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
            <input
              type="checkbox"
              checked={commercialData.surveillance}
              onChange={(e) => updateCommercial({ surveillance: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Відеоспостереження</span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default function AIEstimatePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [projectType, setProjectType] = useState("ремонт квартири");
  const [area, setArea] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(WORK_CATEGORIES.map(c => c.id)) // За замовчуванням всі категорії вибрані
  );
  const [selectedGenerationModel, setSelectedGenerationModel] = useState<"gemini" | "openai" | "anthropic" | "pipeline">("gemini");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("custom");
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
  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [supplementInfo, setSupplementInfo] = useState("");
  const [supplementFiles, setSupplementFiles] = useState<File[]>([]);
  const [supplementing, setSupplementing] = useState(false);
  const [supplementProgress, setSupplementProgress] = useState<{ message: string; progress: number } | null>(null);
  const supplementFileInputRef = useRef<HTMLInputElement>(null);
  const [savedEstimateId, setSavedEstimateId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardCompleted, setWizardCompleted] = useState(false);

  // Prozorro state
  const [checkProzorro, setCheckProzorro] = useState(true);

  // Pre-analysis state
  const [showPreAnalysis, setShowPreAnalysis] = useState(false);
  const [preAnalysisData, setPreAnalysisData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Batch upload state
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [accumulatedAnalysis, setAccumulatedAnalysis] = useState<any>(null);

  // Engineering report state (temporarily disabled)
  // const [engineeringReport, setEngineeringReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Chunked generation state
  const [isChunkedGenerating, setIsChunkedGenerating] = useState(false);
  const [chunkedProgress, setChunkedProgress] = useState<{
    phase: number | string;
    status: 'analyzing' | 'generating' | 'complete' | 'error';
    message: string;
    progress: number;
    data?: any;
  } | null>(null);
  const [chunkedSections, setChunkedSections] = useState<any[]>([]);

  const [wizardData, setWizardData] = useState<WizardData>({
    // Step 0: Object Type
    objectType: 'house',
    // Step 1: Work Scope
    workScope: 'full_cycle',
    // General data
    totalArea: '',
    floors: 2,
    ceilingHeight: '2.7',
    // Utilities (for all types)
    utilities: {
      electrical: {
        power: 'single_phase',
        outlets: 0,
        switches: 0,
        lightPoints: 0,
        outdoorLighting: false,
      },
      heating: {
        type: 'none',
      },
      water: {
        coldWater: false,
        hotWater: false,
        source: 'central',
      },
      sewerage: {
        type: 'central',
        pumpNeeded: false,
      },
      ventilation: {
        natural: true,
        forced: false,
        recuperation: false,
      },
    },
    // Finishing
    finishing: {
      walls: {
        material: 'paint',
        qualityLevel: 'standard',
      },
      flooring: {},
      ceiling: {
        type: 'paint',
        levels: 1,
        lighting: 'mixed',
      },
    },
  });

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

  // Auto-trigger wizard for complex projects
  useEffect(() => {
    // Reset wizard completion when template changes to allow re-opening
    if (['house_full', 'turnkey', 'shell'].includes(selectedTemplate)) {
      // Auto-open wizard for complex templates
      setShowWizard(true);
      setWizardCompleted(false); // Allow reopening for new template
    }
  }, [selectedTemplate]);

  // Wizard complete handler
  const handleWizardComplete = async () => {
    setShowWizard(false);
    setWizardCompleted(true);
    setWizardStep(0); // Reset to step 0 (object type selection)

    // Sync area from wizard to main form
    if (wizardData.totalArea) {
      setArea(wizardData.totalArea);
    }

    // Auto-select all categories and set default template when wizard is completed
    // This ensures backend has necessary data even though UI is hidden
    setSelectedCategories(new Set(WORK_CATEGORIES.map(c => c.id)));
    setSelectedTemplate('house_full'); // Default template, wizard data will override

    // AUTO-TRIGGER PRE-ANALYSIS after wizard completion
    if (files.length > 0) {
      console.log('🔍 Auto-triggering pre-analysis after wizard completion...');
      await preAnalyze();
    }
  };

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

  // Pre-analyze files before generation (with batch upload)
  async function preAnalyze() {
    if (files.length === 0) {
      setError("Завантажте хоча б один файл проєкту");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setUploadProgress(null);

    try {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      console.log(`🚀 R2 Direct Upload: ${files.length} файлів (${formatFileSize(totalSize)})`);

      // Завантажуємо файли напряму в R2 паралельно
      const uploadResult = await uploadFilesToR2(files, (progress) => {
        console.log(`📤 Upload progress: ${progress.uploadedFiles}/${progress.totalFiles} (${progress.percentage}%)`);
      });

      if (!uploadResult.success) {
        throw new Error(`Помилка завантаження: ${uploadResult.failed.length} файлів не завантажено`);
      }

      console.log(`✅ Всі файли завантажено в R2: ${uploadResult.r2Keys.length} файлів`);

      // Викликаємо analyze з R2 keys замість файлів
      const formData = new FormData();
      formData.append("r2Keys", JSON.stringify(uploadResult.r2Keys));

      if (wizardData) {
        formData.append("wizardData", JSON.stringify(wizardData));
      }

      const res = await fetch("/api/admin/estimates/analyze", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Помилка аналізу файлів");
      }

      const combinedResult = json;

      console.log('🔍 Pre-analysis complete:', combinedResult);

      setPreAnalysisData(combinedResult);

      // TODO: Генеруємо інженерний звіт (temporarily disabled - endpoint not implemented)
      // console.log('📊 Generating engineering report...');
      // setIsGeneratingReport(true);

      // try {
      //   const report = await generateEngineeringReport({
      //     classification: combinedResult.classification,
      //     parsedData: combinedResult.parsedData || {},
      //     filesAnalyzed: combinedResult.filesAnalyzed,
      //   });

      //   setEngineeringReport(report);
      //   console.log('✅ Engineering report generated');
      // } catch (reportError) {
      //   console.error('Failed to generate engineering report:', reportError);
      //   // Не блокуємо показ результатів, навіть якщо звіт не згенерувався
      // } finally {
      //   setIsGeneratingReport(false);
      // }
      setIsGeneratingReport(false); // Keep it disabled for now

      setShowPreAnalysis(true);

    } catch (err: any) {
      setError(err.message || "Не вдалось проаналізувати файли");
      console.error('❌ Помилка батч-завантаження:', err);
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setUploadProgress(null), 1000); // Очищаємо прогрес через 1 сек
    }
  }

  // Generate estimate (with batch upload support)
  async function generate() {
    if (files.length === 0) {
      setError("Завантажте хоча б один файл проєкту");
      return;
    }
    setLoading(true);
    setError("");
    setEstimate(null);
    setUploadProgress(null);

    try {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      console.log(`🚀 Генерація з ${files.length} файлів (${formatFileSize(totalSize)})`);

      // Завантажуємо всі файли в R2 паралельно
      console.log('📤 Uploading files to R2...');
      const uploadResult = await uploadFilesToR2(files, (progress) => {
        console.log(`📤 Upload: ${progress.uploadedFiles}/${progress.totalFiles} (${progress.percentage}%)`);
      });

      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.failed.length} files failed`);
      }

      console.log(`✅ All files uploaded to R2: ${uploadResult.r2Keys.length} files`);

      // Запуск генерації з R2 keys
      console.log('🤖 Starting estimate generation with R2 files...');

      const formData = new FormData();
      formData.append("r2Keys", JSON.stringify(uploadResult.r2Keys));

      formData.append("projectType", projectType);
      formData.append("area", area);
      formData.append("notes", projectNotes);
      formData.append("categories", Array.from(selectedCategories).join(","));
      formData.append("model", selectedGenerationModel);
      formData.append("template", selectedTemplate);

      // Add wizard data (always, if available - not just when completed)
      // ВАЖЛИВО: Об'єднуємо projectNotes з wizardData.specialRequirements
      if (wizardData) {
        console.log('📝 Sending wizard data:', JSON.stringify(wizardData, null, 2));

        // Log critical demolition control data
        const currentState = wizardData.houseData?.currentState || wizardData.townhouseData?.currentState;
        const demolitionRequired = wizardData.houseData?.demolitionRequired ?? wizardData.townhouseData?.demolitionRequired;
        const wallMaterial = wizardData.houseData?.walls?.material;

        console.log('🔍 Demolition control:', {
          currentState,
          demolitionRequired,
          wallMaterial,
          objectType: wizardData.objectType,
          wizardCompleted
        });

        // НОВИЙ КОД: Об'єднати projectNotes з specialRequirements
        const enrichedWizardData = {
          ...wizardData,
          specialRequirements: [
            wizardData.specialRequirements,
            projectNotes.trim() ? `\n\n=== ДОДАТКОВА ІНФОРМАЦІЯ ВІД ІНЖЕНЕРА ===\n${projectNotes.trim()}` : ''
          ].filter(Boolean).join('\n')
        };

        if (projectNotes.trim()) {
          console.log('📝 Project notes added to wizardData.specialRequirements');
        }

        formData.append("wizardData", JSON.stringify(enrichedWizardData));
      } else if (projectNotes.trim()) {
        // Якщо wizard не заповнений, але є projectNotes - створити мінімальний wizardData
        console.log('📝 Creating minimal wizardData with projectNotes only');
        formData.append("wizardData", JSON.stringify({
          specialRequirements: projectNotes.trim()
        }));
      }

      // Note: Generate endpoint все ще завантажує файли одним запитом
      // Батч-завантаження використовується тільки для pre-analysis
      // Для повного батч-завантаження треба зміни на backend
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
      setDebugInfo(json.debug || null);
      // Expand all sections by default
      setExpandedSections(new Set(json.data.sections.map((_: unknown, i: number) => i)));

      // Show debug info if available
      if (json.debug) {
        console.log('🔍 AI Generation Debug Info:', json.debug);

        if (json.debug.iterations && json.debug.iterations > 0) {
          console.log(`🔄 Iterative generation used: ${json.debug.iterations} iteration(s)`);
          if (json.debug.iterationHistory) {
            console.log('📊 Iteration history:', json.debug.iterationHistory);
          }
        }

        if (json.debug.status === 'TOO_FEW') {
          console.warn(`⚠️ AI generated ${json.debug.totalItems} items, but ${json.debug.requiredMin} required!`);
          console.warn(`   Gap: ${json.debug.gap} items missing`);
        } else if (json.debug.iterations && json.debug.iterations > 0) {
          console.log(`✅ Success! Reached ${json.debug.totalItems}/${json.debug.requiredMin} items after ${json.debug.iterations} iteration(s)`);
        }
      }

      // Show validation info if available
      if (json.validation) {
        console.log('🔍 Estimate Validation:', json.validation);
        console.log(`   Valid: ${json.validation.valid ? '✅' : '❌'}`);
        console.log(`   Errors: ${json.validation.errors?.length || 0}`);
        console.log(`   Warnings: ${json.validation.warnings?.length || 0}`);

        if (json.validation.errors && json.validation.errors.length > 0) {
          console.warn('❌ Validation Errors:');
          json.validation.errors.slice(0, 5).forEach((err: any) => {
            console.warn(`   - [${err.code}] ${err.message}`);
          });
        }

        if (json.validation.warnings && json.validation.warnings.length > 0) {
          console.log('⚠️ Validation Warnings (first 3):');
          json.validation.warnings.slice(0, 3).forEach((warn: any) => {
            console.log(`   - [${warn.code}] ${warn.message}`);
          });
        }

        if (json.validation.stats) {
          console.log('📊 Estimate Stats:');
          console.log(`   - Items: ${json.validation.stats.totalItems}`);
          console.log(`   - Total: ${json.validation.stats.totalCost?.toFixed(2)} грн`);
          console.log(`   - Items/m²: ${json.validation.stats.itemsPerSquareMeter?.toFixed(2)}`);
        }
      }

      // Автоматична верифікація через OpenAI
      await verifyEstimate(json.data);
    } catch (err) {
      setError("Не вдалось з'єднатись з сервером");
    } finally {
      setLoading(false);
    }
  }

  // Chunked generation with SSE streaming
  async function generateChunked() {
    if (files.length === 0) {
      setError("Завантажте хоча б один файл проєкту");
      return;
    }

    // 🔍 Перевірити чи проект вже векторизований
    if (selectedProjectId) {
      try {
        const statusRes = await fetch(`/api/admin/projects/${selectedProjectId}/vectorize`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();

          if (statusData.vectorized) {
            const userChoice = window.confirm(
              `📦 Цей проект вже векторизований!\n\n` +
              `Векторизовано: ${new Date(statusData.processedAt).toLocaleString('uk-UA')}\n\n` +
              `Виберіть дію:\n` +
              `• OK - Використати існуючі дані (рекомендовано)\n` +
              `• Скасувати - Ревекторизувати з нуля (повільніше)\n\n` +
              `Примітка: Нові файли будуть автоматично додані до векторної БД`
            );

            if (!userChoice) {
              // User wants to re-vectorize
              const confirmRevectorize = window.confirm(
                `⚠️ Ревекторизація займе час\n\n` +
                `Ви впевнені що хочете видалити існуючі дані і векторизувати заново?\n\n` +
                `Це потрібно тільки якщо структура проекту кардинально змінилась.`
              );

              if (confirmRevectorize) {
                console.log('🔄 User chose to re-vectorize from scratch');
                // Will force re-vectorization in the API
              } else {
                // Cancel generation
                return;
              }
            } else {
              console.log('✅ User chose to use existing vectorized data');
            }
          }
        }
      } catch (err) {
        console.warn('Failed to check vectorization status:', err);
        // Continue with generation anyway
      }
    }

    setIsChunkedGenerating(true);
    setError("");
    setEstimate(null);
    setChunkedProgress(null);
    setChunkedSections([]);
    setUploadProgress(null);

    try {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      console.log(`🔄 Chunked generation: ${files.length} files (${formatFileSize(totalSize)})`);

      const formData = new FormData();

      // Check if we need R2 (production and large files)
      const isProduction = window.location.hostname !== 'localhost' &&
                          window.location.hostname !== '127.0.0.1';

      if (isProduction && totalSize > 4 * 1024 * 1024) {
        console.log('📤 Production: Uploading to R2...');

        // Get presigned URLs
        const filesMetadata = files.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size
        }));

        const presignedResponse = await fetch("/api/admin/estimates/presigned-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: filesMetadata }),
        });

        if (!presignedResponse.ok) {
          throw new Error("Failed to get presigned URLs");
        }

        const { presignedUrls } = await presignedResponse.json();

        // Upload files directly to R2
        const uploadPromises = files.map(async (file, index) => {
          const presignedData = presignedUrls[index];
          const uploadResponse = await fetch(presignedData.uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          });

          if (!uploadResponse.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }

          return {
            key: presignedData.key,
            originalName: file.name,
            mimeType: file.type,
            size: file.size,
          };
        });

        const uploadedFiles = await Promise.all(uploadPromises);
        formData.append("r2Keys", JSON.stringify(uploadedFiles));
      } else {
        // Localhost or small files: send directly
        files.forEach((file) => formData.append("files", file));
      }

      // Add wizard data if available
      if (wizardData) {
        const enrichedWizardData = {
          ...wizardData,
          specialRequirements: [
            ...(wizardData.specialRequirements || []),
            projectNotes
          ].filter(Boolean).join('\n')
        };
        formData.append("wizardData", JSON.stringify(enrichedWizardData));
      }

      formData.append("projectNotes", projectNotes);

      // 🔍 Додати projectId для RAG векторизації (якщо вибраний)
      if (selectedProjectId) {
        formData.append("projectId", selectedProjectId);
        formData.append("mode", "multi-agent"); // Активувати RAG режим
        console.log(`🔍 Using projectId for RAG: ${selectedProjectId}`);
      } else {
        // Без projectId - звичайний режим
        formData.append("mode", "gemini+openai");
      }

      // Call the chunked generation endpoint with POST
      const response = await fetch("/api/admin/estimates/generate-chunked", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let collectedSections: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const update = JSON.parse(data);
              console.log('📡 Chunked update:', update);

              setChunkedProgress(update);

              // Store completed sections
              if (update.data?.section) {
                collectedSections.push(update.data.section);
                setChunkedSections(collectedSections);
              }

              // Final complete
              if (update.phase === 'final' && update.status === 'complete') {
                console.log('✅ Chunked generation complete!', update.data);

                // 🔧 FIX: 3-tier fallback strategy for sections
                let finalSections: any[] = [];

                if (update.data?.sections && update.data.sections.length > 0) {
                  // ✅ Primary: Use sections from final update (multi-agent mode with database data)
                  finalSections = update.data.sections;
                  console.log(`📦 Using ${finalSections.length} sections from final update`);
                } else if (collectedSections.length > 0) {
                  // ✅ Fallback 1: Use incrementally collected sections (old mode compatibility)
                  finalSections = collectedSections.map((section) => ({
                    title: section.title,
                    items: section.items.map((item: any) => ({
                      description: item.description,
                      unit: item.unit,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      laborCost: item.laborCost || 0,
                      totalCost: item.totalCost,
                      priceSource: null,
                      priceNote: null
                    })),
                    sectionTotal: section.items.reduce((sum: number, item: any) => sum + item.totalCost, 0)
                  }));
                  console.log(`📦 Using ${collectedSections.length} incrementally collected sections`);
                } else {
                  // ⚠️ Fallback 2: Fetch from database if nothing available
                  console.warn('⚠️ No sections available, fetching from database...');
                  try {
                    const res = await fetch(`/api/admin/estimates/${update.data.estimateId}`);
                    if (res.ok) {
                      const { data } = await res.json();
                      finalSections = data.sections.map((section: any) => ({
                        title: section.title,
                        items: section.items.map((item: any) => ({
                          description: item.description,
                          unit: item.unit,
                          quantity: Number(item.quantity),
                          unitPrice: Number(item.unitPrice),
                          laborCost: Number(item.laborRate) * Number(item.laborHours),
                          totalCost: Number(item.amount),
                          priceSource: null,
                          priceNote: null
                        })),
                        sectionTotal: Number(section.totalAmount)
                      }));
                      console.log(`📦 Fetched ${finalSections.length} sections from database`);
                    }
                  } catch (err) {
                    console.error('❌ Failed to fetch from database:', err);
                  }
                }

                // Build final estimate from collected/fetched sections
                const finalEstimate: EstimateData = {
                  title: `Кошторис ${update.data.estimateNumber || ''}`,
                  description: "Згенеровано по секціях (Multi-Agent)",
                  sections: finalSections
                };

                setEstimate(finalEstimate);
                setIsChunkedGenerating(false);

                // Show success message with statistics
                const totalItems = finalEstimate.sections.reduce((sum, s) => sum + s.items.length, 0);
                console.log(`🎉 Estimate created: ID ${update.data.estimateId}`);
                console.log(`📊 Final stats: ${finalEstimate.sections.length} sections, ${totalItems} items`);
              }

              // Handle error
              if (update.status === 'error') {
                setError(update.message || 'Помилка генерації');
                setIsChunkedGenerating(false);
              }
            } catch (e) {
              console.error('Failed to parse update:', e);
            }
          }
        }
      }

    } catch (err) {
      console.error('Chunked generation error:', err);
      setError(err instanceof Error ? err.message : 'Помилка генерації');
      setIsChunkedGenerating(false);
    }
  }

  // Функція верифікації кошторису через OpenAI
  async function verifyEstimate(estimateData: EstimateData) {
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const response = await fetch("/api/admin/estimates/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate: estimateData }),
      });

      if (!response.ok) {
        console.error("Verification failed");
        return;
      }

      const result = await response.json();
      setVerificationResult(result);
    } catch (error) {
      console.error("Verification error:", error);
    } finally {
      setIsVerifying(false);
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

      // Success - save ID and redirect to estimate details
      setSavedEstimateId(json.data.id);
      router.push(`/admin/estimates/${json.data.id}`);
    } catch (err) {
      setError("Не вдалось з'єднатись з сервером");
      setSaving(false);
    }
  }

  // Supplement estimate with additional data
  async function supplementEstimate() {
    if (!savedEstimateId) {
      setError("Спочатку збережіть кошторис");
      return;
    }

    if (!supplementInfo.trim() && supplementFiles.length === 0) {
      setError("Додайте текст або файли для доповнення кошторису");
      return;
    }

    setSupplementing(true);
    setError("");
    setSupplementProgress(null);

    try {
      const formData = new FormData();
      formData.append("additionalInfo", supplementInfo);

      // Upload supplement files to R2 if any
      let r2Keys: any[] = [];
      if (supplementFiles.length > 0) {
        const uploadFormData = new FormData();
        supplementFiles.forEach(file => {
          uploadFormData.append("files", file);
        });

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadFormData,
        });

        if (!uploadRes.ok) {
          throw new Error("Не вдалось завантажити файли");
        }

        const uploadData = await uploadRes.json();
        r2Keys = uploadData.r2Keys || [];
      }

      formData.append("r2Keys", JSON.stringify(r2Keys));
      formData.append("regenerateAll", "true");

      // Call refine API with SSE
      const response = await fetch(`/api/admin/estimates/${savedEstimateId}/refine`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Помилка доповнення кошторису");
      }

      // Stream progress updates
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                setSupplementProgress({
                  message: data.message,
                  progress: data.progress || 0
                });

                if (data.status === 'complete' && data.data) {
                  // Success - show results
                  alert(`✅ Кошторис успішно доповнено!\n\nСтара вартість: ${formatCurrency(data.data.oldTotalAmount)}\nНова вартість: ${formatCurrency(data.data.newTotalAmount)}\nЗміна: ${formatCurrency(data.data.difference)}`);

                  // Redirect to new estimate
                  router.push(`/admin/estimates/${data.data.newEstimateId}`);
                  return;
                } else if (data.status === 'error') {
                  throw new Error(data.message);
                }
              } catch (e) {
                console.error('Error parsing SSE:', e);
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалось доповнити кошторис");
    } finally {
      setSupplementing(false);
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

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-blue-900">
                    📤 Завантаження файлів у R2...
                  </p>
                  <p className="text-sm font-semibold text-blue-900">
                    {uploadProgress.percentage}%
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>

                <p className="text-xs text-blue-700">
                  Завантажено {uploadProgress.uploadedFiles} з {uploadProgress.totalFiles} файлів
                </p>
              </div>
            )}
          </div>

          {/* ПРИБРАНО: Старий селектор моделі (тепер використовується Multi-Agent за замовчуванням) */}

          {/* Project Template Selection - REMOVED: Wizard replaces this */}

          {/* Wizard Button */}
          <Card className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">Детальний опитувальник проекту</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Заповніть детальну інформацію про проект для точнішого кошторису.
                  AI згенерує <strong>в 3-5 разів більше позицій</strong> з конкретними матеріалами та специфікаціями.
                </p>
                <Button
                  onClick={() => setShowWizard(true)}
                  className="bg-primary hover:bg-primary/90"
                  size="lg"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Відкрити опитувальник
                  {wizardCompleted && <Badge variant="secondary" className="ml-2">Заповнено</Badge>}
                </Button>
                {wizardCompleted && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Детальна інформація збережена
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Settings */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Параметри проєкту</h3>
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Площа (м²)</label>
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="напр. 85"
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  📋 Вся відома інформація про проект
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (комунікації, стан ділянки, побажання клієнта)
                  </span>
                </label>
                <textarea
                  value={projectNotes}
                  onChange={(e) => setProjectNotes(e.target.value)}
                  rows={8}
                  maxLength={3000}
                  placeholder={`Введіть всю відому інформацію про проект:

🔌 КОМУНІКАЦІЇ:
- Чи є комунікації під землею? (газ, каналізація, електрика)
- Чи підведена вода до ділянки? Від якої відстані?
- Чи підведене світло до ділянки?

🌍 СТАН ДІЛЯНКИ:
- Тип грунту: глина, пісок, камінь, змішаний
- Схили, нерівності ділянки
- Рівень грунтових вод (високий/низький)
- Особливості ділянки

👤 ПОБАЖАННЯ КЛІЄНТА:
- Бажані матеріали (преміум/стандарт/економ)
- Особливі вимоги
- Інші нюанси

📸 ДОДАТКОВА ІНФОРМАЦІЯ:
- З телефонної розмови з клієнтом
- З виїзду на об'єкт
- З фото об'єкту
- З додаткових документів

Приклад:
"Комунікації НЕ підведені. Воду треба тягнути 50 метрів від вулиці. Світло є. Грунт глинистий, потрібен дренаж. Клієнт хоче паркетну дошку замість ламінату у всіх кімнатах."`}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-primary resize-none transition-colors"
                />
                <div className="mt-1.5 flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <p>
                    💡 <strong>Чим більше деталей ви вкажете, тим точніший буде кошторис.</strong> AI враховує всю цю інформацію при розрахунку. Особливо важливо вказати інформацію про комунікації - це дуже впливає на вартість.
                  </p>
                </div>
                <div className="mt-1 flex justify-between text-xs">
                  <span className={cn(
                    "text-muted-foreground",
                    projectNotes.length > 2700 && "text-orange-600 font-medium",
                    projectNotes.length === 3000 && "text-red-600 font-bold"
                  )}>
                    {projectNotes.length} / 3000 символів
                  </span>
                  {projectNotes.length > 2700 && (
                    <span className="text-orange-600">⚠️ Близько до ліміту</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Categories - REMOVED: Wizard replaces this */}

          {/* 🔍 RAG: Project Selection for Vector Search */}
          {projects.length > 0 && (
            <Card className="p-6 bg-gradient-to-br from-blue-50/50 to-purple-50/50 border-2 border-blue-200/50">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold">🚀 Економія токенів (RAG)</h3>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    Економія 75-90%
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Виберіть проект для автоматичної векторизації файлів. Перша генерація створить векторну базу даних, наступні використовуватимуть RAG (економія токенів 75-90%).
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Проєкт (опціонально)
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                    disabled={loading || isChunkedGenerating}
                  >
                    <option value="">Без RAG (звичайна генерація)</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title} — {project.client.name}
                      </option>
                    ))}
                  </select>
                  {selectedProjectId && (
                    <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <p>
                        <strong>RAG увімкнено:</strong> Файли будуть векторизовані для проекту. Перша генерація: ~$5 + векторизація. Наступні: ~$0.025 (економія 99%).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

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

          {/* Prozorro check */}
          <div className="flex items-center gap-2 p-4 bg-accent/50 rounded-lg border border-border">
            <Checkbox
              id="prozorro-check"
              checked={checkProzorro}
              onCheckedChange={setCheckProzorro}
            />
            <label
              htmlFor="prozorro-check"
              className="text-sm cursor-pointer flex items-center gap-1.5"
            >
              🔍 Перевірити на Prozorro конкурентів після генерації
              <span className="text-xs text-muted-foreground">(знайти схожі тендери)</span>
            </label>
          </div>

          {/* Generate button */}
          <div className="space-y-3">
            {/* MULTI-AGENT Generation (10 спеціалізованих агентів + RAG) */}
            <Button
              onClick={generateChunked}
              disabled={loading || isChunkedGenerating || files.length === 0}
              size="lg"
              className="w-full h-16 text-lg gap-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all"
            >
              {isChunkedGenerating ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="font-medium">{chunkedProgress?.message || 'Генерація...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-6 w-6" />
                  <span className="font-semibold">🤖 Генерувати кошторис (Multi-Agent AI)</span>
                </>
              )}
            </Button>

            <div className="text-xs text-center space-y-1">
              <p className="text-muted-foreground flex items-center justify-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                10 спеціалізованих AI агентів працюють паралельно для максимальної точності
              </p>
              {selectedProjectId && (
                <p className="text-green-600 font-medium flex items-center justify-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  RAG активовано - економія токенів 75-90%
                </p>
              )}
            </div>

            {/* Chunked Generation Progress */}
            {isChunkedGenerating && chunkedProgress && (
              <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200">
                <div className="space-y-4">
                  {/* Phase indicator */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      {chunkedProgress.phase === 0 && '📦 Підготовка'}
                      {chunkedProgress.phase === 1 && '🔍 Gemini: Аналіз документів'}
                      {chunkedProgress.phase === 2 && '🏗️ Gemini: Фундамент'}
                      {chunkedProgress.phase === 3 && '⚡ Gemini: Електрика'}
                      {chunkedProgress.phase === 4 && '🚰 OpenAI: Сантехніка'}
                      {chunkedProgress.phase === 5 && '🎨 OpenAI: Оздоблення'}
                      {chunkedProgress.phase === 'final' && '🎉 Завершення'}
                    </h3>
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {chunkedProgress.progress}%
                    </Badge>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                      style={{ width: `${chunkedProgress.progress}%` }}
                    />
                  </div>

                  {/* Status message */}
                  <p className="text-sm text-muted-foreground">
                    {chunkedProgress.message}
                  </p>

                  {/* Completed sections */}
                  {chunkedSections.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-sm font-semibold">Згенеровано секцій: {chunkedSections.length}</h4>
                      <div className="space-y-1">
                        {chunkedSections.map((section, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="font-medium">{section.title}</span>
                            <span className="text-muted-foreground">
                              ({section.items?.length || 0} позицій)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
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
                onClick={() => {
                  if (!savedEstimateId) {
                    alert('Спочатку збережіть кошторис, щоб потім його доповнити');
                    return;
                  }
                  setSupplementModalOpen(true);
                }}
                className="border-orange-500/30 text-orange-600 hover:bg-orange-50"
                title="Додати нові дані і регенерувати кошторис"
              >
                <Plus className="h-4 w-4" /> Доповнити кошторис
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

          {/* Індикатор верифікації */}
          {isVerifying && (
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin h-5 w-5 text-primary" />
                <span className="text-sm font-medium">OpenAI перевіряє кошторис...</span>
              </div>
            </Card>
          )}

          {/* Результати верифікації */}
          {verificationResult && <VerificationResults result={verificationResult} />}

          {/* Debug Info */}
          {debugInfo && (
            <Card className={cn("p-4 border-2", debugInfo.status === 'OK' ? 'border-green-500/30 bg-green-50' : 'border-orange-500/30 bg-orange-50')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={debugInfo.status === 'OK' ? 'default' : 'secondary'} className={debugInfo.status === 'OK' ? 'bg-green-600' : 'bg-orange-600'}>
                    {debugInfo.status === 'OK' ? '✅ Достатньо позицій' : '⚠️ Замало позицій'}
                  </Badge>
                  <span className="text-sm font-medium">
                    Згенеровано: <strong className={debugInfo.status === 'OK' ? 'text-green-700' : 'text-orange-700'}>{debugInfo.totalItems}</strong> / {debugInfo.requiredMin} позицій
                  </span>
                  {debugInfo.status !== 'OK' && (
                    <span className="text-sm text-orange-600">
                      (бракує {Math.abs(debugInfo.gap)} позицій)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {debugInfo.wizardUsed ? (
                    <span className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" /> Wizard використано
                    </span>
                  ) : (
                    <span className="text-orange-600">Wizard не використано</span>
                  )}
                  {debugInfo.iterations && debugInfo.iterations > 0 && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-blue-600 font-medium">
                        🔄 Ітерацій: {debugInfo.iterations}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span>Model: {debugInfo.model || 'gemini'}</span>
                  <span>•</span>
                  <span>Files: {debugInfo.filesCount || 0} ({debugInfo.textFiles || 0} text, {debugInfo.imageFiles || 0} images)</span>
                  <span>•</span>
                  <span>Template: {debugInfo.template}</span>
                  <span>•</span>
                  <span>Площа: {debugInfo.area} м²</span>
                </div>
              </div>
            </Card>
          )}

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

          {/* Analysis Summary - Звіт інженера */}
          {(estimate as any).analysisSummary && (
            <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/20 p-2">
                  <Info className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base mb-3 text-primary">
                    📋 Звіт інженера про аналіз проекту
                  </h3>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                      {(estimate as any).analysisSummary}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Prozorro Analysis - Звіт про конкурентні тендери */}
          {(estimate as any).prozorroAnalysis && (
            <Card className="p-5 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-500/20 p-2">
                  <ExternalLink className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base mb-3 text-blue-700">
                    📊 Аналіз конкурентних тендерів Prozorro
                  </h3>
                  <div className="prose prose-sm max-w-none">
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90 font-mono bg-white/60 p-4 rounded-lg border border-blue-200 overflow-x-auto">
                      {(estimate as any).prozorroAnalysis}
                    </pre>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Prozorro Tender Search */}
          {checkProzorro && savedEstimateId && (
            <ProzorroTenderSearch
              estimateId={savedEstimateId}
              wizardData={wizardData}
              autoSearch={true}
            />
          )}

          {/* Sections */}
          {estimate.sections && estimate.sections.length > 0 ? estimate.sections.map((section, sIdx) => (
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
          )) : (
            <Card className="p-8 text-center text-muted-foreground">
              <p>Кошторис не містить секцій. Спробуйте згенерувати знову.</p>
            </Card>
          )}

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

      {/* ════════ SUPPLEMENT MODAL ════════ */}
      {supplementModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Plus className="h-5 w-5 text-orange-600" />
                    Доповнити кошторис новими даними
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Додайте нову інформацію або файли для регенерації кошторису
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSupplementModalOpen(false);
                    setSupplementInfo("");
                    setSupplementFiles([]);
                    setSupplementProgress(null);
                    setError("");
                  }}
                  disabled={supplementing}
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

              {/* Progress indicator */}
              {supplementProgress && (
                <div className="rounded-lg bg-primary/10 border border-primary/20 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">{supplementProgress.message}</span>
                  </div>
                  <div className="w-full bg-primary/20 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${supplementProgress.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{supplementProgress.progress}%</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Додаткова інформація</label>
                <textarea
                  value={supplementInfo}
                  onChange={(e) => setSupplementInfo(e.target.value)}
                  placeholder="Опишіть що було пропущено або які зміни потрібні:&#10;&#10;Наприклад:&#10;- Додати електропроводку для кондиціонерів&#10;- Врахувати теплу підлогу у ванній&#10;- Додати систему пожежогасіння&#10;- Збільшити товщину утеплення на 50мм"
                  className="w-full min-h-[150px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  disabled={supplementing}
                />
                <p className="text-xs text-muted-foreground">
                  AI проаналізує існуючий кошторис та додасть нові позиції на основі вашої інформації
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Нові файли (опційно)</label>
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  <input
                    ref={supplementFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => {
                      if (e.target.files) {
                        setSupplementFiles(Array.from(e.target.files));
                      }
                    }}
                    className="hidden"
                    disabled={supplementing}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => supplementFileInputRef.current?.click()}
                    disabled={supplementing}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Завантажити файли
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    PDF, фото креслень, специфікації (макс. 50 MB на файл)
                  </p>
                </div>

                {supplementFiles.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm font-medium">Вибрані файли:</p>
                    {supplementFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          {file.type.startsWith('image/') ? (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSupplementFiles(prev => prev.filter((_, i) => i !== idx));
                          }}
                          disabled={supplementing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSupplementModalOpen(false);
                    setSupplementInfo("");
                    setSupplementFiles([]);
                    setSupplementProgress(null);
                    setError("");
                  }}
                  disabled={supplementing}
                >
                  Скасувати
                </Button>
                <Button
                  onClick={supplementEstimate}
                  disabled={supplementing || (!supplementInfo.trim() && supplementFiles.length === 0)}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {supplementing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Обробка...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Доповнити кошторис
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Wizard Modal */}
      <EstimateWizardModal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        wizardData={wizardData}
        setWizardData={setWizardData}
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        onComplete={handleWizardComplete}
      />

      {/* Pre-Analysis Modal */}
      {showPreAnalysis && preAnalysisData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">🔍 AI проаналізував ваші файли</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Перевірте чи правильно AI зрозумів що потрібно будувати
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowPreAnalysis(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* NEW: Engineering Report - Інженерний звіт */}
              {isGeneratingReport && (
                <Card className="mb-6 bg-blue-50 border-blue-200">
                  <div className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <div>
                        <h3 className="text-lg font-semibold text-blue-900">📊 Генерація інженерного звіту...</h3>
                        <p className="text-sm text-blue-700">AI аналізує документи і готує детальні рекомендації</p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Engineering report temporarily disabled - endpoint not implemented */}

              {/* NEW: Document Classification Display */}
              {preAnalysisData.classification && (
                <Card className="mb-6">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">📂 Класифікація завантажених файлів</h3>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {preAnalysisData.classification.byType.map((typeGroup: any, index: number) => (
                        <Card key={`${typeGroup.type}-${index}`} className={cn(
                          "p-4 border-2",
                          typeGroup.type === 'geological' ? 'border-orange-500 bg-orange-50' :
                          typeGroup.type === 'site_plan' || typeGroup.type === 'topography' ? 'border-green-500 bg-green-50' :
                          typeGroup.type === 'review' ? 'border-red-500 bg-red-50' :
                          typeGroup.type === 'photos' ? 'border-blue-500 bg-blue-50' :
                          'border-gray-300'
                        )}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">
                              {getDocumentTypeLabel(typeGroup.type)}
                            </span>
                            <Badge>{typeGroup.count}</Badge>
                          </div>

                          <div className="text-xs space-y-1">
                            {typeGroup.files.map((fileName: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="truncate">{fileName}</span>
                                {typeGroup.confidence[idx] < 0.7 && (
                                  <Badge variant="outline" className="text-xs">
                                    {Math.round(typeGroup.confidence[idx] * 100)}%
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* NEW: Parsed Data Display */}
              {preAnalysisData.parsedData && (
                <Card className="mb-6">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">📊 Витягнуті дані з документів</h3>

                    <div className="space-y-4">
                      {/* Site Plan */}
                      {preAnalysisData.parsedData.sitePlan && (
                        <div className="p-4 border rounded-lg bg-green-50">
                          <h4 className="font-semibold mb-2">🗺️ План ділянки</h4>
                          <div className="text-sm space-y-1">
                            {preAnalysisData.parsedData.sitePlan.area && (
                              <p><strong>Площа:</strong> {preAnalysisData.parsedData.sitePlan.area} м²</p>
                            )}
                            {preAnalysisData.parsedData.sitePlan.elevationDifference && (
                              <p className={cn(
                                "font-semibold",
                                preAnalysisData.parsedData.sitePlan.elevationDifference > 2 && "text-orange-600"
                              )}>
                                <strong>Перепад висот:</strong> {preAnalysisData.parsedData.sitePlan.elevationDifference.toFixed(2)} м
                                {preAnalysisData.parsedData.sitePlan.elevationDifference > 2 && " ⚠️ Потрібні земляні роботи!"}
                              </p>
                            )}
                            <p><strong>Комунікації:</strong></p>
                            <ul className="ml-4 list-disc">
                              <li>Водопровід: {preAnalysisData.parsedData.sitePlan.existingUtilities.water ? '✅' : '❌'}</li>
                              <li>Каналізація: {preAnalysisData.parsedData.sitePlan.existingUtilities.sewerage ? '✅' : '❌'}</li>
                              <li>Електрика: {preAnalysisData.parsedData.sitePlan.existingUtilities.electricity ? '✅' : '❌'}</li>
                              <li>Газ: {preAnalysisData.parsedData.sitePlan.existingUtilities.gas ? '✅' : '❌'}</li>
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Geological */}
                      {preAnalysisData.parsedData.geological && (
                        <div className="p-4 border rounded-lg bg-orange-50">
                          <h4 className="font-semibold mb-2">🪨 Геологія</h4>
                          <div className="text-sm space-y-1">
                            {preAnalysisData.parsedData.geological.groundwaterLevel && (
                              <p className={cn(
                                "font-semibold",
                                preAnalysisData.parsedData.geological.groundwaterLevel < 2 && "text-red-600"
                              )}>
                                <strong>УГВ:</strong> {preAnalysisData.parsedData.geological.groundwaterLevel} м
                                {preAnalysisData.parsedData.geological.groundwaterLevel < 2 && " 🚨 Високий!"}
                              </p>
                            )}
                            {preAnalysisData.parsedData.geological.recommendedFoundation && (
                              <p><strong>Фундамент:</strong> {preAnalysisData.parsedData.geological.recommendedFoundation}</p>
                            )}
                            {preAnalysisData.parsedData.geological.warnings && preAnalysisData.parsedData.geological.warnings.length > 0 && (
                              <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
                                <p className="font-semibold text-red-800">Попередження:</p>
                                <ul className="ml-4 list-disc text-red-700">
                                  {preAnalysisData.parsedData.geological.warnings.slice(0, 3).map((w: string, i: number) => (
                                    <li key={i}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Review */}
                      {preAnalysisData.parsedData.review && (
                        <div className="p-4 border rounded-lg bg-red-50">
                          <h4 className="font-semibold mb-2">📝 Рецензія</h4>
                          <div className="text-sm space-y-1">
                            <p><strong>Всього зауважень:</strong> {preAnalysisData.parsedData.review.totalComments}</p>
                            <p className="font-semibold text-red-600">
                              <strong>Критичних:</strong> {preAnalysisData.parsedData.review.criticalCount}
                            </p>
                            {preAnalysisData.parsedData.review.criticalCount > 0 && (
                              <p className="text-xs text-red-700">
                                ⚠️ AI обов'язково врахує критичні зауваження в кошторисі
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Photos */}
                      {preAnalysisData.parsedData.photos && (
                        <div className="p-4 border rounded-lg bg-blue-50">
                          <h4 className="font-semibold mb-2">📸 Фото місцевості</h4>
                          <p className="text-sm">
                            <strong>Завантажено:</strong> {preAnalysisData.parsedData.photos.photoCount} фото
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            AI проаналізує фото для визначення підготовки майданчика
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* Summary */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold mb-2">📋 Загальна інформація:</h3>
                <p className="text-sm">{preAnalysisData.summary}</p>
                {preAnalysisData.confidence && (
                  <div className="mt-2">
                    <Badge variant={preAnalysisData.confidence === 'high' ? 'default' : preAnalysisData.confidence === 'medium' ? 'secondary' : 'destructive'}>
                      Впевненість: {preAnalysisData.confidence === 'high' ? 'Висока' : preAnalysisData.confidence === 'medium' ? 'Середня' : 'Низька'}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Grid with details */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Building */}
                {preAnalysisData.building && (
                  <Card className="p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      🏠 Будівля
                    </h4>
                    <div className="text-sm space-y-1">
                      <p>Поверхів: <strong>{preAnalysisData.building.floors}</strong></p>
                      <p>Площа: <strong>{preAnalysisData.building.totalArea}</strong></p>
                      {preAnalysisData.building.currentState && (
                        <p>Стан: <strong>{preAnalysisData.building.currentState}</strong></p>
                      )}
                    </div>
                  </Card>
                )}

                {/* Rooms */}
                {preAnalysisData.rooms && (
                  <Card className="p-4">
                    <h4 className="font-semibold mb-2">🚪 Приміщення</h4>
                    <div className="text-sm space-y-1">
                      {preAnalysisData.rooms.bedrooms > 0 && <p>Спальні: <strong>{preAnalysisData.rooms.bedrooms}</strong></p>}
                      {preAnalysisData.rooms.bathrooms > 0 && <p>Санвузли: <strong>{preAnalysisData.rooms.bathrooms}</strong></p>}
                      {preAnalysisData.rooms.kitchen > 0 && <p>Кухня: <strong>{preAnalysisData.rooms.kitchen}</strong></p>}
                      {preAnalysisData.rooms.living > 0 && <p>Вітальня: <strong>{preAnalysisData.rooms.living}</strong></p>}
                    </div>
                  </Card>
                )}

                {/* Electrical */}
                {preAnalysisData.electrical && (
                  <Card className="p-4">
                    <h4 className="font-semibold mb-2">⚡ Електрика</h4>
                    <div className="text-sm space-y-1">
                      <p>Розетки: <strong>{preAnalysisData.electrical.outlets}</strong></p>
                      <p>Вимикачі: <strong>{preAnalysisData.electrical.switches}</strong></p>
                      <p>Світильники: <strong>{preAnalysisData.electrical.lights}</strong></p>
                    </div>
                  </Card>
                )}

                {/* Plumbing */}
                {preAnalysisData.plumbing && (
                  <Card className="p-4">
                    <h4 className="font-semibold mb-2">💧 Сантехніка</h4>
                    <div className="text-sm space-y-1">
                      {preAnalysisData.plumbing.toilets > 0 && <p>Унітази: <strong>{preAnalysisData.plumbing.toilets}</strong></p>}
                      {preAnalysisData.plumbing.sinks > 0 && <p>Умивальники: <strong>{preAnalysisData.plumbing.sinks}</strong></p>}
                      {preAnalysisData.plumbing.baths > 0 && <p>Ванни: <strong>{preAnalysisData.plumbing.baths}</strong></p>}
                      {preAnalysisData.plumbing.showers > 0 && <p>Душові: <strong>{preAnalysisData.plumbing.showers}</strong></p>}
                    </div>
                  </Card>
                )}

                {/* Heating */}
                {preAnalysisData.heating && (
                  <Card className="p-4">
                    <h4 className="font-semibold mb-2">🔥 Опалення</h4>
                    <div className="text-sm space-y-1">
                      {preAnalysisData.heating.radiators > 0 && <p>Радіатори: <strong>{preAnalysisData.heating.radiators}</strong></p>}
                      {preAnalysisData.heating.underfloor && <p>Тепла підлога: <strong>{preAnalysisData.heating.underfloorArea || 'Так'}</strong></p>}
                    </div>
                  </Card>
                )}

                {/* Windows & Doors */}
                {(preAnalysisData.windows || preAnalysisData.doors) && (
                  <Card className="p-4">
                    <h4 className="font-semibold mb-2">🪟 Вікна/Двері</h4>
                    <div className="text-sm space-y-1">
                      {preAnalysisData.windows?.count > 0 && <p>Вікна: <strong>{preAnalysisData.windows.count}</strong></p>}
                      {preAnalysisData.doors?.entrance > 0 && <p>Вхідні двері: <strong>{preAnalysisData.doors.entrance}</strong></p>}
                      {preAnalysisData.doors?.interior > 0 && <p>Внутрішні двері: <strong>{preAnalysisData.doors.interior}</strong></p>}
                    </div>
                  </Card>
                )}
              </div>

              {/* Discrepancies */}
              {preAnalysisData.discrepancies && preAnalysisData.discrepancies.length > 0 && (
                <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <h4 className="font-semibold mb-2 text-orange-900">⚠️ Розбіжності з wizard:</h4>
                  <ul className="text-sm space-y-1 text-orange-800">
                    {preAnalysisData.discrepancies.map((d: string, i: number) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {preAnalysisData.warnings && preAnalysisData.warnings.length > 0 && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-semibold mb-2 text-yellow-900">💡 Попередження:</h4>
                  <ul className="text-sm space-y-1 text-yellow-800">
                    {preAnalysisData.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendation */}
              {preAnalysisData.recommendation && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-semibold mb-2 text-green-900">💬 Рекомендація:</h4>
                  <p className="text-sm text-green-800">{preAnalysisData.recommendation}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="outline" onClick={() => setShowPreAnalysis(false)}>
                  Переглянути wizard
                </Button>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => {
                    setShowPreAnalysis(false);
                    setShowWizard(true);
                  }}>
                    Виправити дані
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
                    setShowPreAnalysis(false);
                    generate();
                  }}>
                    <Check className="mr-2 h-4 w-4" /> Все правильно → Генерувати
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
