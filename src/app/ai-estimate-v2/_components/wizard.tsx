"use client";

import { Check, Sparkles, ArrowLeft, ArrowRight, X } from "lucide-react";
import { T } from "./tokens";
import { InputField } from "./primitives";

export function WizardFullscreen() {
  return (
    <div
      className="flex h-[1024px] w-[1440px] flex-shrink-0 items-center justify-center p-12"
      style={{ backgroundColor: "#070A11" }}
    >
      <div
        className="flex h-full w-full overflow-hidden rounded-3xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        {/* Progress rail */}
        <aside
          className="flex w-[280px] flex-col gap-6 border-r p-8"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
              ГУЇДЕД ІНТЕЛЕКТ
            </span>
            <span className="text-[22px] font-bold" style={{ color: T.textPrimary }}>
              Майстер проєкту
            </span>
            <span className="text-xs leading-relaxed" style={{ color: T.textMuted }}>
              5 кроків · ~2 хв · підвищує точність на ~30%
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Step n={1} title="Тип і масштаб проєкту" meta="Готово · 4 поля" state="done" />
            <Step n={2} title="Геометрія та площі" meta="Готово · 320 м²" state="done" />
            <Step n={3} title="Матеріали та оздоблення" meta="В процесі" state="active" />
            <Step n={4} title="Конструктивні рішення" meta="Очікує" state="pending" />
            <Step n={5} title="Обмеження та ризики" meta="Очікує" state="pending" />
          </div>
        </aside>

        {/* Center */}
        <section className="flex flex-1 flex-col gap-7 p-12">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
              КРОК 3 З 5
            </span>
            <h2 className="text-3xl font-bold" style={{ color: T.textPrimary }}>
              Матеріали та оздоблення
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: T.textSecondary }}>
              Розкажіть про конструкційні матеріали, оздоблення та обрані продукти. Чим більше ми знаємо, тим
              точнішим буде кошторис AI.
            </p>
          </div>
          <div className="flex flex-col gap-4.5" style={{ gap: 18 }}>
            <div className="flex gap-3.5">
              <InputField label="Основна конструкція" value="Залізобетон" className="flex-1" />
              <InputField label="Фасадна система" value="Вентильована, кераміка" className="flex-1" />
            </div>
            <div className="flex gap-3.5">
              <InputField label="Підлогове покриття" value="Інженерний дуб" className="flex-1" />
              <InputField label="Оздоблення стін" value="Штукатурка + фарба" className="flex-1" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
                Нотатки про матеріали
              </span>
              <div
                className="rounded-xl px-4 py-4 text-[13px] leading-relaxed"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              >
                Бетон B25 для плит. Акустична підкладка на верхньому поверсі. Передбачити теплу підлогу у санвузлах.
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto flex items-center justify-between pt-2">
            <button className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium" style={{ color: T.textMuted }}>
              <X size={14} /> Пропустити майстер
            </button>
            <div className="flex items-center gap-2.5">
              <button
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textSecondary,
                  border: `1px solid ${T.borderStrong}`,
                }}
              >
                <ArrowLeft size={14} /> Назад
              </button>
              <button
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-bold text-white"
                style={{ backgroundColor: T.accentPrimary }}
              >
                Продовжити <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* Help */}
        <aside
          className="flex w-[300px] flex-col gap-4.5 border-l p-8"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft, gap: 18 }}
        >
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
            ЧОМУ ЦЕ ВАЖЛИВО
          </span>
          <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>
            Матеріали — ~62% вартості
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: T.textSecondary }}>
            Точне зазначення матеріалів дозволяє AI крос-перевірити коди ДСТУ, актуальні тендери Prozorro та вашу
            RAG-памʼять.
          </p>
          <div
            className="flex flex-col gap-2 rounded-xl p-3.5"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <p className="text-[11px] leading-relaxed" style={{ color: T.textSecondary }}>
              «Без даних із майстра AI використовував регіональні середні — це призвело до завищення на ~14% у
              недавньому ритейл-обʼєкті.»
            </p>
            <p className="text-[10px] font-semibold" style={{ color: T.textMuted }}>
              — Інженерна команда
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  meta,
  state,
}: {
  n: number;
  title: string;
  meta: string;
  state: "done" | "active" | "pending";
}) {
  const isActive = state === "active";
  const isDone = state === "done";

  let dotBg: string = T.panelElevated;
  let dotBorder: string = T.borderStrong;
  let dotContent: React.ReactNode = <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 700 }}>{n}</span>;

  if (isDone) {
    dotBg = T.success;
    dotBorder = T.success;
    dotContent = <Check size={14} color="#FFFFFF" />;
  } else if (isActive) {
    dotBg = T.accentPrimary;
    dotBorder = T.accentPrimary;
    dotContent = <span style={{ color: "#FFFFFF", fontSize: 11, fontWeight: 700 }}>{n}</span>;
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-3"
      style={{
        backgroundColor: isActive ? T.accentPrimarySoft : "transparent",
        border: isActive ? `1px solid ${T.accentPrimary}` : "1px solid transparent",
      }}
    >
      <div
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: dotBg, border: `1px solid ${dotBorder}` }}
      >
        {dotContent}
      </div>
      <div className="flex flex-col gap-0.5">
        <span
          className="text-xs font-semibold"
          style={{ color: state === "pending" ? T.textSecondary : T.textPrimary }}
        >
          {title}
        </span>
        <span className="text-[10px]" style={{ color: isActive ? T.accentPrimary : T.textMuted }}>
          {meta}
        </span>
      </div>
    </div>
  );
}
