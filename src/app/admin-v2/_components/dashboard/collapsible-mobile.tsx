"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * On mobile (< sm): shows a compact header that expands on tap.
 * On desktop (>= sm): renders children directly, always visible.
 */
export function CollapsibleMobile({
  title,
  icon,
  accent,
  preview,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: ReactNode;
  accent?: string;
  /** Compact preview shown when collapsed (mobile only) */
  preview?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = accent ?? T.textPrimary;

  return (
    <>
      {/* Mobile: collapsible */}
      <div className="sm:hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 rounded-xl p-3 transition active:scale-[0.99] tap-highlight-none"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {icon && (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: color + "14", color }}
            >
              {icon}
            </span>
          )}
          <div className="flex-1 text-left min-w-0">
            <span className="text-[13px] font-bold block" style={{ color: T.textPrimary }}>
              {title}
            </span>
            {!open && preview && (
              <span className="text-[11px] block truncate" style={{ color: T.textMuted }}>
                {preview}
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            className="flex-shrink-0 transition-transform duration-200"
            style={{
              color: T.textMuted,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
        {open && <div className="mt-2">{children}</div>}
      </div>

      {/* Desktop: always visible */}
      <div className="hidden sm:block">{children}</div>
    </>
  );
}
