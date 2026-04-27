"use client";

import { Info, History, MessageSquare, AlertCircle } from "lucide-react";
import { EditableSectionTable } from "@/components/estimates/EditableSectionTable";
import { TaxBreakdownCard } from "@/components/admin/TaxBreakdownCard";
import { ApprovalSignatureCard } from "@/components/admin/ApprovalSignatureCard";
import { EstimateHistoryTimeline } from "@/components/admin/EstimateHistoryTimeline";
import { CommentThread } from "@/components/collab/CommentThread";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DARK_VARS } from "@/app/admin-v2/_lib/dark-overrides";
import type { EstimateController } from "../_lib/use-controller";

const TABS = [
  { id: "details", label: "Деталі", icon: Info },
  { id: "history", label: "Історія", icon: History },
  { id: "discussion", label: "Обговорення", icon: MessageSquare },
] as const;

export function EstimateTabs({ controller }: { controller: EstimateController }) {
  const e = controller.estimate!;

  return (
    <div className="flex flex-col gap-6">
      {/* Tab nav */}
      <div
        className="flex gap-1 rounded-2xl p-1.5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = controller.activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => controller.setActiveTab(tab.id)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition"
              style={{
                backgroundColor: active ? T.accentPrimarySoft : "transparent",
                color: active ? T.accentPrimary : T.textSecondary,
                border: `1px solid ${active ? T.borderAccent : "transparent"}`,
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {controller.activeTab === "details" && (
        <div className="flex flex-col gap-6">
          {/* Engineer report banner */}
          {(e.analysisSummary || e.prozorroAnalysis) && (
            <button
              onClick={() => controller.setEngineerReportOpen(true)}
              className="flex items-start gap-3 rounded-2xl p-4 text-left transition hover:brightness-[0.97]"
              style={{ backgroundColor: T.warningSoft, border: `1px solid ${T.warning}` }}
            >
              <AlertCircle size={18} style={{ color: T.warning }} className="mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-bold" style={{ color: T.warning }}>
                  Звіт інженера доступний
                </span>
                <span className="text-[11px]" style={{ color: T.textSecondary }}>
                  Натисніть, щоб переглянути аналіз документів та контекст Prozorro
                </span>
              </div>
            </button>
          )}

          {/* Sections + items */}
          {e.sections.map((section) => (
            <div
              key={section.id}
              className="rounded-2xl p-5"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div className="admin-light" style={DARK_VARS}>
                <EditableSectionTable
                  estimateId={e.id}
                  sectionId={section.id}
                  sectionTitle={section.title}
                  items={section.items.map((it) => ({
                    id: it.id,
                    description: it.description,
                    unit: it.unit,
                    quantity: it.quantity,
                    unitPrice: it.unitPrice,
                    amount: it.amount,
                    costCodeId: it.costCodeId,
                    costCode: it.costCode,
                  }))}
                  onChanged={() => controller.loadEstimate()}
                />
              </div>
            </div>
          ))}

          {/* Tax breakdown */}
          {e.taxationType && e.taxationType !== "CASH" && e.taxCalculationDetails && (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div className="admin-light" style={DARK_VARS}>
                <TaxBreakdownCard
                  taxationType={e.taxationType as any}
                  taxBreakdown={{
                    pdvAmount: e.pdvAmount ?? 0,
                    esvAmount: e.esvAmount ?? 0,
                    militaryTaxAmount: e.militaryTaxAmount ?? 0,
                    profitTaxAmount: e.profitTaxAmount ?? 0,
                    unifiedTaxAmount: e.unifiedTaxAmount ?? 0,
                    pdfoAmount: e.pdfoAmount ?? 0,
                    totalTaxAmount: e.taxCalculationDetails.totalTaxAmount,
                    netProfit: e.taxCalculationDetails.netProfit,
                    effectiveTaxRate: e.taxCalculationDetails.effectiveTaxRate,
                  }}
                  totalMargin={e.profitMarginOverall}
                />
              </div>
            </div>
          )}

          {/* Totals card */}
          <div
            className="flex flex-col gap-4 rounded-2xl p-6"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ПІДСУМКИ
            </span>
            <Row label="Матеріали" value={formatCurrency(Number(e.totalMaterials || 0))} />
            <Row label="Праця" value={formatCurrency(Number(e.totalLabor || 0))} />
            <Row label="Накладні" value={formatCurrency(Number(e.totalOverhead || 0))} />
            <Divider />
            <Row
              label="Загальна вартість"
              value={formatCurrency(Number(e.totalAmount || 0))}
              bold
            />
            {Number(e.profitAmount || 0) > 0 && (
              <Row label="Прибуток" value={formatCurrency(Number(e.profitAmount))} accent={T.success} />
            )}
            {Number(e.logisticsCost || 0) > 0 && (
              <Row
                label="Логістика"
                value={formatCurrency(Number(e.logisticsCost))}
                accent={T.accentPrimary}
              />
            )}
            {Number(e.taxAmount || 0) > 0 && (
              <Row
                label={`Податок (${e.taxationType ?? ""} ${e.taxRate}%)`}
                value={formatCurrency(Number(e.taxAmount))}
                accent={T.warning}
              />
            )}
            <Divider />
            {Number(e.finalClientPrice || 0) > 0 ? (
              <Row
                label="Фінальна ціна для клієнта"
                value={formatCurrency(Number(e.finalClientPrice))}
                bold
                large
                accent={T.success}
              />
            ) : (
              <Row
                label="До сплати"
                value={formatCurrency(Number(e.finalAmount || 0))}
                bold
                large
              />
            )}
          </div>
        </div>
      )}

      {controller.activeTab === "history" && (
        <div className="flex flex-col gap-6">
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="admin-light" style={DARK_VARS}>
              <ApprovalSignatureCard approvals={controller.approvals} estimateId={e.id} />
            </div>
          </div>
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="admin-light" style={DARK_VARS}>
              <EstimateHistoryTimeline estimateId={e.id} />
            </div>
          </div>
        </div>
      )}

      {controller.activeTab === "discussion" && (
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="admin-light" style={DARK_VARS}>
            <CommentThread entityType="ESTIMATE" entityId={e.id} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  accent = T.textPrimary,
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`${large ? "text-[15px]" : "text-[13px]"} ${bold ? "font-bold" : ""}`}
        style={{ color: T.textSecondary }}
      >
        {label}
      </span>
      <span
        className={`${large ? "text-2xl" : "text-[14px]"} ${bold ? "font-bold" : "font-semibold"}`}
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />;
}
