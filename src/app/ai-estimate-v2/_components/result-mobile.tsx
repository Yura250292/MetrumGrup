"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Ellipsis,
  TrendingUp,
  Wand,
  Plus,
  Save,
  Layers,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
} from "lucide-react";
import { T } from "./tokens";
import { formatUAH } from "../_lib/format";
import type { AiEstimateController } from "../_lib/use-controller";
import type { EstimateData } from "../_lib/types";

export function ResultMobile({ controller }: { controller: AiEstimateController }) {
  const estimate = controller.estimate as EstimateData;
  const verification = controller.verificationResult;
  const totalAmount = estimate.summary?.totalBeforeDiscount ?? 0;
  const sectionCount = estimate.sections.length;
  const itemCount = estimate.sections.reduce((sum, s) => sum + s.items.length, 0);
  const verifyScore = verification?.overallScore;
  const [sheetExpanded, setSheetExpanded] = useState(false);

  return (
    <div
      className="relative flex w-full max-w-[430px] flex-col"
      style={{ backgroundColor: T.background, color: T.textPrimary, minHeight: "100vh", paddingBottom: 280 }}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-2.5">
          <button onClick={() => window.location.reload()}>
            <ArrowLeft size={18} style={{ color: T.textPrimary }} />
          </button>
          <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            Результат
          </span>
        </div>
        <Ellipsis size={18} style={{ color: T.textSecondary }} />
      </header>

      {/* Total */}
      <section className="flex flex-col gap-2.5 px-5 py-6">
        <span className="text-[10px] font-bold tracking-widest" style={{ color: T.textMuted }}>
          ЗАГАЛЬНИЙ КОШТОРИС
        </span>
        <span className="text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          {formatUAH(totalAmount)}
        </span>
        {controller.scalingInfo?.message && (
          <div className="flex items-center gap-1.5">
            <TrendingUp size={12} style={{ color: T.success }} />
            <span className="text-[11px] font-medium" style={{ color: T.success }}>
              {controller.scalingInfo.message}
            </span>
          </div>
        )}
        <div className="flex gap-2 pt-1.5">
          <KpiCell label="Секції" value={String(sectionCount)} />
          <KpiCell label="Позиції" value={String(itemCount)} />
          <KpiCell
            label="Верифік."
            value={controller.isVerifying ? "…" : verifyScore != null ? String(Math.round(verifyScore)) : "—"}
            valueColor={
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
      </section>

      {/* Actions */}
      <section className="flex gap-2 px-5 pb-4">
        <ActionBtn icon={Wand} label="Уточнити" onClick={controller.openRefine} />
        <ActionBtn icon={Plus} label="Додати" onClick={controller.openSupplement} />
        <ActionBtn icon={Save} label="Зберегти" primary onClick={controller.openSave} />
      </section>

      {/* Sections */}
      <div className="flex flex-col gap-2.5 px-4 pt-2">
        {estimate.sections.map((section, sIdx) => {
          const expanded = controller.expandedSections.has(sIdx);
          return (
            <div
              key={`section-${sIdx}`}
              className="flex flex-col rounded-xl"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <button
                onClick={() => controller.toggleSection(sIdx)}
                className="flex items-center gap-3 p-3.5 text-left"
              >
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: T.accentPrimarySoft }}
                >
                  <Layers size={16} style={{ color: T.accentPrimary }} />
                </div>
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <span className="text-[13px] font-semibold truncate" style={{ color: T.textPrimary }}>
                    {String(sIdx + 1).padStart(2, "0")} · {section.title}
                  </span>
                  <span className="text-[11px]" style={{ color: T.textMuted }}>
                    {section.items.length} позицій · {formatUAH(section.sectionTotal)}
                  </span>
                </div>
                {expanded ? (
                  <ChevronUp size={16} style={{ color: T.textMuted }} />
                ) : (
                  <ChevronDown size={16} style={{ color: T.textMuted }} />
                )}
              </button>
              {expanded && (
                <div className="flex flex-col gap-2 px-3 pb-3">
                  {section.items.slice(0, 8).map((item, iIdx) => (
                    <div
                      key={`item-${sIdx}-${iIdx}`}
                      className="flex flex-col gap-1 rounded-lg p-3"
                      style={{ backgroundColor: T.panelSoft }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12px] font-medium flex-1" style={{ color: T.textPrimary }}>
                          {item.description}
                        </span>
                        <span className="text-[12px] font-bold flex-shrink-0" style={{ color: T.textPrimary }}>
                          {formatUAH(item.totalCost)}
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: T.textMuted }}>
                        {item.quantity} {item.unit} × {formatUAH(item.unitPrice)}
                      </div>
                    </div>
                  ))}
                  {section.items.length > 8 && (
                    <div className="text-center text-[10px]" style={{ color: T.textMuted }}>
                      + ще {section.items.length - 8} позицій
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom sheet */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 flex w-full max-w-[430px] flex-col gap-3 px-5 pt-7 pb-7 z-20"
        style={{
          backgroundColor: T.panel,
          borderTop: `1px solid ${T.borderStrong}`,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
      >
        <button
          onClick={() => setSheetExpanded((v) => !v)}
          className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: T.borderStrong }}
        />
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Підсумок
          </span>
          {verifyScore != null && (
            <span className="text-xs font-bold" style={{ color: T.success }}>
              {Math.round(verifyScore)} / 100
            </span>
          )}
        </div>
        {sheetExpanded && (
          <>
            <BR label="Матеріали" value={formatUAH(estimate.summary?.materialsCost)} />
            <BR label="Праця" value={formatUAH(estimate.summary?.laborCost)} />
            <BR label="Накладні" value={formatUAH(estimate.summary?.overheadCost)} />
            <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />
          </>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Загалом
          </span>
          <span className="text-lg font-bold" style={{ color: T.textPrimary }}>
            {formatUAH(totalAmount)}
          </span>
        </div>
        <button
          onClick={() => controller.exportEstimate("excel")}
          disabled={controller.exporting !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {controller.exporting === "excel" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Експортувати
        </button>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 rounded-lg px-3 py-2.5" style={{ backgroundColor: T.panelElevated }}>
      <span className="text-[9px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-sm font-bold" style={{ color: valueColor ?? T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  primary = false,
  onClick,
}: {
  icon: any;
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold"
      style={{
        backgroundColor: primary ? T.accentPrimary : T.panelElevated,
        color: primary ? "#FFFFFF" : T.textSecondary,
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function BR({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span className="text-xs font-semibold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}
