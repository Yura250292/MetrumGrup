"use client";

import {
  Layers,
  Sparkles,
  Globe,
  ShieldCheck,
  CloudUpload,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Square,
  TrendingUp,
  ListChecks,
  BadgeCheck,
  ArrowRight,
  Check,
  Timer,
  Database,
  Eye,
  Info,
  Settings2,
  Ellipsis,
  ChevronRight,
} from "lucide-react";
import { T } from "./tokens";
import {
  BtnPrimary,
  BtnSecondary,
  BtnGhost,
  BtnIconOnly,
  MetricPill,
  FileTile,
  ChecklistItem,
  SourceStatusCard,
  InputField,
  SelectField,
  SectionCard,
  ScoreDial,
} from "./primitives";

export function SetupDesktop() {
  return (
    <div className="w-[1440px] flex-shrink-0" style={{ backgroundColor: T.background, color: T.textPrimary }}>
      {/* Top app bar */}
      <header
        className="flex h-16 items-center justify-between border-b px-8"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Layers size={18} color="#FFFFFF" />
          </div>
          <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            Metrum · AI Кошторис
          </span>
          <span className="text-sm" style={{ color: T.textMuted }}>
            / Адмін
          </span>
        </div>
        <div className="flex items-center gap-3">
          <BtnGhost icon={Settings2}>Налаштування</BtnGhost>
          <BtnIconOnly icon={Ellipsis} />
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            ІШ
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex items-start justify-between px-12 pt-10 pb-8">
        <div className="flex max-w-3xl flex-col gap-3.5">
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: T.textMuted }}>Кошториси</span>
            <ChevronRight size={12} style={{ color: T.textMuted }} />
            <span className="font-semibold" style={{ color: T.textSecondary }}>
              AI Генератор
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            AI генератор кошторисів
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: T.textSecondary }}>
            Створюйте, верифікуйте та уточнюйте будівельні кошториси за допомогою інженерних AI-агентів — на основі
            RAG-памʼяті та ринкових даних Prozorro.
          </p>
          <div className="flex items-center gap-2 pt-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              <Sparkles size={12} /> AI + RAG
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ backgroundColor: T.panelElevated, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
            >
              <Globe size={12} style={{ color: T.accentSecondary }} /> Ринок Prozorro
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ backgroundColor: T.panelElevated, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
            >
              <ShieldCheck size={12} style={{ color: T.success }} /> Інженерний контроль
            </span>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <MetricPill label="Сер. секцій" value="24" />
          <MetricPill label="Сер. точність" value="94%" />
          <MetricPill label="Час до чернетки" value="~3 хв" />
        </div>
      </section>

      {/* Workspace */}
      <section className="flex items-start gap-8 px-12 pb-14">
        {/* Main column */}
        <div className="flex flex-1 flex-col gap-5">
          {/* Dropzone */}
          <div
            className="flex flex-col items-center gap-4 rounded-2xl p-8"
            style={{
              backgroundColor: T.panel,
              border: `1px dashed ${T.borderSoft}`,
            }}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <CloudUpload size={30} style={{ color: T.accentPrimary }} />
            </div>
            <div className="text-center text-lg font-semibold" style={{ color: T.textPrimary }}>
              Перетягніть документи проєкту, щоб почати
            </div>
            <div className="text-center text-[13px]" style={{ color: T.textMuted }}>
              PDF, креслення, фото, ВВР, специфікації — до 64 МБ на файл. AI парсить і звіряє кожен документ.
            </div>
            <div className="flex gap-3 pt-2">
              <BtnPrimary icon={FolderOpen}>Обрати файли</BtnPrimary>
              <BtnGhost>Використати приклад</BtnGhost>
            </div>
          </div>

          {/* Files added */}
          <SectionCard>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
                  Документи проєкту
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
                >
                  3 файли · 12.4 МБ
                </span>
              </div>
              <span className="text-xs font-medium" style={{ color: T.accentPrimary }}>
                Групувати за типом ▾
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FileTile icon={FileText} name="плани-2-поверх.pdf" meta="4.2 МБ · креслення" />
              <FileTile icon={FileSpreadsheet} name="специфікації-v3.pdf" meta="3.8 МБ · ВВР" />
              <FileTile icon={ImageIcon} name="фото-обʼєкт.zip" meta="4.4 МБ · 18 фото" />
            </div>
          </SectionCard>

          {/* Wizard promo */}
          <SectionCard accent>
            <div className="flex items-center gap-6">
              <div className="flex flex-1 flex-col gap-2.5">
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
                  style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                >
                  <Sparkles size={12} /> РЕЖИМ З МАЙСТРОМ
                </span>
                <div className="text-lg font-bold" style={{ color: T.textPrimary }}>
                  Запустіть майстер для ~3× кращої точності
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: T.textSecondary }}>
                  5 коротких кроків про геометрію, матеріали, конструктив та оздоблення. Майстер покращує обсяги,
                  кількість позицій і ціни.
                </p>
                <div className="flex items-center gap-4 pt-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: T.textSecondary }}>
                    <TrendingUp size={14} style={{ color: T.success }} /> Кращі обсяги
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: T.textSecondary }}>
                    <ListChecks size={14} style={{ color: T.success }} /> Більше позицій
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: T.textSecondary }}>
                    <BadgeCheck size={14} style={{ color: T.success }} /> Вища впевненість
                  </span>
                </div>
              </div>
              <div className="flex w-[200px] flex-col items-center gap-3">
                <ScoreDial value={60} size={120} color={T.accentPrimary} bigLabel="3 / 5" label="кроків готово" />
                <BtnPrimary icon={ArrowRight}>Продовжити</BtnPrimary>
              </div>
            </div>
          </SectionCard>

          {/* Project parameters */}
          <SectionCard>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
                  Параметри проєкту
                </span>
                <span className="text-xs" style={{ color: T.textMuted }}>
                  Уточніть бриф для AI — площа, обсяг, обмеження
                </span>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
                style={{ backgroundColor: T.warningSoft, color: T.warning }}
              >
                ОПЦІОНАЛЬНО
              </span>
            </div>
            <div className="flex gap-4">
              <InputField label="Площа проєкту" value="320 м²" icon={Square} className="flex-1" />
              <SelectField label="Режим генерації" value="З майстром" icon={Sparkles} className="flex-1" />
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
                Нотатки проєкту
              </span>
              <div
                className="rounded-xl px-4 py-3.5"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
              >
                <p className="text-[13px] leading-relaxed" style={{ color: T.textSecondary }}>
                  Двоповерхова житлова прибудова, монолітна плита, лише внутрішнє оздоблення…
                </p>
                <div className="mt-2 flex gap-1.5">
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                  >
                    Бетон C25/30
                  </span>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
                  >
                    320 м²
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Data sources */}
          <SectionCard>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
                  Джерела даних
                </span>
                <span className="text-xs" style={{ color: T.textMuted }}>
                  Внутрішні документи · RAG памʼять · Ринковий контекст Prozorro
                </span>
              </div>
              <span className="text-xs font-medium" style={{ color: T.accentPrimary }}>
                Розширені ▾
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              <SourceStatusCard icon={FileText} title="Внутрішні документи" meta="3 файли проіндексовано · готово" />
              <SourceStatusCard icon={Database} title="RAG памʼять" meta="Підключено · 8 проєктів-референсів" />
              <SourceStatusCard icon={Globe} title="Ринок Prozorro" meta="Активно · 142 свіжі тендери" />
            </div>
          </SectionCard>
        </div>

        {/* Sidebar */}
        <aside className="flex w-[380px] flex-col gap-4">
          {/* Readiness */}
          <SectionCard>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  ГОТОВНІСТЬ
                </span>
                <span className="text-base font-semibold" style={{ color: T.textPrimary }}>
                  Майже готово до генерації
                </span>
              </div>
              <ScoreDial value={80} size={48} bigLabel="80%" />
            </div>
            <div className="flex flex-col gap-2">
              <ChecklistItem icon={Check} title="Файли завантажено" meta="3 PDF · 12.4 МБ" />
              <ChecklistItem icon={Check} title="Параметри додані" meta="320 м² · 2 чіпи" />
              <ChecklistItem icon={Timer} title="Майстер 3 / 5" meta="Опціонально, але рекомендовано" state="warning" />
              <ChecklistItem icon={Check} title="Джерела даних підключені" meta="Внутрішні · RAG · Prozorro" />
            </div>
          </SectionCard>

          {/* CTA stack */}
          <div
            className="flex flex-col gap-4 rounded-2xl p-6"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderAccent}` }}
          >
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ОЧІКУВАННЯ ВІД ГЕНЕРАЦІЇ
              </span>
              <div className="flex gap-2">
                <ExpectCell label="Режим" value="Майстер" />
                <ExpectCell label="Агенти" value="6 активних" />
                <ExpectCell label="ETA" value="~3 хв" />
              </div>
            </div>
            <button
              className="flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-[15px] font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Sparkles size={18} /> Згенерувати AI кошторис
            </button>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold transition hover:brightness-110"
              style={{ backgroundColor: T.panel, color: T.textSecondary, border: `1px solid ${T.borderStrong}` }}
            >
              <Eye size={16} /> Попередній перегляд
            </button>
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Info size={14} style={{ color: T.accentPrimary }} />
              <span className="text-[11px] font-medium" style={{ color: T.accentPrimary }}>
                Майстер підвищує впевненість на ~30%
              </span>
            </div>
          </div>

          {/* Next steps */}
          <SectionCard>
            <div className="mb-3 text-[13px] font-semibold" style={{ color: T.textPrimary }}>
              Що відбудеться після генерації
            </div>
            <div className="flex flex-col gap-2.5">
              <NextStep n="1" title="Пре-аналіз" meta="Документи парсяться та звіряються" />
              <NextStep n="2" title="Поетапна генерація" meta="Секції створюються паралельно" />
              <NextStep n="3" title="Верифікація" meta="Інженерна перевірка та оцінка впевненості" />
            </div>
          </SectionCard>
        </aside>
      </section>
    </div>
  );
}

function ExpectCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-1 flex-col gap-0.5 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: T.panel }}
    >
      <span className="text-[10px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function NextStep({ n, title, meta }: { n: string; title: string; meta: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="flex h-5.5 w-5.5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary, width: 22, height: 22 }}
      >
        {n}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="text-xs font-semibold" style={{ color: T.textPrimary }}>
          {title}
        </div>
        <div className="text-[11px]" style={{ color: T.textMuted }}>
          {meta}
        </div>
      </div>
    </div>
  );
}
