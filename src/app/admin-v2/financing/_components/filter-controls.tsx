"use client";

import { ChevronDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const baseField =
  "w-full rounded-xl px-3 py-2.5 text-[13px] outline-none transition focus:ring-2 focus:ring-offset-0";

export function FilterSelect({
  value,
  onChange,
  children,
  icon,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  placeholder?: string;
}) {
  const active = !!value;
  return (
    <label
      className="relative flex items-center gap-2 rounded-xl px-3 py-2.5 transition cursor-pointer hover:brightness-[0.98]"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : T.panelSoft,
        border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
        color: active ? T.accentPrimary : T.textPrimary,
      }}
    >
      {icon && (
        <span className="flex-shrink-0" style={{ color: active ? T.accentPrimary : T.textMuted }}>
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent w-full pr-5 text-[13px] outline-none cursor-pointer"
        style={{ color: "inherit" }}
        aria-label={placeholder}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: active ? T.accentPrimary : T.textMuted }}
      />
    </label>
  );
}

export function FilterInput({
  value,
  onChange,
  type = "text",
  placeholder,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  const active = !!value;
  return (
    <label
      className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : T.panelSoft,
        border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
        color: active ? T.accentPrimary : T.textPrimary,
      }}
    >
      {icon && (
        <span className="flex-shrink-0" style={{ color: active ? T.accentPrimary : T.textMuted }}>
          {icon}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent w-full text-[13px] outline-none placeholder:opacity-60"
        style={{ color: "inherit", colorScheme: "dark" }}
      />
    </label>
  );
}

export type SegmentedOption<V extends string = string> = {
  value: V;
  label: string;
  /** Shorter label shown on narrow (<sm) screens. Falls back to `label`. */
  shortLabel?: string;
  icon?: React.ReactNode;
  /** Custom accent color when this option is active. */
  color?: string;
};

export function SegmentedControl<V extends string = string>({
  value,
  onChange,
  options,
  allowDeselect = true,
  ariaLabel,
  size = "md",
}: {
  value: V | "";
  onChange: (v: V | "") => void;
  options: SegmentedOption<V>[];
  allowDeselect?: boolean;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  // Bump vertical padding on coarse-pointer devices to satisfy 44px touch targets.
  const padY = size === "sm" ? "py-2 sm:py-1.5" : "py-2.5 sm:py-2";
  const padX = size === "sm" ? "px-3 sm:px-2.5" : "px-3.5 sm:px-3";
  const fontSize = size === "sm" ? "text-[11.5px]" : "text-[12.5px]";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-stretch rounded-xl p-0.5 gap-0.5 w-full sm:w-auto"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const accent = opt.color ?? T.accentPrimary;
        const short = opt.shortLabel ?? opt.label;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active && allowDeselect ? "" : opt.value)}
            title={opt.label}
            className={`flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg ${padX} ${padY} ${fontSize} font-semibold transition`}
            style={{
              backgroundColor: active ? accent : "transparent",
              color: active ? "#fff" : T.textSecondary,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
            }}
          >
            {opt.icon}
            <span className="truncate block sm:hidden">{short}</span>
            <span className="truncate hidden sm:block">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
