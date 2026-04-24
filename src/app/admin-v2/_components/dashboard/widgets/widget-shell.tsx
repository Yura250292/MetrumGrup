"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type WidgetShellProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone?: "accent" | "danger" | "success" | "warning" };
  action?: { href: string; label: string } | { onClick: () => void; label: string };
  /** Tint the top-left accent bar. Defaults to T.accentPrimary. */
  accent?: string;
  children: ReactNode;
};

export function WidgetShell({
  icon,
  title,
  subtitle,
  badge,
  action,
  accent = T.accentPrimary,
  children,
}: WidgetShellProps) {
  const badgeColor =
    badge?.tone === "danger"
      ? T.danger
      : badge?.tone === "success"
        ? T.success
        : badge?.tone === "warning"
          ? T.warning
          : accent;

  return (
    <div
      className="group/widget relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-200"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        boxShadow:
          "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.02)",
      }}
    >
      {/* Subtle top accent bar */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-60"
        style={{
          background: `linear-gradient(90deg, ${accent}, ${accent}00 85%)`,
        }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover/widget:scale-[1.04]"
              style={{
                backgroundColor: accent + "14",
                color: accent,
                border: `1px solid ${accent}22`,
              }}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3
                className="truncate text-[13px] font-semibold leading-tight tracking-[-0.01em]"
                style={{ color: T.textPrimary }}
              >
                {title}
              </h3>
              {badge && (
                <span
                  className="inline-flex h-[18px] items-center rounded-full px-1.5 text-[10px] font-bold leading-none tabular-nums"
                  style={{
                    backgroundColor: badgeColor + "18",
                    color: badgeColor,
                  }}
                >
                  {badge.label}
                </span>
              )}
            </div>
            {subtitle && (
              <p
                className="mt-0.5 truncate text-[11px]"
                style={{ color: T.textMuted }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action &&
          ("href" in action ? (
            <Link
              href={action.href}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors duration-150 hover:bg-[color:var(--t-panel-el)]"
              style={{ color: accent }}
            >
              {action.label}
              <ArrowRight size={11} className="transition-transform group-hover/widget:translate-x-0.5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors duration-150 hover:bg-[color:var(--t-panel-el)]"
              style={{ color: accent }}
            >
              {action.label}
              <ArrowRight size={11} className="transition-transform group-hover/widget:translate-x-0.5" />
            </button>
          ))}
      </div>

      {/* Divider */}
      <span
        aria-hidden
        className="mx-4 block h-px"
        style={{ backgroundColor: T.borderSoft, opacity: 0.6 }}
      />

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-3">{children}</div>
    </div>
  );
}
