"use client";

import {
  ArrowLeft,
  Wand,
  Plus,
  Save,
  TrendingUp,
  Layers,
  Box,
  House,
  PlugZap,
  ChevronUp,
  ChevronDown,
  Download,
  TriangleAlert,
  Scaling,
} from "lucide-react";
import { T } from "./tokens";
import { BtnGhost, BtnPrimary, MetricPill, ConfidenceBadge, ScoreDial, SectionCard } from "./primitives";

export function ResultDesktop() {
  return (
    <div className="w-[1440px] flex-shrink-0" style={{ backgroundColor: T.background, color: T.textPrimary }}>
      {/* Top bar */}
      <header
        className="flex h-16 items-center justify-between border-b px-8"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-3.5">
          <button
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
          >
            <ArrowLeft size={14} /> Назад
          </button>
          <div className="flex flex-col gap-px">
            <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              Кошторис · 2-поверхова прибудова на вул. Січових Стрільців
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              Згенеровано 2 хв тому · Режим з майстром · 6 агентів
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BtnGhost icon={Wand}>Уточнити</BtnGhost>
          <BtnGhost icon={Plus}>Доповнити</BtnGhost>
          <BtnPrimary icon={Save}>Зберегти кошторис</BtnPrimary>
        </div>
      </header>

      {/* Hero strip */}
      <section className="flex items-center gap-12 px-12 py-9">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold tracking-widest" style={{ color: T.textMuted }}>
            ЗАГАЛЬНИЙ КОШТОРИС
          </span>
          <span className="text-5xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            ₴ 2 847 500
          </span>
          <span className="flex items-center gap-2 text-xs font-medium" style={{ color: T.success }}>
            <TrendingUp size={14} /> +4.2% порівняно зі схожими тендерами Prozorro
          </span>
        </div>
        <div className="h-24 w-px" style={{ backgroundColor: T.borderSoft }} />
        <div className="flex flex-1 items-center gap-4">
          <MetricPill label="Секції" value="24" />
          <MetricPill label="Позиції" value="312" />
          <MetricPill label="Верифікація" value="94 / 100" />
          <MetricPill label="Низька впевн." value="7" />
        </div>
      </section>

      {/* Workspace */}
      <section className="flex items-start gap-8 px-12 pb-14">
        {/* Sections column */}
        <div className="flex flex-1 flex-col gap-4.5" style={{ gap: 18 }}>
          {/* Section 1 expanded */}
          <div
            className="flex flex-col rounded-2xl"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div
              className="flex items-center justify-between gap-4 rounded-t-2xl border-b px-6 py-4"
              style={{ backgroundColor: T.panelElevated, borderColor: T.borderSoft }}
            >
              <div className="flex items-center gap-3.5">
                <SectionIcon icon={Layers} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                    01 · Земляні роботи та фундаменти
                  </span>
                  <span className="text-[11px]" style={{ color: T.textMuted }}>
                    24 позиції · 248 м³ виїмки · бетон C25/30
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ConfidenceBadge value="94% впевненості" />
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-base font-bold" style={{ color: T.textPrimary }}>
                    ₴ 412 800
                  </span>
                  <span className="text-[10px]" style={{ color: T.textMuted }}>
                    проміжний підсумок
                  </span>
                </div>
                <ChevronUp size={18} style={{ color: T.textMuted }} />
              </div>
            </div>

            {/* Items table */}
            <div className="flex flex-col px-3 pt-2 pb-4">
              <div
                className="grid grid-cols-[32px_1fr_80px_80px_120px_140px_120px] items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: T.panelSoft }}
              >
                <Th>#</Th>
                <Th>ПОЗИЦІЯ</Th>
                <Th>ОД.</Th>
                <Th>К-СТЬ</Th>
                <Th>ЦІНА ЗА ОД.</Th>
                <Th>СУМА</Th>
                <Th>ДЖЕРЕЛО / ВПЕВН.</Th>
              </div>
              <Row
                idx="01"
                title="Механізована виїмка ґрунту, II група"
                code="ДСТУ Б Д.2.2-1:2008 · код E1-1"
                unit="м³"
                qty="248"
                price="₴ 320"
                total="₴ 79 360"
                tone="success"
                conf="94% впевненості"
              />
              <Row
                idx="02"
                title="Залізобетонний стрічковий фундамент"
                code="C25/30 · BSt500 · код F2-3"
                unit="м³"
                qty="82"
                price="₴ 4 100"
                total="₴ 336 200"
                tone="warning"
                conf="68% впевненості"
                striped
              />
              <Row
                idx="03"
                title="Зворотна засипка з ущільненням"
                code="Шарами 200мм · Проктор 95% · код E3-2"
                unit="м³"
                qty="160"
                price="₴ 240"
                total="₴ 38 400"
                tone="success"
                conf="94% впевненості"
              />
            </div>
            <div
              className="flex items-center justify-between rounded-b-2xl border-t px-6 py-3.5"
              style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
            >
              <span className="text-xs font-medium" style={{ color: T.textMuted }}>
                + ще 21 позиція в цій секції
              </span>
              <span className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.accentPrimary }}>
                <Download size={14} /> Показати всі позиції
              </span>
            </div>
          </div>

          <CollapsedSection
            icon={Box}
            num="02"
            title="Несучий каркас"
            meta="38 позицій · сталь + бетон"
            badge={<ConfidenceBadge value="91% впевненості" />}
            total="₴ 684 200"
          />
          <CollapsedSection
            icon={House}
            num="03"
            title="Покрівля та утеплення"
            meta="42 позиції · 280 м² площа покрівлі"
            badge={<ConfidenceBadge value="68% потребує перевірки" tone="warning" />}
            total="₴ 412 600"
          />
          <CollapsedSection
            icon={PlugZap}
            num="04"
            title="Інженерні системи"
            meta="56 позицій · електрика · сантехніка · ОВК"
            badge={<ConfidenceBadge value="88% впевненості" />}
            total="₴ 758 100"
          />

          <div
            className="flex items-center justify-center rounded-xl px-6 py-3.5"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px dashed ${T.borderSoft}`,
            }}
          >
            <span className="text-xs font-medium" style={{ color: T.textMuted }}>
              + ще 20 секцій
            </span>
          </div>
        </div>

        {/* Insights sidebar */}
        <aside className="flex w-[380px] flex-col gap-4">
          {/* Summary */}
          <div
            className="flex flex-col gap-4 rounded-2xl p-6"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
          >
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              СТРУКТУРА КОШТОРИСУ
            </span>
            <BreakdownRow label="Матеріали" value="₴ 1 612 400" />
            <BreakdownRow label="Праця" value="₴ 826 200" />
            <BreakdownRow label="Обладнання" value="₴ 184 700" />
            <BreakdownRow label="Накладні 9%" value="₴ 224 200" />
            <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
                Загалом
              </span>
              <span className="text-lg font-bold" style={{ color: T.textPrimary }}>
                ₴ 2 847 500
              </span>
            </div>
            <div className="flex gap-2">
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-white"
                style={{ backgroundColor: T.accentPrimary }}
              >
                <Download size={14} /> Експорт
              </button>
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold"
                style={{ backgroundColor: T.panel, color: T.textSecondary, border: `1px solid ${T.borderStrong}` }}
              >
                <Save size={14} /> Зберегти
              </button>
            </div>
          </div>

          {/* Verification */}
          <SectionCard>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  ВЕРИФІКАЦІЯ
                </span>
                <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                  Інженерна перевірка
                </span>
              </div>
              <ScoreDial value={94} bigLabel="94" label="бал" />
            </div>
            <div
              className="mb-3 flex gap-1 rounded-lg p-1"
              style={{ backgroundColor: T.panelSoft }}
            >
              <Tab active>Огляд</Tab>
              <Tab>Зауваження · 4</Tab>
              <Tab>Покращення</Tab>
            </div>
            <div
              className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
              style={{
                backgroundColor: T.warningSoft,
                borderLeft: `3px solid ${T.warning}`,
              }}
            >
              <TriangleAlert size={14} style={{ color: T.warning }} className="flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <div className="text-xs font-semibold" style={{ color: T.warning }}>
                  Покрівельний обсяг суперечить специфікації v3
                </div>
                <div className="text-[11px]" style={{ color: T.textMuted }}>
                  Секція 03 · 2 позиції
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Low confidence */}
          <SectionCard>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                Позиції низької впевненості
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: T.warningSoft, color: T.warning }}
              >
                7
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <LowConfRow title="Покрівельний утеплювач, мінвата 200мм" meta="03 · Покрівля · 62%" />
              <LowConfRow title="Пароізоляційна мембрана" meta="03 · Покрівля · 58%" />
              <LowConfRow title="Розводка повітропроводів ОВК, AHU" meta="04 · Інженерні · 64%" />
            </div>
          </SectionCard>

          {/* Scaling */}
          <div
            className="flex items-start gap-3 rounded-2xl p-4"
            style={{ backgroundColor: T.accentPrimarySoft, border: `1px solid ${T.accentPrimary}` }}
          >
            <Scaling size={18} style={{ color: T.accentPrimary }} className="flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold" style={{ color: T.accentPrimary }}>
                Кошторис автомасштабовано до 320 м²
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: T.textSecondary }}>
                Початкова чернетка AI була для ~280 м². Обсяги пропорційно скориговано.
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

/* ---- helpers ---- */

function SectionIcon({ icon: Icon }: { icon: any }) {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-lg"
      style={{ backgroundColor: T.accentPrimarySoft }}
    >
      <Icon size={18} style={{ color: T.accentPrimary }} />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
      {children}
    </span>
  );
}

function Row({
  idx,
  title,
  code,
  unit,
  qty,
  price,
  total,
  conf,
  tone,
  striped = false,
}: {
  idx: string;
  title: string;
  code: string;
  unit: string;
  qty: string;
  price: string;
  total: string;
  conf: string;
  tone: "success" | "warning";
  striped?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[32px_1fr_80px_80px_120px_140px_120px] items-center gap-3 border-b px-3 py-3.5"
      style={{
        backgroundColor: striped ? T.panelSoft : "transparent",
        borderColor: T.borderSoft,
      }}
    >
      <span className="text-xs font-medium" style={{ color: T.textMuted }}>
        {idx}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium" style={{ color: T.textPrimary }}>
          {title}
        </span>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          {code}
        </span>
      </div>
      <span className="text-xs" style={{ color: T.textSecondary }}>
        {unit}
      </span>
      <span className="text-xs font-medium" style={{ color: T.textSecondary }}>
        {qty}
      </span>
      <span className="text-xs font-medium" style={{ color: T.textSecondary }}>
        {price}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
        {total}
      </span>
      <ConfidenceBadge value={conf} tone={tone} />
    </div>
  );
}

function CollapsedSection({
  icon: Icon,
  num,
  title,
  meta,
  badge,
  total,
}: {
  icon: any;
  num: string;
  title: string;
  meta: string;
  badge: React.ReactNode;
  total: string;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-2xl px-6 py-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center gap-3.5">
        <SectionIcon icon={Icon} />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            {num} · {title}
          </span>
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {meta}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        {badge}
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-base font-bold" style={{ color: T.textPrimary }}>
            {total}
          </span>
          <span className="text-[10px]" style={{ color: T.textMuted }}>
            проміжний підсумок
          </span>
        </div>
        <ChevronDown size={18} style={{ color: T.textMuted }} />
      </div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function Tab({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      className="flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-[11px] font-semibold"
      style={{
        backgroundColor: active ? T.panelElevated : "transparent",
        color: active ? T.textPrimary : T.textMuted,
      }}
    >
      {children}
    </div>
  );
}

function LowConfRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: T.panelSoft, borderLeft: `3px solid ${T.warning}` }}
    >
      <span className="text-xs font-medium" style={{ color: T.textPrimary }}>
        {title}
      </span>
      <span className="text-[10px]" style={{ color: T.textMuted }}>
        {meta}
      </span>
    </div>
  );
}
