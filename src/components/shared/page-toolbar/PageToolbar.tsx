"use client";

import Link from "next/link";
import { type ReactNode, useState, useRef, useEffect } from "react";
import { Search, MoreHorizontal } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type ToolbarAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
};

type Props = {
  title: string;
  subtitle?: string;
  primaryAction?: ToolbarAction;
  secondaryActions?: ToolbarAction[];
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filters?: ReactNode;
  viewMode?: ReactNode;
  rightSlot?: ReactNode;
  sticky?: boolean;
};

export function PageToolbar({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  search,
  filters,
  viewMode,
  rightSlot,
  sticky = false,
}: Props) {
  return (
    <div
      className={sticky ? "sticky top-16 z-20" : undefined}
      style={{
        backgroundColor: T.background,
        borderBottom: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1
            className="text-[22px] md:text-[26px] font-bold tracking-tight truncate"
            style={{ color: T.textPrimary }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] mt-0.5" style={{ color: T.textSecondary }}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {viewMode}
          {rightSlot}
          {secondaryActions && secondaryActions.length > 0 && (
            <OverflowMenu actions={secondaryActions} />
          )}
          {primaryAction && <PrimaryActionButton action={primaryAction} />}
        </div>
      </div>

      {(search || filters) && (
        <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center">
          {search && (
            <div className="relative md:max-w-sm flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2"
                size={16}
                style={{ color: T.textMuted }}
              />
              <input
                type="text"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? "Пошук..."}
                className="w-full rounded-md pl-9 pr-3 py-2 text-[13px] outline-none transition"
                style={{
                  backgroundColor: T.panel,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textPrimary,
                }}
              />
            </div>
          )}
          {filters && <div className="flex items-center gap-2 flex-wrap">{filters}</div>}
        </div>
      )}
    </div>
  );
}

function PrimaryActionButton({ action }: { action: ToolbarAction }) {
  const className =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold transition hover:brightness-110 disabled:opacity-50";
  const style = {
    backgroundColor: T.accentPrimary,
    color: "#FFFFFF",
  };
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  );
  if (action.href && !action.disabled) {
    return (
      <Link href={action.href} className={className} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={className}
      style={style}
    >
      {content}
    </button>
  );
}

function OverflowMenu({ actions }: { actions: ToolbarAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-md p-2 transition hover:brightness-95"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textSecondary,
          border: `1px solid ${T.borderSoft}`,
        }}
        aria-label="Ще дії"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-48 rounded-md py-1 shadow-lg z-50"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {actions.map((a, i) => {
            const content = (
              <>
                {a.icon}
                {a.label}
              </>
            );
            const cls =
              "flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left transition hover:bg-[var(--t-panel-el)] disabled:opacity-50";
            const style = { color: T.textSecondary };
            if (a.href && !a.disabled) {
              return (
                <Link key={i} href={a.href} className={cls} style={style} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  a.onClick?.();
                  setOpen(false);
                }}
                disabled={a.disabled}
                className={cls}
                style={style}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
