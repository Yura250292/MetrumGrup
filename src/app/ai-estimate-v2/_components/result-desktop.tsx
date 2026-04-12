"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Wand,
  Plus,
  Save,
  TrendingUp,
  Layers,
  ChevronUp,
  ChevronDown,
  Download,
  TriangleAlert,
  Scaling,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  FileText,
} from "lucide-react";
import { T } from "./tokens";
import { ConfidenceBadge, ScoreDial } from "./primitives";
import { formatUAH } from "../_lib/format";
import type { AiEstimateController } from "../_lib/use-controller";
import type { EstimateData, EstimateSection, EstimateItem, VerificationIssue, VerificationImprovement } from "../_lib/types";

export function ResultDesktop({ controller }: { controller: AiEstimateController }) {
  const estimate = controller.estimate as EstimateData;
  const verification = controller.verificationResult;

  const totalAmount = estimate.summary?.totalBeforeDiscount ?? 0;
  const sectionCount = estimate.sections.length;
  const itemCount = estimate.sections.reduce((sum, s) => sum + s.items.length, 0);
  const verifyScore = verification?.overallScore;
  const verifyStatus = (verification as any)?.status as string | undefined;
  const verifyUnavailable = verifyStatus === "unavailable";
  const issues: VerificationIssue[] = verification?.issues ?? [];
  const lowConfIssues = issues.filter((i) => (i.severity ?? "").toLowerCase().includes("warn"));
  const criticalIssues = issues.filter(
    (i) => (i.severity ?? "").toLowerCase().includes("crit") || (i.severity ?? "").toLowerCase() === "error"
  );

  return (
    <div className="w-full max-w-[1440px]" style={{ backgroundColor: T.background, color: T.textPrimary }}>
      {/* Top bar */}
      <header
        className="flex h-16 items-center justify-between border-b px-8"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-3.5">
          <button
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
            onClick={() => window.location.reload()}
          >
            <ArrowLeft size={14} /> Назад
          </button>
          <div className="flex flex-col gap-px">
            <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              {estimate.title || "AI кошторис"}
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {estimate.description || "Згенеровано Master Agent"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(estimate.analysisSummary || estimate.prozorroAnalysis) && (
            <button
              onClick={controller.openEngineerReport}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium border"
              style={{
                color: T.warning,
                borderColor: T.warning,
                backgroundColor: T.warningSoft,
              }}
              title="Звіт інженера + аналіз Prozorro"
            >
              <FileText size={16} /> Звіт
            </button>
          )}
          <button
            onClick={controller.openRefine}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            <Wand size={16} /> Уточнити
          </button>
          <button
            onClick={controller.openSupplement}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            <Plus size={16} /> Доповнити
          </button>
          <button
            onClick={controller.openSave}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Save size={16} /> Зберегти кошторис
          </button>
        </div>
      </header>

      {/* Hero strip */}
      <section className="flex flex-wrap items-center gap-12 px-12 py-9">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold tracking-widest" style={{ color: T.textMuted }}>
            ЗАГАЛЬНИЙ КОШТОРИС
          </span>
          <span className="text-5xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            {formatUAH(totalAmount)}
          </span>
          {controller.scalingInfo?.message && (
            <span className="flex items-center gap-2 text-xs font-medium" style={{ color: T.success }}>
              <TrendingUp size={14} /> {controller.scalingInfo.message}
            </span>
          )}
        </div>
        <div className="hidden lg:block h-24 w-px" style={{ backgroundColor: T.borderSoft }} />
        <div className="flex flex-1 flex-wrap items-center gap-4">
          <KpiPill label="Секції" value={String(sectionCount)} />
          <KpiPill label="Позиції" value={String(itemCount)} />
          <KpiPill
            label="Верифікація"
            value={controller.isVerifying ? "…" : verifyScore != null ? `${Math.round(verifyScore)} / 100` : "—"}
          />
          <KpiPill label="Низька впевн." value={String(lowConfIssues.length)} />
        </div>
      </section>

      {/* Workspace */}
      <section className="flex flex-col xl:flex-row items-start gap-8 px-12 pb-14">
        {/* Sections column */}
        <div className="flex flex-1 flex-col gap-4 min-w-0 w-full" style={{ gap: 18 }}>
          {estimate.sections.map((section, sIdx) => (
            <SectionBlock
              key={`section-${sIdx}`}
              section={section}
              idx={sIdx}
              expanded={controller.expandedSections.has(sIdx)}
              onToggle={() => controller.toggleSection(sIdx)}
              issues={issues}
              controller={controller}
            />
          ))}

          <button
            onClick={controller.addSection}
            className="rounded-2xl py-4 text-sm font-medium"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px dashed ${T.borderSoft}`,
              color: T.textMuted,
            }}
          >
            + Додати секцію
          </button>
        </div>

        {/* Insights sidebar */}
        <aside className="flex w-full xl:w-[380px] flex-col gap-4 flex-shrink-0">
          {/* Summary */}
          <div
            className="flex flex-col gap-4 rounded-2xl p-6"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
          >
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              СТРУКТУРА КОШТОРИСУ
            </span>
            <BreakdownRow label="Матеріали" value={formatUAH(estimate.summary?.materialsCost)} />
            <BreakdownRow label="Праця" value={formatUAH(estimate.summary?.laborCost)} />
            <BreakdownRow
              label={`Накладні ${estimate.summary?.overheadPercent ?? 15}%`}
              value={formatUAH(estimate.summary?.overheadCost)}
            />
            <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
                Загалом
              </span>
              <span className="text-lg font-bold" style={{ color: T.textPrimary }}>
                {formatUAH(totalAmount)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => controller.exportEstimate("excel")}
                disabled={controller.exporting !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {controller.exporting === "excel" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Експорт
              </button>
              <button
                onClick={controller.openSave}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold"
                style={{ backgroundColor: T.panel, color: T.textSecondary, border: `1px solid ${T.borderStrong}` }}
              >
                <Save size={14} /> Зберегти
              </button>
            </div>
          </div>

          {/* Verification */}
          <VerificationPanel
            controller={controller}
            verification={verification}
            verifyScore={verifyScore}
            verifyUnavailable={verifyUnavailable}
            issues={issues}
            criticalIssues={criticalIssues}
            lowConfIssues={lowConfIssues}
            estimate={estimate}
          />

          {/* Scaling */}
          {controller.scalingInfo && (
            <div
              className="flex items-start gap-3 rounded-2xl p-4"
              style={{ backgroundColor: T.accentPrimarySoft, border: `1px solid ${T.accentPrimary}` }}
            >
              <Scaling size={18} style={{ color: T.accentPrimary }} className="mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <div className="text-xs font-semibold" style={{ color: T.accentPrimary }}>
                  Кошторис автомасштабовано
                </div>
                <div className="text-[11px] leading-relaxed" style={{ color: T.textSecondary }}>
                  {controller.scalingInfo.message ||
                    `Початкова чернетка була для іншої площі. Обсяги пропорційно скориговано.`}
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex w-[140px] flex-col gap-1 rounded-xl p-3.5"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-2xl font-bold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function SectionBlock({
  section,
  idx,
  expanded,
  onToggle,
  issues,
  controller,
}: {
  section: EstimateSection;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
  issues: VerificationIssue[];
  controller: AiEstimateController;
}) {
  const sectionItems = section.items.length;
  const sectionConfidence = issues.find((i) => i.location?.includes(section.title));
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const saveTitle = () => {
    if (titleDraft.trim()) controller.updateSectionTitle(idx, titleDraft.trim());
    setEditingTitle(false);
  };

  return (
    <div className="flex flex-col rounded-2xl" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <div
        className="flex items-center justify-between gap-4 rounded-t-2xl border-b px-6 py-4"
        style={{ backgroundColor: T.panelElevated, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <Layers size={18} style={{ color: T.accentPrimary }} />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") {
                      setTitleDraft(section.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="rounded-md bg-transparent px-2 py-1 text-sm font-semibold outline-none"
                  style={{ color: T.textPrimary, border: `1px solid ${T.borderAccent}` }}
                />
                <button onClick={saveTitle}>
                  <Check size={16} style={{ color: T.success }} />
                </button>
                <button
                  onClick={() => {
                    setTitleDraft(section.title);
                    setEditingTitle(false);
                  }}
                >
                  <X size={16} style={{ color: T.danger }} />
                </button>
              </div>
            ) : (
              <button
                onClick={onToggle}
                className="text-left text-sm font-semibold truncate"
                style={{ color: T.textPrimary }}
              >
                {String(idx + 1).padStart(2, "0")} · {section.title}
              </button>
            )}
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {sectionItems} {sectionItems === 1 ? "позиція" : "позицій"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              setTitleDraft(section.title);
              setEditingTitle(true);
            }}
            className="rounded-md p-1.5"
            title="Редагувати назву"
          >
            <Pencil size={14} style={{ color: T.textMuted }} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Видалити секцію "${section.title}"?`)) controller.deleteSection(idx);
            }}
            className="rounded-md p-1.5"
            title="Видалити секцію"
          >
            <Trash2 size={14} style={{ color: T.textMuted }} />
          </button>
          <ConfidenceBadge
            value={sectionConfidence ? "Потребує перевірки" : "Без зауважень"}
            tone={sectionConfidence ? "warning" : "success"}
          />
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-base font-bold" style={{ color: T.textPrimary }}>
              {formatUAH(section.sectionTotal)}
            </span>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              проміжний підсумок
            </span>
          </div>
          <button onClick={onToggle}>
            {expanded ? (
              <ChevronUp size={18} style={{ color: T.textMuted }} />
            ) : (
              <ChevronDown size={18} style={{ color: T.textMuted }} />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col px-3 pt-2 pb-4 overflow-x-auto">
          <div
            className="grid grid-cols-[32px_1fr_70px_70px_110px_130px_40px] items-center gap-3 rounded-lg px-3 py-2.5 min-w-[800px]"
            style={{ backgroundColor: T.panelSoft }}
          >
            <Th>#</Th>
            <Th>ПОЗИЦІЯ</Th>
            <Th>ОД.</Th>
            <Th>К-СТЬ</Th>
            <Th>ЦІНА</Th>
            <Th>СУМА</Th>
            <Th>ДІЇ</Th>
          </div>
          {section.items.map((item, iIdx) => (
            <Row
              key={`item-${idx}-${iIdx}`}
              idx={iIdx + 1}
              item={item}
              striped={iIdx % 2 === 1}
              onChange={(patch) => controller.updateItem(idx, iIdx, patch)}
              onDelete={() => controller.deleteItem(idx, iIdx)}
            />
          ))}

          <button
            onClick={() => controller.addItem(idx)}
            className="mt-2 rounded-lg px-3 py-2.5 text-xs font-medium min-w-[800px]"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px dashed ${T.borderSoft}`,
              color: T.textMuted,
            }}
          >
            + Додати позицію
          </button>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
      {children}
    </span>
  );
}

function Row({
  idx,
  item,
  striped,
  onChange,
  onDelete,
}: {
  idx: number;
  item: EstimateItem;
  striped: boolean;
  onChange: (patch: Partial<EstimateItem>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    description: item.description,
    unit: item.unit,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
  });

  const save = () => {
    onChange({
      description: draft.description,
      unit: draft.unit,
      quantity: Number(draft.quantity) || 0,
      unitPrice: Number(draft.unitPrice) || 0,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="grid grid-cols-[32px_1fr_70px_70px_110px_130px_40px] items-center gap-3 border-b px-3 py-3 min-w-[800px]"
        style={{
          backgroundColor: T.accentPrimarySoft,
          borderColor: T.borderSoft,
        }}
      >
        <span className="text-xs font-medium" style={{ color: T.textMuted }}>
          {String(idx).padStart(2, "0")}
        </span>
        <input
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className="rounded-md bg-transparent px-2 py-1 text-[13px] outline-none"
          style={{ color: T.textPrimary, border: `1px solid ${T.borderAccent}` }}
        />
        <input
          value={draft.unit}
          onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
          className="rounded-md bg-transparent px-2 py-1 text-xs outline-none"
          style={{ color: T.textSecondary, border: `1px solid ${T.borderAccent}` }}
        />
        <input
          value={draft.quantity}
          onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
          inputMode="numeric"
          className="rounded-md bg-transparent px-2 py-1 text-xs outline-none"
          style={{ color: T.textSecondary, border: `1px solid ${T.borderAccent}` }}
        />
        <input
          value={draft.unitPrice}
          onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))}
          inputMode="numeric"
          className="rounded-md bg-transparent px-2 py-1 text-xs outline-none"
          style={{ color: T.textSecondary, border: `1px solid ${T.borderAccent}` }}
        />
        <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          {formatUAH(Number(draft.quantity) * Number(draft.unitPrice))}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={save} title="Зберегти">
            <Check size={14} style={{ color: T.success }} />
          </button>
          <button
            onClick={() => {
              setDraft({
                description: item.description,
                unit: item.unit,
                quantity: String(item.quantity),
                unitPrice: String(item.unitPrice),
              });
              setEditing(false);
            }}
            title="Скасувати"
          >
            <X size={14} style={{ color: T.danger }} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-[32px_1fr_70px_70px_110px_130px_40px] items-center gap-3 border-b px-3 py-3.5 min-w-[800px] group"
      style={{
        backgroundColor: striped ? T.panelSoft : "transparent",
        borderColor: T.borderSoft,
      }}
    >
      <span className="text-xs font-medium" style={{ color: T.textMuted }}>
        {String(idx).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-medium truncate" style={{ color: T.textPrimary }}>
          {item.description}
        </span>
        {(item.priceSource || item.priceNote) && (
          <span className="text-[11px] truncate" style={{ color: T.textMuted }}>
            {[item.priceSource, item.priceNote].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
      <span className="text-xs" style={{ color: T.textSecondary }}>
        {item.unit}
      </span>
      <span className="text-xs font-medium" style={{ color: T.textSecondary }}>
        {item.quantity}
      </span>
      <span className="text-xs font-medium" style={{ color: T.textSecondary }}>
        {formatUAH(item.unitPrice)}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
        {formatUAH(item.totalCost)}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onClick={() => setEditing(true)} title="Редагувати">
          <Pencil size={12} style={{ color: T.textMuted }} />
        </button>
        <button onClick={onDelete} title="Видалити">
          <Trash2 size={12} style={{ color: T.textMuted }} />
        </button>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

// ============================================================
// VERIFICATION PANEL — detailed verification display
// ============================================================

const CATEGORY_META: Record<string, { label: string; icon: string; explanation: string }> = {
  calculation: {
    label: "Розрахунки",
    icon: "🔢",
    explanation: "Перевірка формул: totalCost = quantity × unitPrice + laborCost, суми секцій, загальні підсумки",
  },
  pricing: {
    label: "Ціни",
    icon: "💰",
    explanation: "Порівняння цін з ринковими діапазонами 2024-2025, виявлення нульових або нереалістичних цін",
  },
  completeness: {
    label: "Повнота",
    icon: "📋",
    explanation: "Чи є всі необхідні позиції: супутні матеріали, роботи до кожного матеріалу, обов'язкові категорії",
  },
  logic: {
    label: "Логіка",
    icon: "🔗",
    explanation: "Порядок секцій, дублікати позицій, відповідність структури стандартам",
  },
  specifications: {
    label: "Специфікації",
    icon: "📐",
    explanation: "Конкретні марки матеріалів (Knauf, Ceresit), розміри, вага, джерела цін",
  },
};

function getScoreExplanation(score: number): string {
  if (score >= 85) return "Кошторис пройшов усі перевірки. Можна використовувати.";
  if (score >= 70) return "Є незначні зауваження, але кошторис загалом коректний.";
  if (score >= 50) return "Знайдено помилки, що потребують уваги перед використанням.";
  if (score >= 30) return "Є критичні помилки в розрахунках або цінах. Потрібна корекція.";
  return "Кошторис має серйозні проблеми. Рекомендується перегенерувати або виправити вручну.";
}

function VerificationPanel({
  controller,
  verification,
  verifyScore,
  verifyUnavailable,
  issues,
  criticalIssues,
  lowConfIssues,
  estimate,
}: {
  controller: AiEstimateController;
  verification: any;
  verifyScore: number | undefined | null;
  verifyUnavailable: boolean;
  issues: VerificationIssue[];
  criticalIssues: VerificationIssue[];
  lowConfIssues: VerificationIssue[];
  estimate: EstimateData;
}) {
  const [expanded, setExpanded] = useState(false);
  const infoIssues = issues.filter(i => (i.severity ?? "").toLowerCase() === "info");
  const improvements: VerificationImprovement[] = (verification as any)?.improvements ?? [];
  const summary: string | undefined = (verification as any)?.summary;

  // Group issues by category
  const categoryGroups = new Map<string, VerificationIssue[]>();
  for (const issue of issues) {
    const cat = issue.category || "other";
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    categoryGroups.get(cat)!.push(issue);
  }

  // Category stats for mini-badges
  const categoryStats = Array.from(categoryGroups.entries()).map(([cat, catIssues]) => {
    const errors = catIssues.filter(i => i.severity === "error" || i.severity === "critical").length;
    const warnings = catIssues.filter(i => (i.severity ?? "").includes("warn")).length;
    const meta = CATEGORY_META[cat] || { label: cat, icon: "❓", explanation: "" };
    return { cat, errors, warnings, total: catIssues.length, ...meta, issues: catIssues };
  });

  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      {/* Header + Score */}
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ВЕРИФІКАЦІЯ
          </span>
          <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            Інженерна перевірка
          </span>
        </div>
        <ScoreDial
          value={verifyScore ?? 0}
          bigLabel={controller.isVerifying ? "…" : verifyScore != null ? String(Math.round(verifyScore)) : "—"}
          label="бал"
          color={
            verifyScore == null ? T.textMuted
              : verifyScore >= 80 ? T.success
                : verifyScore >= 50 ? T.warning
                  : T.danger
          }
        />
      </div>

      {/* Score explanation */}
      {verifyScore != null && !controller.isVerifying && !verifyUnavailable && (
        <div
          className="rounded-lg px-3 py-2 mb-3 text-[11px] leading-relaxed"
          style={{
            backgroundColor: verifyScore >= 80 ? T.successSoft : verifyScore >= 50 ? T.warningSoft : T.dangerSoft,
            color: verifyScore >= 80 ? T.success : verifyScore >= 50 ? T.warning : T.danger,
          }}
        >
          {getScoreExplanation(verifyScore)}
        </div>
      )}

      {/* Loading state */}
      {controller.isVerifying ? (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}>
          <Loader2 size={14} className="animate-spin" /> Аналізуємо кошторис…
        </div>
      ) : verifyUnavailable ? (
        <div className="rounded-lg px-3 py-2.5 text-xs leading-relaxed"
          style={{ backgroundColor: T.warningSoft, color: T.warning }}>
          ⚠ Автоматична верифікація недоступна — OpenAI повернув помилку
          (можливо вичерпано квоту). Кошторис створено, але не перевірено.
        </div>
      ) : !verification ? (
        <div className="rounded-lg px-3 py-2.5 text-xs"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}>
          Верифікація ще не запускалась
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-lg px-3 py-2.5 text-xs"
          style={{ backgroundColor: T.successSoft, color: T.success }}>
          ✓ Зауважень не знайдено — кошторис пройшов усі перевірки
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Category breakdown badges */}
          <div className="flex flex-wrap gap-1.5">
            {categoryStats.map(({ cat, icon, label, errors, warnings, total }) => {
              const hasErrors = errors > 0;
              const color = hasErrors ? T.danger : warnings > 0 ? T.warning : T.success;
              const bg = hasErrors ? T.dangerSoft : warnings > 0 ? T.warningSoft : T.successSoft;
              return (
                <div key={cat} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium"
                  style={{ backgroundColor: bg, color }}>
                  <span>{icon}</span>
                  <span>{label}</span>
                  <span className="font-bold">{total}</span>
                </div>
              );
            })}
          </div>

          {/* Critical issues (always shown) */}
          {criticalIssues.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {criticalIssues.slice(0, expanded ? 10 : 3).map((issue, i) => (
                <IssueRowDetailed key={`crit-${i}`} issue={issue} tone="danger" estimate={estimate} />
              ))}
            </div>
          )}

          {/* Warning issues */}
          {lowConfIssues.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {lowConfIssues.slice(0, expanded ? 10 : 2).map((issue, i) => (
                <IssueRowDetailed key={`warn-${i}`} issue={issue} tone="warning" estimate={estimate} />
              ))}
            </div>
          )}

          {/* Info issues (only when expanded) */}
          {expanded && infoIssues.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {infoIssues.slice(0, 5).map((issue, i) => (
                <IssueRowDetailed key={`info-${i}`} issue={issue} tone="info" estimate={estimate} />
              ))}
            </div>
          )}

          {/* Expand/collapse */}
          {issues.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors hover:opacity-80"
              style={{ color: T.textMuted }}
            >
              {expanded ? (
                <><ChevronUp size={12} /> Згорнути</>
              ) : (
                <><ChevronDown size={12} /> Показати всі {issues.length} зауважень</>
              )}
            </button>
          )}

          {/* Summary */}
          {summary && expanded && (
            <div className="rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
              style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}>
              <span className="font-semibold" style={{ color: T.textMuted }}>Висновок: </span>
              {summary}
            </div>
          )}

          {/* Improvements (when expanded) */}
          {expanded && improvements.length > 0 && (
            <div className="mt-1">
              <div className="text-[10px] font-bold tracking-wider mb-1.5" style={{ color: T.textMuted }}>
                РЕКОМЕНДАЦІЇ
              </div>
              <div className="flex flex-col gap-1.5">
                {improvements.slice(0, 5).map((imp, i) => (
                  <ImprovementRow key={i} improvement={imp} estimate={estimate} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ISSUE ROW — detailed version
// ============================================================

function IssueRowDetailed({
  issue,
  tone,
  estimate,
}: {
  issue: VerificationIssue;
  tone: "danger" | "warning" | "info";
  estimate: EstimateData;
}) {
  const [open, setOpen] = useState(false);
  const colorMap = { danger: T.danger, warning: T.warning, info: T.accentPrimary };
  const bgMap = { danger: T.dangerSoft, warning: T.warningSoft, info: T.accentPrimarySoft };
  const color = colorMap[tone];
  const bg = bgMap[tone];

  const cat = issue.category || "";
  const meta = CATEGORY_META[cat];
  const msg = issue.message || issue.description || meta?.label || "Зауваження";

  // Build location string from section/item indices
  let locationStr = issue.location || "";
  if (!locationStr && issue.sectionIndex != null) {
    const section = estimate.sections[issue.sectionIndex];
    if (section) {
      locationStr = `Секція: ${section.title}`;
      if (issue.itemIndex != null && section.items[issue.itemIndex]) {
        locationStr += ` → поз. ${issue.itemIndex + 1}: ${section.items[issue.itemIndex].description.slice(0, 50)}`;
      }
    }
  }

  const hasSuggestion = !!(issue.suggestion || issue.recommendation);
  const hasExpectedActual = issue.expected != null || issue.actual != null;
  const hasDetails = hasSuggestion || hasExpectedActual;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: bg, borderLeft: `3px solid ${color}` }}
    >
      <button
        className="flex items-start gap-2.5 px-3 py-2.5 w-full text-left"
        onClick={() => hasDetails && setOpen(!open)}
      >
        <TriangleAlert size={13} style={{ color }} className="mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {meta && <span className="text-[10px]">{meta.icon}</span>}
            <span className="text-xs font-semibold" style={{ color }}>{msg}</span>
          </div>
          {locationStr && (
            <div className="text-[10px] mt-0.5 truncate" style={{ color: T.textMuted }}>
              {locationStr}
            </div>
          )}
        </div>
        {hasDetails && (
          <ChevronDown
            size={12}
            style={{ color: T.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
            className="mt-1 flex-shrink-0"
          />
        )}
      </button>

      {/* Expanded details */}
      {open && hasDetails && (
        <div className="px-3 pb-2.5 pt-0 flex flex-col gap-1.5"
          style={{ borderTop: `1px solid ${color}20` }}>
          {/* Expected vs Actual */}
          {hasExpectedActual && (
            <div className="flex gap-3 text-[10px]">
              {issue.expected != null && (
                <div>
                  <span style={{ color: T.textMuted }}>Очікувано: </span>
                  <span className="font-medium" style={{ color: T.success }}>{String(issue.expected)}</span>
                </div>
              )}
              {issue.actual != null && (
                <div>
                  <span style={{ color: T.textMuted }}>Фактично: </span>
                  <span className="font-medium" style={{ color: T.danger }}>{String(issue.actual)}</span>
                </div>
              )}
            </div>
          )}

          {/* Suggestion */}
          {(issue.suggestion || issue.recommendation) && (
            <div className="text-[10px] leading-relaxed" style={{ color: T.textSecondary }}>
              <span className="font-semibold" style={{ color: T.textMuted }}>Рекомендація: </span>
              {issue.suggestion || issue.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// IMPROVEMENT ROW
// ============================================================

function ImprovementRow({
  improvement,
  estimate,
}: {
  improvement: VerificationImprovement;
  estimate: EstimateData;
}) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    add: { label: "Додати", color: T.success },
    modify: { label: "Змінити", color: T.warning },
    remove: { label: "Видалити", color: T.danger },
  };
  const { label, color } = typeLabels[improvement.type || "modify"] || typeLabels.modify;

  let location = "";
  if (improvement.sectionIndex != null) {
    const section = estimate.sections[improvement.sectionIndex];
    if (section) {
      location = section.title;
      if (improvement.itemIndex != null && section.items[improvement.itemIndex]) {
        location += ` → поз. ${improvement.itemIndex + 1}`;
      }
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]"
      style={{ backgroundColor: T.panelSoft }}>
      <span className="font-bold shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[9px]"
        style={{ backgroundColor: `${color}20`, color }}>
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ color: T.textSecondary }}>{improvement.description}</div>
        {improvement.suggestedChange?.reason && (
          <div className="mt-0.5" style={{ color: T.textMuted }}>
            {improvement.suggestedChange.reason}
          </div>
        )}
        {location && (
          <div className="mt-0.5 text-[10px]" style={{ color: T.textMuted }}>{location}</div>
        )}
      </div>
    </div>
  );
}
