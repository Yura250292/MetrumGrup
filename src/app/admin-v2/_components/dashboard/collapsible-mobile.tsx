"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Collapsible section — compact header that expands on click.
 * Works on both mobile and desktop.
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
  /** Compact preview shown when collapsed */
  preview?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = accent ?? T.textPrimary;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 rounded-xl p-3 sm:p-4 transition active:scale-[0.995] tap-highlight-none hover:brightness-[0.97]"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        {icon && (
          <span
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ backgroundColor: color + "14", color }}
          >
            {icon}
          </span>
        )}
        <div className="flex-1 text-left min-w-0">
          <span className="text-[13px] sm:text-[14px] font-bold block" style={{ color: T.textPrimary }}>
            {title}
          </span>
          {!open && preview && (
            <span className="text-[11px] sm:text-[12px] block truncate" style={{ color: T.textMuted }}>
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
      {open && <div className="mt-2 sm:mt-3">{children}</div>}
    </div>
  );
}
