"use client";

import {
  Plus,
  X,
  CloudUpload,
  FolderOpen,
  FileText,
  Check,
  Loader,
  Sparkles,
  Info,
} from "lucide-react";
import { T } from "./tokens";
import { FileTile } from "./primitives";

export function SupplementPanel() {
  return (
    <div
      className="flex h-[1024px] w-[680px] flex-shrink-0 flex-col"
      style={{ backgroundColor: T.panel, borderLeft: `1px solid ${T.borderStrong}` }}
    >
      {/* Header */}
      <header
        className="flex items-start justify-between gap-4 border-b px-8 pt-7 pb-5"
        style={{ borderColor: T.borderSoft }}
      >
        <div className="flex flex-col gap-1.5">
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            <Plus size={12} /> ДОПОВНИТИ КОШТОРИС
          </span>
          <h2 className="text-[22px] font-bold" style={{ color: T.textPrimary }}>
            Додати документи та перегенерувати
          </h2>
          <p className="text-xs leading-relaxed max-w-[540px]" style={{ color: T.textSecondary }}>
            Завантажте нові креслення, специфікації або зміни. AI зіллє їх у наявний кошторис без втрати ваших правок.
          </p>
        </div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.panelElevated }}
        >
          <X size={16} style={{ color: T.textSecondary }} />
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-5 px-8 py-6">
        {/* Dropzone */}
        <div
          className="flex items-center gap-4.5 rounded-2xl p-6"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px dashed ${T.borderStrong}`,
            gap: 18,
          }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <CloudUpload size={24} style={{ color: T.accentPrimary }} />
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              Перетягніть документи для додавання
            </span>
            <span className="text-xs" style={{ color: T.textMuted }}>
              PDF · креслення · фото · буде злито у кошторис
            </span>
          </div>
          <button
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <FolderOpen size={16} /> Обрати
          </button>
        </div>

        {/* List */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
              Очікують завантаження
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              2 файли · 6.8 МБ
            </span>
          </div>
          <FileTile icon={FileText} name="зміни-04.pdf" meta="2.1 МБ · оновлення цін" />
          <FileTile icon={FileText} name="підвал-перегляд.pdf" meta="4.7 МБ · конструктивні зміни" />
        </div>

        {/* Progress */}
        <div
          className="flex flex-col gap-3.5 rounded-2xl p-5"
          style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
              Прогрес зливання
            </span>
            <span className="text-[11px] font-semibold" style={{ color: T.accentPrimary }}>
              Крок 2 / 4
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: T.panelSoft }}>
            <div className="h-full rounded-full" style={{ width: "50%", backgroundColor: T.accentPrimary }} />
          </div>
          <div className="flex flex-col gap-2">
            <ProgressRow
              icon={
                <div
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
                  style={{ backgroundColor: T.success }}
                >
                  <Check size={12} color="#FFFFFF" />
                </div>
              }
              label="Документи розпарсені · OCR чистий"
              meta="4 с"
              metaColor={T.textMuted}
              labelColor={T.textSecondary}
            />
            <ProgressRow
              icon={
                <div
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
                  style={{ backgroundColor: T.accentPrimary }}
                >
                  <Loader size={12} color="#FFFFFF" />
                </div>
              }
              label="Звірка з поточним кошторисом…"
              meta="~ 12 с"
              metaColor={T.accentPrimary}
              labelColor={T.textPrimary}
              labelWeight="medium"
            />
            <ProgressRow
              icon={
                <div
                  className="h-[18px] w-[18px] rounded-full"
                  style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
                />
              }
              label="Перерахунок змінених позицій"
              meta="—"
              metaColor={T.textMuted}
              labelColor={T.textMuted}
            />
            <ProgressRow
              icon={
                <div
                  className="h-[18px] w-[18px] rounded-full"
                  style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
                />
              }
              label="Верифікація та контроль якості"
              meta="—"
              metaColor={T.textMuted}
              labelColor={T.textMuted}
            />
          </div>
        </div>

        {/* Outcome */}
        <div
          className="flex flex-col gap-3.5 rounded-2xl p-5"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
            Очікуваний результат
          </span>
          <div className="flex gap-3">
            <OutCell label="Секцій змінено" value="4" />
            <OutCell label="Позицій перераховано" value="~ 28" />
            <OutCell label="Зміна суми" value="+ ₴ 64 200" valueColor={T.warning} />
          </div>
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2.5"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <Info size={14} style={{ color: T.accentPrimary }} className="flex-shrink-0 mt-0.5" />
            <span className="text-[11px] font-medium" style={{ color: T.accentPrimary }}>
              Ваші ручні правки секцій 02 і 04 збережені під час злиття
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        className="flex items-center justify-end gap-2.5 border-t px-8 py-5"
        style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
      >
        <button className="rounded-xl px-4 py-3 text-sm font-medium" style={{ color: T.textSecondary }}>
          Скасувати
        </button>
        <button
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Sparkles size={16} /> Запустити злиття
        </button>
      </footer>
    </div>
  );
}

function ProgressRow({
  icon,
  label,
  meta,
  metaColor,
  labelColor,
  labelWeight,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  metaColor: string;
  labelColor: string;
  labelWeight?: "medium";
}) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      {icon}
      <span
        className={`flex-1 text-xs ${labelWeight === "medium" ? "font-medium" : ""}`}
        style={{ color: labelColor }}
      >
        {label}
      </span>
      <span className="text-[11px]" style={{ color: metaColor }}>
        {meta}
      </span>
    </div>
  );
}

function OutCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      className="flex flex-1 flex-col gap-1 rounded-xl p-3.5"
      style={{ backgroundColor: T.panelElevated }}
    >
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-lg font-bold" style={{ color: valueColor ?? T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}
