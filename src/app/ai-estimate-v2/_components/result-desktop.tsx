"use client";

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
} from "lucide-react";
import { T } from "./tokens";
import { ConfidenceBadge, ScoreDial } from "./primitives";
import { formatUAH } from "../_lib/format";
import type { AiEstimateController } from "../_lib/use-controller";
import type { EstimateData, EstimateSection, EstimateItem, VerificationIssue } from "../_lib/types";

export function ResultDesktop({ controller }: { controller: AiEstimateController }) {
  const estimate = controller.estimate as EstimateData;
  const verification = controller.verificationResult;

  const totalAmount = estimate.summary?.totalBeforeDiscount ?? 0;
  const sectionCount = estimate.sections.length;
  const itemCount = estimate.sections.reduce((sum, s) => sum + s.items.length, 0);
  const verifyScore = verification?.overallScore;
  const issues: VerificationIssue[] = verification?.issues ?? [];
  const lowConfIssues = issues.filter((i) => (i.severity ?? "").toLowerCase().includes("warn"));
  const criticalIssues = issues.filter((i) => (i.severity ?? "").toLowerCase().includes("crit"));

  return (
    <div className="w-[1440px] flex-shrink-0" style={{ backgroundColor: T.background, color: T.textPrimary }}>
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
      <section className="flex items-center gap-12 px-12 py-9">
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
        <div className="h-24 w-px" style={{ backgroundColor: T.borderSoft }} />
        <div className="flex flex-1 items-center gap-4">
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
      <section className="flex items-start gap-8 px-12 pb-14">
        {/* Sections column */}
        <div className="flex flex-1 flex-col gap-4" style={{ gap: 18 }}>
          {estimate.sections.map((section, sIdx) => (
            <SectionBlock
              key={`section-${sIdx}`}
              section={section}
              idx={sIdx}
              expanded={controller.expandedSections.has(sIdx)}
              onToggle={() => controller.toggleSection(sIdx)}
              issues={issues}
            />
          ))}

          {estimate.sections.length === 0 && (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ backgroundColor: T.panel, border: `1px dashed ${T.borderSoft}`, color: T.textMuted }}
            >
              Кошторис ще не містить секцій
            </div>
          )}
        </div>

        {/* Insights sidebar */}
        <aside className="flex w-[380px] flex-col gap-4">
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
          <div className="rounded-2xl p-6" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
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
                  verifyScore == null
                    ? T.textMuted
                    : verifyScore >= 80
                      ? T.success
                      : verifyScore >= 50
                        ? T.warning
                        : T.danger
                }
              />
            </div>

            {controller.isVerifying ? (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
                style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
              >
                <Loader2 size={14} className="animate-spin" /> Аналізуємо кошторис…
              </div>
            ) : criticalIssues.length === 0 && lowConfIssues.length === 0 ? (
              <div
                className="rounded-lg px-3 py-2.5 text-xs"
                style={{ backgroundColor: T.successSoft, color: T.success }}
              >
                Зауважень не знайдено
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {criticalIssues.slice(0, 2).map((issue, i) => (
                  <IssueRow key={`crit-${i}`} issue={issue} tone="danger" />
                ))}
                {lowConfIssues.slice(0, 2).map((issue, i) => (
                  <IssueRow key={`warn-${i}`} issue={issue} tone="warning" />
                ))}
              </div>
            )}
          </div>

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
}: {
  section: EstimateSection;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
  issues: VerificationIssue[];
}) {
  const sectionItems = section.items.length;
  const sectionConfidence = issues.find((i) => i.location?.includes(section.title));

  return (
    <div className="flex flex-col rounded-2xl" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <button
        onClick={onToggle}
        className="flex items-center justify-between gap-4 rounded-t-2xl border-b px-6 py-4"
        style={{ backgroundColor: T.panelElevated, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <Layers size={18} style={{ color: T.accentPrimary }} />
          </div>
          <div className="flex flex-col gap-0.5 text-left">
            <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              {String(idx + 1).padStart(2, "0")} · {section.title}
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {sectionItems} {sectionItems === 1 ? "позиція" : "позицій"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBadge value={sectionConfidence ? "Потребує перевірки" : "Без зауважень"} tone={sectionConfidence ? "warning" : "success"} />
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-base font-bold" style={{ color: T.textPrimary }}>
              {formatUAH(section.sectionTotal)}
            </span>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              проміжний підсумок
            </span>
          </div>
          {expanded ? (
            <ChevronUp size={18} style={{ color: T.textMuted }} />
          ) : (
            <ChevronDown size={18} style={{ color: T.textMuted }} />
          )}
        </div>
      </button>

      {expanded && section.items.length > 0 && (
        <div className="flex flex-col px-3 pt-2 pb-4">
          <div
            className="grid grid-cols-[32px_1fr_80px_80px_120px_140px_120px] items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ backgroundColor: T.panelSoft }}
          >
            <Th>#</Th>
            <Th>ПОЗИЦІЯ</Th>
            <Th>ОД.</Th>
            <Th>К-СТЬ</Th>
            <Th>ЦІНА ЗА ОД.</Th>
            <Th>СУМА</Th>
            <Th>ДЖЕРЕЛО</Th>
          </div>
          {section.items.map((item, iIdx) => (
            <Row key={`item-${idx}-${iIdx}`} idx={iIdx + 1} item={item} striped={iIdx % 2 === 1} />
          ))}
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

function Row({ idx, item, striped }: { idx: number; item: EstimateItem; striped: boolean }) {
  return (
    <div
      className="grid grid-cols-[32px_1fr_80px_80px_120px_140px_120px] items-center gap-3 border-b px-3 py-3.5"
      style={{
        backgroundColor: striped ? T.panelSoft : "transparent",
        borderColor: T.borderSoft,
      }}
    >
      <span className="text-xs font-medium" style={{ color: T.textMuted }}>
        {String(idx).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium" style={{ color: T.textPrimary }}>
          {item.description}
        </span>
        {(item.priceSource || item.priceNote) && (
          <span className="text-[11px]" style={{ color: T.textMuted }}>
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
      <span className="text-[10px]" style={{ color: T.textMuted }}>
        {item.priceSourceType || "AI"}
      </span>
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

function IssueRow({ issue, tone }: { issue: VerificationIssue; tone: "danger" | "warning" }) {
  const color = tone === "danger" ? T.danger : T.warning;
  const bg = tone === "danger" ? T.dangerSoft : T.warningSoft;
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: bg, borderLeft: `3px solid ${color}` }}
    >
      <TriangleAlert size={14} style={{ color }} className="mt-0.5 flex-shrink-0" />
      <div className="flex flex-col gap-0.5">
        <div className="text-xs font-semibold" style={{ color }}>
          {issue.description || issue.category || "Зауваження"}
        </div>
        {issue.location && (
          <div className="text-[11px]" style={{ color: T.textMuted }}>
            {issue.location}
          </div>
        )}
      </div>
    </div>
  );
}
