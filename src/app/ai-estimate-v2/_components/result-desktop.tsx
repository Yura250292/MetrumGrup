"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
  Hammer,
  Package,
} from "lucide-react";
import { T } from "./tokens";
import { ConfidenceBadge, ScoreDial } from "./primitives";
import { formatUAH } from "../_lib/format";
import type { AiEstimateController } from "../_lib/use-controller";
import type { EstimateData, EstimateSection, EstimateItem, VerificationIssue, VerificationImprovement } from "../_lib/types";

// Нормалізація типу позиції: legacy 'labor'/'equipment'/'composite' → 'work'.
function resolveItemKind(it: EstimateItem): "work" | "material" {
  return it.itemType === "material" ? "material" : "work";
}

// Розкласти items[] секції у порядок [work, ...children, work, ...children, standalone-materials]
// з прапором isChild для UI-відступу.
function arrangeSectionItems(
  items: EstimateItem[]
): Array<{ item: EstimateItem; origIdx: number; isChild: boolean }> {
  const out: Array<{ item: EstimateItem; origIdx: number; isChild: boolean }> = [];
  const placed = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (placed.has(i)) continue;
    if (resolveItemKind(items[i]) !== "work") continue;
    out.push({ item: items[i], origIdx: i, isChild: false });
    placed.add(i);
    const parentOneBased = i + 1;
    for (let j = 0; j < items.length; j++) {
      if (placed.has(j)) continue;
      if (items[j].parentSortOrder === parentOneBased) {
        out.push({ item: items[j], origIdx: j, isChild: true });
        placed.add(j);
      }
    }
  }
  // Standalone позиції (часто матеріали без парента) — у кінці.
  for (let i = 0; i < items.length; i++) {
    if (!placed.has(i)) out.push({ item: items[i], origIdx: i, isChild: false });
  }
  return out;
}

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

  // Items без ціни — окрема секція в сайдбарі (план: "де відсутня впевненість").
  // Покриває обидва кейси: zero-price-fixer не зміг знайти ціну, або взагалі не запускався.
  const noPriceItems = estimate.sections.flatMap((s, sIdx) =>
    s.items
      .map((it, iIdx) => ({ item: it, sIdx, iIdx, sectionTitle: s.title }))
      .filter((x) => !x.item.unitPrice || x.item.unitPrice <= 0)
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
          {estimate.analysisSummary && (
            <button
              onClick={controller.openEngineerReport}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium border"
              style={{
                color: T.warning,
                borderColor: T.warning,
                backgroundColor: T.warningSoft,
              }}
              title="Звіт інженера"
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
          <FilterToolbar controller={controller} />

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

          <DetailsPanel controller={controller} />
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

          {/* Zero Price Fix Banner — показує що було автокореговано */}
          {(estimate as any).zeroPriceFixResult && (estimate as any).zeroPriceFixResult.totalZeroItems > 0 && (
            <ZeroPriceFixBanner result={(estimate as any).zeroPriceFixResult} />
          )}

          {/* Без ціни — позиції які потребують ручної цінової експертизи */}
          {noPriceItems.length > 0 && <NoPricePanel items={noPriceItems} />}

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

  const isSelected = controller.selectedSectionIdx === idx;

  return (
    <div
      className="flex flex-col rounded-2xl"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${isSelected ? T.borderAccent : T.borderSoft}`,
        boxShadow: isSelected ? `0 0 0 2px ${T.accentPrimarySoft}` : undefined,
      }}
    >
      <div
        className="flex items-center justify-between gap-4 rounded-t-2xl border-b px-6 py-4"
        style={{ backgroundColor: T.panelElevated, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => controller.selectSection(idx)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.accentPrimarySoft }}
            title={isSelected ? "Скинути виділення (Деталізація показує все)" : "Відкрити в Деталізації"}
          >
            <Layers size={18} style={{ color: T.accentPrimary }} />
          </button>
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
          {(() => {
            const arranged = arrangeSectionItems(section.items);
            const filter = controller.itemFilter;
            const visible = arranged.filter(({ item }) => {
              if (filter === "all") return true;
              return resolveItemKind(item) === filter;
            });
            if (visible.length === 0) {
              return (
                <div className="px-3 py-6 text-center text-xs" style={{ color: T.textMuted }}>
                  Немає позицій під поточний фільтр
                </div>
              );
            }
            let displayIdx = 0;
            return visible.map(({ item, origIdx, isChild }) => {
              displayIdx++;
              return (
                <Row
                  key={`item-${idx}-${origIdx}`}
                  idx={displayIdx}
                  item={item}
                  isChild={isChild}
                  striped={displayIdx % 2 === 0}
                  onChange={(patch) => controller.updateItem(idx, origIdx, patch)}
                  onDelete={() => controller.deleteItem(idx, origIdx)}
                  onToggleType={() => controller.toggleItemType(idx, origIdx)}
                />
              );
            });
          })()}

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
  isChild,
  striped,
  onChange,
  onDelete,
  onToggleType,
}: {
  idx: number;
  item: EstimateItem;
  isChild: boolean;
  striped: boolean;
  onChange: (patch: Partial<EstimateItem>) => void;
  onDelete: () => void;
  onToggleType: () => void;
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

  const kind = resolveItemKind(item);

  return (
    <div
      className="grid grid-cols-[32px_1fr_70px_70px_110px_130px_40px] items-center gap-3 border-b px-3 py-3.5 min-w-[800px] group"
      style={{
        backgroundColor: striped ? T.panelSoft : "transparent",
        borderColor: T.borderSoft,
        borderLeft: kind === "work" ? `2px solid ${T.indigo}` : "2px solid transparent",
        paddingLeft: isChild ? 28 : 12,
      }}
    >
      <span className="text-xs font-medium" style={{ color: T.textMuted }}>
        {String(idx).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <TypeChip kind={kind} onClick={onToggleType} />
          <span className="text-[13px] font-medium truncate" style={{ color: T.textPrimary }}>
            {item.description}
          </span>
          {item.priceSource?.includes("Метрум корпус") && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
              title={item.priceSource}
            >
              З КОРПУСУ
            </span>
          )}
        </div>
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
// Type chip + work/material UI
// ============================================================

function TypeChip({
  kind,
  onClick,
}: {
  kind: "work" | "material";
  onClick?: () => void;
}) {
  const isWork = kind === "work";
  const bg = isWork ? T.indigoSoft : T.amberSoft;
  const color = isWork ? T.indigo : T.amber;
  const label = isWork ? "Робота" : "Матеріал";
  const Icon = isWork ? Hammer : Package;
  return (
    <button
      type="button"
      onClick={onClick}
      title={onClick ? `Перемкнути на ${isWork ? "матеріал" : "роботу"}` : undefined}
      className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: bg, color }}
    >
      <Icon size={10} />
      {label}
    </button>
  );
}

function FilterToolbar({ controller }: { controller: AiEstimateController }) {
  const { itemFilter, setItemFilter, selectedSectionIdx, selectSection, estimate } = controller;
  const options: Array<{ value: "all" | "work" | "material"; label: string }> = [
    { value: "all", label: "Все" },
    { value: "work", label: "Роботи" },
    { value: "material", label: "Матеріали" },
  ];
  const selectedTitle =
    selectedSectionIdx != null ? estimate?.sections[selectedSectionIdx]?.title : null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
        <span className="font-semibold">Фільтр:</span>
        <div className="flex items-center gap-1 rounded-lg p-1" style={{ backgroundColor: T.panelSoft }}>
          {options.map((opt) => {
            const active = itemFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setItemFilter(opt.value)}
                className="rounded-md px-3 py-1 text-xs font-semibold transition"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textSecondary,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      {selectedTitle && (
        <button
          type="button"
          onClick={() => selectSection(null)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          title="Скинути виділення секції"
        >
          Секція: {selectedTitle}
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function DetailsPanel({ controller }: { controller: AiEstimateController }) {
  const { estimate, selectedSectionIdx, selectSection } = controller;
  const [tab, setTab] = useState<"work" | "material">("work");

  const { works, materials, scopeLabel } = useMemo(() => {
    const all: Array<{ item: EstimateItem; sectionTitle: string }> = [];
    if (estimate) {
      const sections =
        selectedSectionIdx != null
          ? [estimate.sections[selectedSectionIdx]].filter(Boolean)
          : estimate.sections;
      for (const s of sections) {
        if (!s) continue;
        for (const it of s.items) all.push({ item: it, sectionTitle: s.title });
      }
    }
    return {
      works: all.filter(({ item }) => resolveItemKind(item) === "work"),
      materials: all.filter(({ item }) => resolveItemKind(item) === "material"),
      scopeLabel:
        selectedSectionIdx != null
          ? estimate?.sections[selectedSectionIdx]?.title ?? "Секція"
          : "усі секції",
    };
  }, [estimate, selectedSectionIdx]);

  const rows = tab === "work" ? works : materials;
  const totalAmount = rows.reduce((sum, r) => sum + (r.item.totalCost || 0), 0);

  return (
    <div
      className="flex flex-col rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b px-6 py-4"
        style={{ backgroundColor: T.panelElevated, borderColor: T.borderSoft }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ДЕТАЛІЗАЦІЯ
          </span>
          <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            {scopeLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ backgroundColor: T.panelSoft }}>
            <TabButton
              active={tab === "work"}
              onClick={() => setTab("work")}
              icon={<Hammer size={12} />}
              label={`Роботи · ${works.length}`}
            />
            <TabButton
              active={tab === "material"}
              onClick={() => setTab("material")}
              icon={<Package size={12} />}
              label={`Матеріали · ${materials.length}`}
            />
          </div>
          {selectedSectionIdx != null && (
            <button
              type="button"
              onClick={() => selectSection(null)}
              className="rounded-md p-1"
              title="Показати по всіх секціях"
            >
              <X size={14} style={{ color: T.textMuted }} />
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-8 text-center text-xs" style={{ color: T.textMuted }}>
          {tab === "work" ? "Немає робіт у вибраному скоупі" : "Немає матеріалів у вибраному скоупі"}
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.map(({ item, sectionTitle }, i) => (
            <div
              key={`d-${i}`}
              className="grid grid-cols-[1fr_70px_80px_120px_140px] items-center gap-3 border-b px-6 py-2.5"
              style={{
                borderColor: T.borderSoft,
                backgroundColor: i % 2 ? T.panelSoft : "transparent",
              }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13px] font-medium truncate" style={{ color: T.textPrimary }}>
                  {item.description}
                </span>
                {selectedSectionIdx == null && (
                  <span className="text-[10px]" style={{ color: T.textMuted }}>
                    {sectionTitle}
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: T.textSecondary }}>
                {item.unit}
              </span>
              <span className="text-xs font-medium" style={{ color: T.textSecondary }}>
                {item.quantity}
              </span>
              <span className="text-xs" style={{ color: T.textSecondary }}>
                {formatUAH(item.unitPrice)}
              </span>
              <span className="text-[13px] font-semibold text-right" style={{ color: T.textPrimary }}>
                {formatUAH(item.totalCost)}
              </span>
            </div>
          ))}
          <div
            className="flex items-center justify-between px-6 py-3 rounded-b-2xl"
            style={{ backgroundColor: T.panelElevated }}
          >
            <span className="text-xs font-semibold" style={{ color: T.textSecondary }}>
              Всього {tab === "work" ? "робіт" : "матеріалів"}
            </span>
            <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
              {formatUAH(totalAmount)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
      style={{
        backgroundColor: active ? T.panel : "transparent",
        color: active ? T.textPrimary : T.textMuted,
        boxShadow: active ? T.shadow1 : undefined,
      }}
    >
      {icon}
      {label}
    </button>
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

// ============================================================
// ZERO PRICE FIX BANNER
// ============================================================

function ZeroPriceFixBanner({ result }: { result: any }) {
  const [expanded, setExpanded] = useState(false);
  const fixed = result.fixedItems || [];
  const unfixed = result.unfixedItems || [];
  const allFixed = unfixed.length === 0 && fixed.length > 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: allFixed ? T.successSoft : T.warningSoft,
        border: `1px solid ${allFixed ? T.success : T.warning}`,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5">
          {allFixed ? "✅" : "🔍"}
        </span>
        <div className="flex-1">
          <div className="text-xs font-semibold" style={{ color: allFixed ? T.success : T.warning }}>
            Допошук цін через альтернативну AI модель
          </div>
          <div className="text-[11px] leading-relaxed mt-0.5" style={{ color: T.textSecondary }}>
            {fixed.length > 0
              ? `Знайдено ціни для ${fixed.length} із ${result.totalZeroItems} позицій з нульовою ціною.`
              : `Не вдалося знайти ціни для ${result.totalZeroItems} позицій.`
            }
            {unfixed.length > 0 && ` ${unfixed.length} позицій потребують ручного введення ціни.`}
          </div>

          {/* Expandable details */}
          {(fixed.length > 0 || unfixed.length > 0) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] font-medium mt-1.5 flex items-center gap-1"
              style={{ color: T.textMuted }}
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? "Згорнути" : "Деталі"}
            </button>
          )}

          {expanded && (
            <div className="mt-2 flex flex-col gap-1.5">
              {fixed.map((item: any, i: number) => (
                <div key={`fix-${i}`} className="flex items-start gap-2 text-[10px] rounded px-2 py-1.5"
                  style={{ backgroundColor: `${T.success}10` }}>
                  <span style={{ color: T.success }}>✓</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium" style={{ color: T.textPrimary }}>{item.description}</span>
                    <span style={{ color: T.textMuted }}> → </span>
                    <span className="font-bold" style={{ color: T.success }}>
                      {new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 }).format(item.newPrice)}
                    </span>
                    <span style={{ color: T.textMuted }}> ({item.source})</span>
                  </div>
                </div>
              ))}
              {unfixed.map((item: any, i: number) => (
                <div key={`unfix-${i}`} className="flex items-start gap-2 text-[10px] rounded px-2 py-1.5"
                  style={{ backgroundColor: `${T.danger}10` }}>
                  <span style={{ color: T.danger }}>✗</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium" style={{ color: T.textPrimary }}>{item.description}</span>
                    <span style={{ color: T.textMuted }}> — {item.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// NO PRICE PANEL — позиції з нульовою ціною, що потребують ручної експертизи
// ============================================================

function NoPricePanel({
  items,
}: {
  items: Array<{ item: EstimateItem; sIdx: number; iIdx: number; sectionTitle: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = items.slice(0, 5);
  const rest = items.length - preview.length;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: T.dangerSoft, border: `1px solid ${T.danger}` }}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert size={18} style={{ color: T.danger }} className="mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-xs font-semibold" style={{ color: T.danger }}>
            Без ціни — {items.length} {items.length === 1 ? "позиція" : "позицій"}
          </div>
          <div className="text-[11px] leading-relaxed mt-0.5" style={{ color: T.textSecondary }}>
            Цих позицій система не знайшла в базі — потрібна ручна перевірка ціни.
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {(expanded ? items : preview).map((x, i) => (
              <div
                key={`np-${x.sIdx}-${x.iIdx}-${i}`}
                className="flex items-start gap-2 text-[10px] rounded px-2 py-1.5"
                style={{ backgroundColor: `${T.danger}10` }}
              >
                <span style={{ color: T.danger }}>•</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium" style={{ color: T.textPrimary }}>
                    {x.item.description}
                  </span>
                  <span style={{ color: T.textMuted }}> · {x.sectionTitle}</span>
                </div>
              </div>
            ))}
          </div>
          {rest > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] font-medium mt-1.5 flex items-center gap-1"
              style={{ color: T.textMuted }}
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? "Згорнути" : `Показати ще ${rest}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
