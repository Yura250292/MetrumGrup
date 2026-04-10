"use client";

import { X, Calculator, Truck, Loader2, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { EstimateController } from "../_lib/use-controller";

export function FinanceModal({ controller }: { controller: EstimateController }) {
  const e = controller.estimate!;
  const preview = controller.calculatePreview();

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(7, 10, 17, 0.92)" }}
      onClick={controller.closeFinance}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="flex h-full max-h-[90vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-3xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between gap-4 border-b px-7 py-5"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Calculator size={22} style={{ color: T.accentPrimary }} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Фінансові налаштування
              </h2>
              <span className="text-xs" style={{ color: T.textMuted }}>
                Кошторис {e.number}
              </span>
            </div>
          </div>
          <button
            onClick={controller.closeFinance}
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
          >
            <X size={16} style={{ color: T.textSecondary }} />
          </button>
        </header>

        {/* Body — 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 overflow-y-auto p-7">
          {/* Left: settings */}
          <div className="flex flex-col gap-6">
            {/* Global margin */}
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ГЛОБАЛЬНА МАРЖА (%)
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={controller.globalMargin}
                  onChange={(e) => controller.setGlobalMargin(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={controller.globalMargin}
                  onChange={(e) => controller.setGlobalMargin(Number(e.target.value))}
                  className="w-20 rounded-xl px-3 py-2 text-sm font-bold outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
                <button
                  onClick={controller.applyGlobalMargin}
                  className="rounded-xl px-3 py-2 text-xs font-bold"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                    border: `1px solid ${T.accentPrimary}`,
                  }}
                >
                  Застосувати до всіх
                </button>
              </div>
            </div>

            {/* Per-item margins */}
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ІНДИВІДУАЛЬНА МАРЖА ПО ПОЗИЦІЯХ
              </span>
              <div
                className="flex flex-col gap-2 max-h-[300px] overflow-y-auto rounded-xl p-3"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
              >
                {e.sections.flatMap((s) =>
                  s.items.map((it) => (
                    <div key={it.id} className="flex items-center gap-3">
                      <span
                        className="flex-1 truncate text-[12px]"
                        style={{ color: T.textSecondary }}
                      >
                        {it.description}
                      </span>
                      <input
                        type="number"
                        value={controller.itemMargins[it.id] ?? 20}
                        onChange={(e) =>
                          controller.updateItemMargin(it.id, Number(e.target.value))
                        }
                        className="w-16 rounded-lg px-2 py-1 text-xs font-bold text-right outline-none"
                        style={{
                          backgroundColor: T.panel,
                          border: `1px solid ${T.borderStrong}`,
                          color: T.textPrimary,
                        }}
                      />
                      <span className="text-[10px]" style={{ color: T.textMuted }}>
                        %
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Logistics */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ЛОГІСТИКА (₴)
              </span>
              <div
                className="flex items-center gap-2 rounded-xl px-3.5 py-3"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
              >
                <Truck size={16} style={{ color: T.accentPrimary }} />
                <input
                  type="number"
                  value={controller.logisticsCost}
                  onChange={(e) => controller.setLogisticsCost(Number(e.target.value))}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: T.textPrimary }}
                />
              </div>
            </div>

            {/* Tax type */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                СИСТЕМА ОПОДАТКУВАННЯ
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(["CASH", "FOP", "VAT"] as const).map((t) => {
                  const active = controller.taxationType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => controller.setTaxationType(t)}
                      className="flex flex-col items-start gap-0.5 rounded-xl p-3 text-left"
                      style={{
                        backgroundColor: active ? T.accentPrimarySoft : T.panelSoft,
                        border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
                      }}
                    >
                      <span
                        className="text-[13px] font-bold"
                        style={{ color: active ? T.accentPrimary : T.textPrimary }}
                      >
                        {t === "CASH" ? "Готівка" : t === "FOP" ? "ФОП 5%" : "ПДВ 20%"}
                      </span>
                      <span className="text-[10px]" style={{ color: T.textMuted }}>
                        {t === "CASH"
                          ? "Без податку"
                          : t === "FOP"
                            ? "Спрощена"
                            : "Загальна"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                НОТАТКИ ФІНАНСИСТА
              </span>
              <textarea
                value={controller.financeNotes}
                onChange={(e) => controller.setFinanceNotes(e.target.value)}
                rows={3}
                className="resize-none rounded-xl px-3.5 py-3 text-[13px] outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </div>
          </div>

          {/* Right: live preview */}
          {preview && (
            <div
              className="flex h-fit flex-col gap-3 rounded-2xl p-5"
              style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderAccent}` }}
            >
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ПОПЕРЕДНІЙ РОЗРАХУНОК
              </span>
              <PreviewRow label="Собівартість" value={formatCurrency(preview.totalCost)} />
              <PreviewRow
                label="Виручка з маржею"
                value={formatCurrency(preview.totalRevenue)}
                accent={T.success}
              />
              <PreviewRow
                label="Прибуток"
                value={formatCurrency(preview.profit)}
                accent={T.success}
              />
              {preview.logisticsCost > 0 && (
                <PreviewRow
                  label="Логістика"
                  value={formatCurrency(preview.logisticsCost)}
                  accent={T.accentPrimary}
                />
              )}
              {preview.tax > 0 && (
                <PreviewRow
                  label={`Податок (${controller.taxationType})`}
                  value={formatCurrency(preview.tax)}
                  accent={T.warning}
                />
              )}
              <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />
              <PreviewRow
                label="Фінальна ціна"
                value={formatCurrency(preview.finalPrice)}
                bold
                large
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-end gap-2.5 border-t px-7 py-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panelSoft }}
        >
          <button
            onClick={controller.closeFinance}
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            Скасувати
          </button>
          <button
            onClick={controller.applyFinancialSettings}
            disabled={controller.applyingFinance}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {controller.applyingFinance ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Застосувати
          </button>
        </footer>
      </div>
    </div>
  );
}

function PreviewRow({
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
        className={`${large ? "text-[14px]" : "text-[12px]"} ${bold ? "font-bold" : ""}`}
        style={{ color: T.textSecondary }}
      >
        {label}
      </span>
      <span
        className={`${large ? "text-xl" : "text-[13px]"} ${bold ? "font-bold" : "font-semibold"}`}
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}
