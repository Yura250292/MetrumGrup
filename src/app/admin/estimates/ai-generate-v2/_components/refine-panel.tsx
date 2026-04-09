"use client";

import { Wand, X, Check, Sparkles, TrendingDown, Layers, Globe, Eye } from "lucide-react";
import { T } from "./tokens";

export function RefinePanel() {
  return (
    <div
      className="flex h-[1024px] w-[520px] flex-shrink-0 flex-col"
      style={{ backgroundColor: T.panel, borderLeft: `1px solid ${T.borderStrong}` }}
    >
      {/* Header */}
      <div
        className="flex flex-col gap-3.5 border-b px-7 pt-7 pb-5"
        style={{ borderColor: T.borderSoft }}
      >
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
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.panelElevated }}
          >
            <X size={16} style={{ color: T.textSecondary }} />
          </button>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: T.textSecondary }}>
          Скажіть AI, що саме змінити. Можна застосувати до всього кошторису або обраних секцій.
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4.5 px-7 py-5" style={{ gap: 18 }}>
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
                ₴ 2 847 500 · 24 секції · 312 позицій
              </span>
            </div>
            <span className="text-[11px] font-semibold" style={{ color: T.accentPrimary }}>
              Змінити обсяг ▾
            </span>
          </div>
        </div>

        {/* Model */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            МОДЕЛЬ
          </span>
          <div className="flex gap-2">
            <div
              className="flex flex-1 flex-col gap-1 rounded-xl p-3.5"
              style={{ backgroundColor: T.accentPrimarySoft, border: `1px solid ${T.accentPrimary}` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  Sonnet 4.6
                </span>
                <Check size={14} style={{ color: T.accentPrimary }} />
              </div>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                Збалансована · за замовч.
              </span>
            </div>
            <div
              className="flex flex-1 flex-col gap-1 rounded-xl p-3.5"
              style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
            >
              <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                Opus 4.6
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                Найвища якість
              </span>
            </div>
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
            <p className="text-[13px] leading-relaxed" style={{ color: T.textPrimary }}>
              Перерахувати секцію покрівлі з використанням готових металевих сендвіч-панелей (50мм) замість мінвати.
              Скоригувати трудовитрати.
            </p>
            <div className="flex items-center justify-between pt-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: T.textMuted }}>
                <Sparkles size={12} style={{ color: T.accentPrimary }} /> AI пояснить свої зміни
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                152 / 600
              </span>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ПРОПОЗИЦІЇ
          </span>
          <Suggestion icon={TrendingDown} text="Зменшити накладні з 9% до 7%" iconColor={T.success} />
          <Suggestion icon={Layers} text="Додати риштування у конструктивну секцію" iconColor={T.accentPrimary} />
          <Suggestion icon={Globe} text="Перерахувати інженерні за свіжими тендерами Prozorro" iconColor={T.accentSecondary} />
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex flex-col gap-2.5 border-t px-7 pt-5 pb-7"
        style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
      >
        <button
          className="flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Sparkles size={16} /> Уточнити кошторис
        </button>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold"
          style={{
            backgroundColor: T.panel,
            color: T.textSecondary,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          <Eye size={14} /> Попередній перегляд змін
        </button>
      </div>
    </div>
  );
}

function Suggestion({ icon: Icon, text, iconColor }: { icon: any; text: string; iconColor: string }) {
  return (
    <div
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <Icon size={14} style={{ color: iconColor }} />
      <span className="text-xs" style={{ color: T.textSecondary }}>
        {text}
      </span>
    </div>
  );
}
