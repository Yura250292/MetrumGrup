"use client";

import { FileSearch, Download, X, TriangleAlert, Info, CircleCheck, ShieldCheck, Plus, Sparkles } from "lucide-react";
import { T } from "./tokens";

export function PreAnalysisModal() {
  return (
    <div
      className="flex h-[1024px] w-[1100px] flex-shrink-0 items-center justify-center p-12"
      style={{ backgroundColor: "#070A11" }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-3xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between gap-4 border-b px-8 py-6"
          style={{ backgroundColor: T.panelElevated, borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <FileSearch size={22} style={{ color: T.accentPrimary }} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Звіт пре-аналізу
              </h2>
              <span className="text-xs" style={{ color: T.textMuted }}>
                3 документи · 132 сторінки · проскановано за 18 с
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
              style={{ color: T.textSecondary }}
            >
              <Download size={16} /> Завантажити PDF
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
            >
              <X size={16} style={{ color: T.textSecondary }} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-6 p-8">
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="ДОКУМЕНТИ" value="3 / 3 розпарсено" hint="Усі метадані витягнуто" hintColor={T.success} />
            <SummaryCard label="ПОВНОТА" value="82%" hint="Деякі параметри обсягу відсутні" hintColor={T.warning} />
            <SummaryCard label="СУПЕРЕЧНОСТІ" value="Знайдено 2" hint="Покрівля: специф. vs план" hintColor={T.danger} />
            <SummaryCard label="AI-ГОТОВНІСТЬ" value="Висока" valueColor={T.success} hint="Безпечно генерувати" hintColor={T.success} />
          </div>

          <div className="flex flex-col gap-3.5">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Структуровані висновки
            </h3>
            <Finding
              tone="danger"
              icon={TriangleAlert}
              title="Ухил даху суперечить специфікації"
              source="специфікації-v3.pdf · с. 12"
              text="Креслення показує покрівлю з ухилом 18°, специфікація вказує плоску мембрану. Позначено для інженерної перевірки до генерації."
            />
            <Finding
              tone="warning"
              icon={Info}
              title="Обсяг інженерних систем визначений частково"
              source="специфікації-v3.pdf · с. 28"
              text="Розводка повітропроводів ОВК і розташування AHU не вказані. AI використає типові патерни з RAG-памʼяті."
            />
            <Finding
              tone="success"
              icon={CircleCheck}
              title="Конструктивний розділ задокументовано добре"
              source="плани-2-поверх.pdf"
              text="Усі конструктивні деталі, навантаження та марки матеріалів захоплено. Готово до високоточного оцінювання."
            />
          </div>
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-between gap-4 border-t px-8 py-5"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} style={{ color: T.success }} />
            <span className="text-xs font-medium" style={{ color: T.textSecondary }}>
              Пре-аналіз завершено · безпечно генерувати з поточним обсягом
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
              style={{ color: T.textSecondary }}
            >
              <Plus size={16} /> Додати документи
            </button>
            <button
              className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Sparkles size={16} /> Перейти до генерації
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  hintColor,
  valueColor,
}: {
  label: string;
  value: string;
  hint: string;
  hintColor: string;
  valueColor?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl p-4.5 p-[18px]"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-lg font-bold" style={{ color: valueColor ?? T.textPrimary }}>
        {value}
      </span>
      <span className="text-[11px]" style={{ color: hintColor }}>
        {hint}
      </span>
    </div>
  );
}

function Finding({
  tone,
  icon: Icon,
  title,
  source,
  text,
}: {
  tone: "danger" | "warning" | "success";
  icon: any;
  title: string;
  source: string;
  text: string;
}) {
  const color = tone === "danger" ? T.danger : tone === "warning" ? T.warning : T.success;
  return (
    <div
      className="flex items-start gap-3.5 rounded-xl p-[18px]"
      style={{ backgroundColor: T.panelElevated, borderLeft: `3px solid ${color}` }}
    >
      <Icon size={18} style={{ color }} className="flex-shrink-0 mt-0.5" />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
            {title}
          </span>
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {source}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: T.textSecondary }}>
          {text}
        </p>
      </div>
    </div>
  );
}
