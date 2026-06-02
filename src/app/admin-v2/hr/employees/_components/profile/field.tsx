"use client";
/** Презентаційні примітиви картки профілю — строго за макетом. */
import React from "react";
import { P } from "./profile-tokens";

const INPUT_CLASS =
  "rounded-[5px] border-[0.5px] bg-white px-[7px] py-[3px] text-[13px] outline-none transition-shadow focus:border-[#185FA5] focus:shadow-[0_0_0_2px_#E6F1FB]";

/** Заголовок секції — 11px uppercase, letter-spacing 0.06em. */
export function SectionTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="mb-2 text-[11px] font-medium uppercase"
      style={{ letterSpacing: "0.06em", color: P.text2, ...style }}
    >
      {children}
    </div>
  );
}

/** Горизонтальна лінія-роздільник 0.5px. */
export function Divider() {
  return <div style={{ height: "0.5px", background: P.border, margin: "18px 0" }} />;
}

/**
 * Рядок поля: [мітка 150px] [значення]. Межа знизу 0.5px.
 * Обгортайте групу у <FieldGroup>, щоб останній рядок був без межі.
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-baseline py-[7px]"
      style={{ borderBottom: `0.5px solid ${P.border}` }}
    >
      <span
        className="shrink-0 text-[13px]"
        style={{ width: 150, color: P.label }}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[13px]" style={{ color: P.text, fontWeight: 400 }}>
        {children}
      </span>
    </div>
  );
}

/** Прибирає межу в останнього <Field> усередині. */
export function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="[&>*:last-child]:!border-b-0">{children}</div>;
}

/** Значення з кольором text2 (вторинне) або «—». */
export function muted(v: string | null | undefined) {
  return <span style={{ color: P.text2 }}>{v || "—"}</span>;
}

/** «—» сірим кольором мітки (поле без даних у БД). */
export function Dash() {
  return <span style={{ color: P.label }}>—</span>;
}

/** Pill-badge. */
export function Badge({
  children,
  bg,
  fg,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
}) {
  return (
    <span
      className="inline-block rounded-full text-[12px] font-medium"
      style={{ padding: "2px 9px", background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/** KPI-картка. */
export function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[8px] px-3 py-2.5" style={{ background: P.bg2 }}>
      <div className="text-[11px]" style={{ color: P.text2 }}>
        {label}
      </div>
      <div
        className="mt-[3px] text-[16px] font-medium tabular-nums"
        style={{ color: accent ? P.blue : P.text }}
      >
        {value}
      </div>
    </div>
  );
}

/** Інпут тексту/дати/числа. */
export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  width = 160,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  width?: number | string;
  ariaLabel?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLASS}
      style={{ borderColor: P.border2, color: P.text, fontFamily: P.font, width }}
    />
  );
}

/** Інпут-select. */
export function SelectInput<T extends string>({
  value,
  onChange,
  options,
  width = 160,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: string; label: string }>;
  width?: number | string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as T)}
      className={INPUT_CLASS}
      style={{ borderColor: P.border2, color: P.text, fontFamily: P.font, width }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Текстова кнопка-посилання (дії типу «Скинути пароль»). */
export function LinkAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[13px] hover:underline disabled:opacity-50"
      style={{ color: P.blue, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );
}
