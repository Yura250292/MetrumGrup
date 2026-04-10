"use client";

import { Save, X, Folder, ChevronDown, Check } from "lucide-react";
import { T } from "./tokens";
import { InputField } from "./primitives";

export function SaveDialog() {
  return (
    <div
      className="flex w-[560px] flex-shrink-0 items-center justify-center p-8"
      style={{ backgroundColor: "#070A11" }}
    >
      <div
        className="flex w-full flex-col overflow-hidden rounded-3xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-4 px-7 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Save size={20} style={{ color: T.accentPrimary }} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Зберегти кошторис
              </h2>
              <span className="text-xs" style={{ color: T.textMuted }}>
                Прикріпити до проєкту або зберегти як чернетку
              </span>
            </div>
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.panelElevated }}
          >
            <X size={16} style={{ color: T.textSecondary }} />
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-col gap-4.5 px-7 pt-2 pb-6" style={{ gap: 18 }}>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ПРОЄКТ
            </span>
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderAccent}` }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: T.accentPrimarySoft }}
              >
                <Folder size={16} style={{ color: T.accentPrimary }} />
              </div>
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  Січових Стрільців 18
                </div>
                <div className="text-[11px]" style={{ color: T.textMuted }}>
                  Житлова прибудова · Львів · з берез. 2026
                </div>
              </div>
              <ChevronDown size={16} style={{ color: T.textMuted }} />
            </div>
          </div>

          <InputField label="Назва кошторису" value="Початковий AI кошторис · v1" />

          <div
            className="flex flex-col gap-3 rounded-xl p-4.5 p-[18px]"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
          >
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ВИ ЗБЕРІГАЄТЕ
            </span>
            <Row label="Загальна сума" value="₴ 2 847 500" valueWeight="bold" />
            <Row label="Секцій / позицій" value="24 / 312" />
            <Row label="Бал верифікації" value="94 / 100" valueColor={T.success} />
          </div>
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-end gap-2.5 border-t px-7 py-4.5 py-[18px]"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
        >
          <button
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            Скасувати
          </button>
          <button
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Check size={16} /> Зберегти у проєкт
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
  valueWeight = "semibold",
}: {
  label: string;
  value: string;
  valueColor?: string;
  valueWeight?: "semibold" | "bold";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span
        className={`text-[13px] ${valueWeight === "bold" ? "font-bold" : "font-semibold"}`}
        style={{ color: valueColor ?? T.textPrimary }}
      >
        {value}
      </span>
    </div>
  );
}
