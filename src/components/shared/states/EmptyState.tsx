"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: Action;
  secondaryAction?: Action;
  size?: "sm" | "md";
};

export function EmptyState({ icon, title, description, action, secondaryAction, size = "md" }: Props) {
  const pad = size === "sm" ? "py-8" : "py-16";
  const iconBox = size === "sm" ? "h-10 w-10" : "h-14 w-14";
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl text-center ${pad}`}
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      {icon && (
        <div
          className={`flex items-center justify-center rounded-full ${iconBox}`}
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          {icon}
        </div>
      )}
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        {title}
      </span>
      {description && (
        <span className="text-[12px] max-w-md" style={{ color: T.textMuted }}>
          {description}
        </span>
      )}
      {(action || secondaryAction) && (
        <div className="mt-2 flex items-center gap-2">
          {action && <ActionButton action={action} primary />}
          {secondaryAction && <ActionButton action={secondaryAction} />}
        </div>
      )}
    </div>
  );
}

function ActionButton({ action, primary = false }: { action: Action; primary?: boolean }) {
  const className = "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold transition hover:brightness-110";
  const style = primary
    ? { backgroundColor: T.accentPrimary, color: "#FFFFFF" }
    : { backgroundColor: T.panelElevated, color: T.textSecondary, border: `1px solid ${T.borderSoft}` };
  if (action.href) {
    return (
      <Link href={action.href} className={className} style={style}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className} style={style}>
      {action.label}
    </button>
  );
}
