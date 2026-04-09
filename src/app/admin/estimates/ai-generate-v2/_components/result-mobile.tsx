"use client";

import {
  ArrowLeft,
  Ellipsis,
  TrendingUp,
  Wand,
  Plus,
  Save,
  Layers,
  Box,
  House,
  PlugZap,
  ChevronDown,
  Download,
} from "lucide-react";
import { T } from "./tokens";

export function ResultMobile() {
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
            Результат
          </span>
        </div>
        <Ellipsis size={18} style={{ color: T.textSecondary }} />
      </header>

      {/* Total */}
      <section className="flex flex-col gap-2.5 px-5 py-6">
        <span className="text-[10px] font-bold tracking-widest" style={{ color: T.textMuted }}>
          ЗАГАЛЬНИЙ КОШТОРИС
        </span>
        <span className="text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          ₴ 2 847 500
        </span>
        <div className="flex items-center gap-1.5">
          <TrendingUp size={12} style={{ color: T.success }} />
          <span className="text-[11px] font-medium" style={{ color: T.success }}>
            +4.2% порівняно з тендерами Prozorro
          </span>
        </div>
        <div className="flex gap-2 pt-1.5">
          <KpiCell label="Секції" value="24" />
          <KpiCell label="Позиції" value="312" />
          <KpiCell label="Верифік." value="94" valueColor={T.success} />
        </div>
      </section>

      {/* Actions */}
      <section className="flex gap-2 px-5 pb-4">
        <ActionBtn icon={Wand} label="Уточнити" />
        <ActionBtn icon={Plus} label="Додати" />
        <ActionBtn icon={Save} label="Зберегти" primary />
      </section>

      {/* Sections */}
      <div className="flex flex-col gap-2.5 px-4 pt-2 pb-64">
        <SectionRow icon={Layers} num="01" title="Земляні роботи" meta="24 позиції · ₴ 412 800" />
        <SectionRow icon={Box} num="02" title="Несучий каркас" meta="38 позицій · ₴ 684 200" />
        <SectionRow
          icon={House}
          num="03"
          title="Покрівля"
          metaParts={[
            { text: "42 позиції · ₴ 412 600 ·", color: T.textMuted },
            { text: "68% перевірки", color: T.warning, weight: "semibold" },
          ]}
        />
        <SectionRow icon={PlugZap} num="04" title="Інженерні системи" meta="56 позицій · ₴ 758 100" />
        <div
          className="flex items-center justify-center rounded-xl px-4 py-3.5"
          style={{ backgroundColor: T.panelSoft, border: `1px dashed ${T.borderSoft}` }}
        >
          <span className="text-xs font-medium" style={{ color: T.textMuted }}>
            + ще 20 секцій
          </span>
        </div>
      </div>

      {/* Bottom sheet */}
      <div
        className="absolute bottom-0 left-0 flex w-full flex-col gap-3.5 px-5 pt-7 pb-7"
        style={{
          backgroundColor: T.panel,
          borderTop: `1px solid ${T.borderStrong}`,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
      >
        <div
          className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: T.borderStrong }}
        />
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Підсумок
          </span>
          <span className="text-xs font-bold" style={{ color: T.success }}>
            94 / 100
          </span>
        </div>
        <BR label="Матеріали" value="₴ 1 612 400" />
        <BR label="Праця" value="₴ 826 200" />
        <BR label="Накладні" value="₴ 224 200" />
        <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Загалом
          </span>
          <span className="text-lg font-bold" style={{ color: T.textPrimary }}>
            ₴ 2 847 500
          </span>
        </div>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[13px] font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Download size={14} /> Експортувати кошторис
        </button>
      </div>
    </div>
  );
}

function KpiCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      className="flex flex-1 flex-col gap-0.5 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: T.panelElevated }}
    >
      <span className="text-[9px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-sm font-bold" style={{ color: valueColor ?? T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  primary = false,
}: {
  icon: any;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold"
      style={{
        backgroundColor: primary ? T.accentPrimary : T.panelElevated,
        color: primary ? "#FFFFFF" : T.textSecondary,
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function SectionRow({
  icon: Icon,
  num,
  title,
  meta,
  metaParts,
}: {
  icon: any;
  num: string;
  title: string;
  meta?: string;
  metaParts?: { text: string; color: string; weight?: "semibold" }[];
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <Icon size={16} style={{ color: T.accentPrimary }} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          {num} · {title}
        </span>
        {meta && (
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {meta}
          </span>
        )}
        {metaParts && (
          <div className="flex items-center gap-1.5">
            {metaParts.map((part, i) => (
              <span
                key={i}
                className={`text-[11px] ${part.weight === "semibold" ? "font-semibold" : ""}`}
                style={{ color: part.color }}
              >
                {part.text}
              </span>
            ))}
          </div>
        )}
      </div>
      <ChevronDown size={16} style={{ color: T.textMuted }} />
    </div>
  );
}

function BR({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span className="text-xs font-semibold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}
