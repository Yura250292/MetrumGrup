"use client";

import { Wand, X, Check, Sparkles, TrendingDown, Layers, Globe, Eye, Loader2 } from "lucide-react";
import { T } from "./tokens";
import type { AiEstimateController } from "../_lib/use-controller";

export function RefinePanel({ controller }: { controller: AiEstimateController }) {
  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-[520px] flex-col"
      style={{ backgroundColor: T.panel, borderLeft: `1px solid ${T.borderStrong}` }}
    >
      {/* Header */}
      <div className="flex flex-col gap-3.5 border-b px-7 pt-7 pb-5" style={{ borderColor: T.borderSoft }}>
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              <Wand size={12} /> УТОЧНИТИ ЧЕРЕЗ AI
            </span>
            <h2 className="text-[22px] font-bold" style={{ color: T.textPrimary }}>
              Уточнити кошторис
            </h2>
          </div>
          <button
            onClick={controller.closeRefine}
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.panelElevated }}
          >
            <X size={16} style={{ color: T.textSecondary }} />
          </button>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: T.textSecondary }}>
          Скажіть AI, що саме змінити. Можна застосувати до всього кошторису.
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-7 py-5" style={{ gap: 18 }}>
        {/* Context */}
        <div
          className="flex flex-col gap-2 rounded-xl p-3.5"
          style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
        >
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ПОТОЧНИЙ КОНТЕКСТ
          </span>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                Весь кошторис
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                {controller.estimate?.sections.length ?? 0} секцій ·{" "}
                {controller.estimate?.sections.reduce((sum, s) => sum + s.items.length, 0) ?? 0} позицій
              </span>
            </div>
          </div>
        </div>

        {/* Model picker */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            МОДЕЛЬ
          </span>
          <div className="grid grid-cols-3 gap-2">
            <ModelCard
              label="OpenAI"
              hint="Збалансована"
              active={controller.selectedRefineModel === "openai"}
              onClick={() => controller.setSelectedRefineModel("openai")}
            />
            <ModelCard
              label="Anthropic"
              hint="Найвища якість"
              active={controller.selectedRefineModel === "anthropic"}
              onClick={() => controller.setSelectedRefineModel("anthropic")}
            />
            <ModelCard
              label="Gemini"
              hint="Швидка"
              active={controller.selectedRefineModel === "gemini"}
              onClick={() => controller.setSelectedRefineModel("gemini")}
            />
          </div>
        </div>

        {/* Prompt */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ЗАПИТ
          </span>
          <div
            className="flex flex-col gap-2.5 rounded-xl p-4"
            style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
          >
            <textarea
              value={controller.refinePrompt}
              onChange={(e) => controller.setRefinePrompt(e.target.value)}
              placeholder="Наприклад: перерахувати секцію покрівлі з використанням готових сендвіч-панелей замість мінвати"
              rows={6}
              className="resize-none bg-transparent text-[13px] leading-relaxed outline-none"
              style={{ color: T.textPrimary }}
            />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: T.textMuted }}>
                <Sparkles size={12} style={{ color: T.accentPrimary }} /> AI пояснить свої зміни
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                {controller.refinePrompt.length} / 2000
              </span>
            </div>
          </div>
        </div>

        {/* Suggestions (insert prompt presets) */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ПРОПОЗИЦІЇ
          </span>
          <SuggestBtn
            icon={TrendingDown}
            text="Зменшити накладні з 9% до 7%"
            color={T.success}
            onClick={() =>
              controller.setRefinePrompt(
                controller.refinePrompt + "\nЗменшити загальні накладні витрати з 9% до 7%."
              )
            }
          />
          <SuggestBtn
            icon={Layers}
            text="Додати риштування у конструктивну секцію"
            color={T.accentPrimary}
            onClick={() =>
              controller.setRefinePrompt(
                controller.refinePrompt + "\nДодати окрему позицію риштування у секцію конструктивних робіт."
              )
            }
          />
          <SuggestBtn
            icon={Globe}
            text="Перерахувати інженерні за свіжими тендерами Prozorro"
            color={T.accentSecondary}
            onClick={() =>
              controller.setRefinePrompt(
                controller.refinePrompt + "\nПерерахувати ціни інженерних систем за свіжими тендерами Prozorro."
              )
            }
          />
        </div>

        {controller.error && (
          <div
            className="rounded-xl px-3 py-2.5 text-xs"
            style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
          >
            {controller.error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex flex-col gap-2.5 border-t px-7 pt-5 pb-7"
        style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
      >
        <button
          onClick={controller.refine}
          disabled={controller.refining || !controller.refinePrompt.trim()}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {controller.refining ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {controller.refining ? "Уточнюємо…" : "Уточнити кошторис"}
        </button>
        <button
          onClick={controller.closeRefine}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold"
          style={{
            backgroundColor: T.panel,
            color: T.textSecondary,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          <Eye size={14} /> Скасувати
        </button>
      </div>
    </div>
  );
}

function ModelCard({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-1 rounded-xl p-3.5 text-left"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : T.panelElevated,
        border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          {label}
        </span>
        {active && <Check size={14} style={{ color: T.accentPrimary }} />}
      </div>
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        {hint}
      </span>
    </button>
  );
}

function SuggestBtn({
  icon: Icon,
  text,
  color,
  onClick,
}: {
  icon: any;
  text: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <Icon size={14} style={{ color }} />
      <span className="text-xs" style={{ color: T.textSecondary }}>
        {text}
      </span>
    </button>
  );
}
