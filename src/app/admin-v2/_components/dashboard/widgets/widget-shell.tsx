"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type WidgetShellProps = {
  icon?: ReactNode;
  title: string;
  badge?: string;
  action?: { href: string; label: string } | { onClick: () => void; label: string };
  children: ReactNode;
};

export function WidgetShell({ icon, title, badge, action, children }: WidgetShellProps) {
  return (
    <div
      className="flex h-full flex-col rounded-2xl p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={{ backgroundColor: T.accentPrimary + "14", color: T.accentPrimary }}
            >
              {icon}
            </span>
          )}
          <h3
            className="text-[12px] font-bold tracking-wide"
            style={{ color: T.textPrimary }}
          >
            {title.toUpperCase()}
          </h3>
          {badge && (
            <span
              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {badge}
            </span>
          )}
        </div>
        {action &&
          ("href" in action ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1 text-[11px] font-semibold transition hover:brightness-[0.9]"
              style={{ color: T.accentPrimary }}
            >
              {action.label}
              <ArrowRight size={11} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-1 text-[11px] font-semibold transition hover:brightness-[0.9]"
              style={{ color: T.accentPrimary }}
            >
              {action.label}
              <ArrowRight size={11} />
            </button>
          ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
