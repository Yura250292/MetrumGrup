"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { T } from "./tokens";

/* ============================================================
   Buttons
   ============================================================ */

type BtnProps = {
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
};

export function BtnPrimary({ children, icon: Icon, onClick, className = "" }: BtnProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95 ${className}`}
      style={{ backgroundColor: T.accentPrimary }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function BtnSecondary({ children, icon: Icon, onClick, className = "" }: BtnProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition hover:brightness-95 ${className}`}
      style={{
        backgroundColor: T.panelElevated,
        color: T.textPrimary,
        border: `1px solid ${T.borderStrong}`,
      }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function BtnGhost({ children, icon: Icon, onClick, className = "" }: BtnProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition hover:bg-black/5 ${className}`}
      style={{ color: T.textSecondary }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function BtnIconOnly({ icon: Icon, onClick }: { icon: LucideIcon; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:brightness-95"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${T.borderStrong}`,
      }}
    >
      <Icon size={18} style={{ color: T.textSecondary }} />
    </button>
  );
}

/* ============================================================
   Badges & pills
   ============================================================ */

export function ConfidenceBadge({ value, tone = "success" }: { value: string; tone?: "success" | "warning" }) {
  const fg = tone === "success" ? T.success : T.warning;
  const bg = tone === "success" ? T.successSoft : T.warningSoft;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: fg, border: `1px solid ${fg}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: fg }} />
      {value}
    </span>
  );
}

export function SourceBadge({
  icon: Icon,
  label,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  tone?: "primary" | "secondary";
}) {
  const fg = tone === "primary" ? T.accentPrimary : T.accentSecondary;
  const bg = tone === "primary" ? T.accentPrimarySoft : T.panelElevated;
  const border = tone === "primary" ? "transparent" : T.borderStrong;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: tone === "primary" ? fg : T.textPrimary, border: `1px solid ${border}` }}
    >
      <Icon size={12} style={{ color: fg }} />
      {label}
    </span>
  );
}

export function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex w-[140px] flex-col gap-1 rounded-xl p-3.5"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-2xl font-bold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   Inputs
   ============================================================ */

export function InputField({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </span>
      <div
        className="flex items-center gap-2 rounded-xl px-3.5 py-3"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
      >
        {Icon && <Icon size={16} style={{ color: T.textMuted }} />}
        <span className="text-sm" style={{ color: T.textPrimary }}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </span>
      <div
        className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-3"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderAccent}` }}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} style={{ color: T.accentPrimary }} />}
          <span className="text-sm font-medium" style={{ color: T.textPrimary }}>
            {value}
          </span>
        </div>
        <span style={{ color: T.textMuted }}>▾</span>
      </div>
    </div>
  );
}

/* ============================================================
   Composite
   ============================================================ */

export function FileTile({
  icon: Icon,
  name,
  meta,
}: {
  icon: LucideIcon;
  name: string;
  meta: string;
}) {
  return (
    <div
      className="flex w-full items-center gap-3 rounded-xl p-3.5"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <Icon size={20} style={{ color: T.accentPrimary }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold" style={{ color: T.textPrimary }}>
          {name}
        </div>
        <div className="text-[11px]" style={{ color: T.textMuted }}>
          {meta}
        </div>
      </div>
      <span style={{ color: T.textMuted }}>×</span>
    </div>
  );
}

export function ChecklistItem({
  icon: Icon,
  title,
  meta,
  state = "done",
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
  state?: "done" | "warning";
}) {
  const bg = state === "done" ? T.success : T.warning;
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: T.panelElevated }}
    >
      <div
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ backgroundColor: bg }}
      >
        <Icon size={12} color="#FFFFFF" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium" style={{ color: T.textPrimary }}>
          {title}
        </div>
        <div className="text-[11px]" style={{ color: T.textMuted }}>
          {meta}
        </div>
      </div>
    </div>
  );
}

export function SourceStatusCard({
  icon: Icon,
  title,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
}) {
  return (
    <div
      className="flex w-full items-center gap-3 rounded-xl p-3.5"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: T.successSoft }}
      >
        <Icon size={20} style={{ color: T.success }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>
          {title}
        </div>
        <div className="text-[11px]" style={{ color: T.success }}>
          {meta}
        </div>
      </div>
      <div
        className="flex h-[18px] w-8 items-center justify-end rounded-full p-0.5"
        style={{ backgroundColor: T.success }}
      >
        <div className="h-3.5 w-3.5 rounded-full bg-white" />
      </div>
    </div>
  );
}

/* ============================================================
   Layout helpers
   ============================================================ */

export function SectionCard({
  children,
  className = "",
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-6 ${className}`}
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${accent ? T.borderAccent : T.borderSoft}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {children}
    </div>
  );
}

export function MicroLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
      {children}
    </span>
  );
}

/* ============================================================
   Donut / score dial (SVG)
   ============================================================ */

export function ScoreDial({
  value,
  size = 64,
  color = T.success,
  label,
  bigLabel,
}: {
  value: number; // 0..100
  size?: number;
  color?: string;
  label?: string;
  bigLabel?: string;
}) {
  const stroke = 8;
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
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {bigLabel && (
          <div className="text-lg font-bold leading-none" style={{ color: T.textPrimary }}>
            {bigLabel}
          </div>
        )}
        {label && (
          <div className="text-[9px]" style={{ color: T.textMuted }}>
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
