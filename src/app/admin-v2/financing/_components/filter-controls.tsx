"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    >
      {children}
    </select>
  );
}

export function FilterInput({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
        colorScheme: "dark",
      }}
    />
  );
}
