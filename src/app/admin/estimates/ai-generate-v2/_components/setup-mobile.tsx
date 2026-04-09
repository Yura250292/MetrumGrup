"use client";

import {
  ArrowLeft,
  Settings,
  CloudUpload,
  Sparkles,
  Square,
  Database,
  ChevronRight,
  ChevronDown,
  Check,
  Timer,
  FileText,
} from "lucide-react";
import { T } from "./tokens";
import { FileTile } from "./primitives";

export function SetupMobile() {
  return (
    <div
      className="relative flex h-[1800px] w-[430px] flex-shrink-0 flex-col"
      style={{ backgroundColor: T.background, color: T.textPrimary }}
    >
      {/* Top bar */}
      <header
        className="flex h-14 items-center justify-between border-b px-4"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-2.5">
          <ArrowLeft size={18} style={{ color: T.textPrimary }} />
          <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            AI Кошторис
          </span>
        </div>
        <Settings size={18} style={{ color: T.textSecondary }} />
      </header>

      {/* Hero */}
      <section className="flex flex-col gap-3.5 px-5 py-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          AI генератор кошторисів
        </h1>
        <p className="text-[13px] leading-relaxed" style={{ color: T.textSecondary }}>
          Створюйте будівельні кошториси за допомогою інженерних AI-агентів.
        </p>
        <div className="flex gap-1.5">
          <span className="rounded-full px-2.5 py-1.5 text-[10px] font-bold" style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}>
            AI + RAG
          </span>
          <span className="rounded-full px-2.5 py-1.5 text-[10px] font-bold" style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}>
            Prozorro
          </span>
          <span className="rounded-full px-2.5 py-1.5 text-[10px] font-bold" style={{ backgroundColor: T.panelElevated, color: T.success }}>
            Перевірено
          </span>
        </div>
      </section>

      {/* Content */}
      <div className="flex flex-col gap-3.5 px-4 pb-32">
        {/* Dropzone */}
        <div
          className="flex flex-col items-center gap-2.5 rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px dashed ${T.borderSoft}` }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <CloudUpload size={24} style={{ color: T.accentPrimary }} />
          </div>
          <span className="text-center text-sm font-semibold" style={{ color: T.textPrimary }}>
            Натисніть, щоб додати документи
          </span>
          <span className="text-center text-[11px]" style={{ color: T.textMuted }}>
            PDF · креслення · фото
          </span>
        </div>

        {/* Files */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
              3 файли · 12.4 МБ
            </span>
            <span className="text-[11px] font-semibold" style={{ color: T.accentPrimary }}>
              Керувати
            </span>
          </div>
          <FileTile icon={FileText} name="плани.pdf" meta="4.2 МБ" />
          <FileTile icon={FileText} name="специф-v3.pdf" meta="3.8 МБ" />
        </div>

        {/* Accordion */}
        <div className="flex flex-col gap-2.5">
          <span className="px-1 text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            Налаштування
          </span>
          <AccordionRow
            iconBg={T.accentPrimarySoft}
            icon={<Sparkles size={16} style={{ color: T.accentPrimary }} />}
            title="Майстер · 3 / 5"
            meta="Продовжити налаштування"
            metaColor={T.accentPrimary}
            border={T.borderAccent}
            chevron="right"
          />
          <AccordionRow
            iconBg={T.panelElevated}
            icon={<Square size={16} style={{ color: T.textSecondary }} />}
            title="Параметри проєкту"
            meta="320 м² · 2 чіпи"
            border={T.borderSoft}
          />
          <AccordionRow
            iconBg={T.successSoft}
            icon={<Database size={16} style={{ color: T.success }} />}
            title="Джерела даних"
            meta="3 підключено · готово"
            metaColor={T.success}
            border={T.borderSoft}
          />
        </div>

        {/* Readiness */}
        <div
          className="flex flex-col gap-3 rounded-xl p-4.5 p-[18px]"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Майже готово
            </span>
            <DialMini value={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <RowSmall icon={<Check size={11} color="#FFFFFF" />} bg={T.success} text="Файли завантажені" />
            <RowSmall icon={<Check size={11} color="#FFFFFF" />} bg={T.success} text="Параметри задані" />
            <RowSmall
              icon={<Timer size={11} color="#FFFFFF" />}
              bg={T.warning}
              text="Майстер 3 / 5 — рекомендовано"
              textColor={T.textSecondary}
            />
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="absolute bottom-0 left-0 flex w-full flex-col gap-2.5 border-t px-4 pt-4 pb-7"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <button
          className="flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Sparkles size={16} /> Згенерувати AI кошторис
        </button>
      </div>
    </div>
  );
}

function AccordionRow({
  iconBg,
  icon,
  title,
  meta,
  metaColor,
  border,
  chevron = "down",
}: {
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
  metaColor?: string;
  border: string;
  chevron?: "down" | "right";
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${border}` }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: iconBg }}>
        {icon}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          {title}
        </span>
        <span className="text-[11px]" style={{ color: metaColor ?? T.textMuted }}>
          {meta}
        </span>
      </div>
      {chevron === "right" ? (
        <ChevronRight size={16} style={{ color: T.textMuted }} />
      ) : (
        <ChevronDown size={16} style={{ color: T.textMuted }} />
      )}
    </div>
  );
}

function DialMini({ value }: { value: number }) {
  const size = 36;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={T.panelElevated} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={T.success}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-bold" style={{ color: T.textPrimary }}>
          {value}%
        </span>
      </div>
    </div>
  );
}

function RowSmall({
  icon,
  bg,
  text,
  textColor,
}: {
  icon: React.ReactNode;
  bg: string;
  text: string;
  textColor?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
        {icon}
      </div>
      <span className="text-xs" style={{ color: textColor ?? T.textPrimary }}>
        {text}
      </span>
    </div>
  );
}
