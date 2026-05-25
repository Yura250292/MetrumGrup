"use client";

import { ChevronLeft, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Breadcrumb } from "./Breadcrumb";
import { useDrillDown } from "../use-drill-down";
import { getRegistryEntry } from "../registry";

export function DrawerHeader({
  isMobile,
  actions,
}: {
  isMobile: boolean;
  actions?: React.ReactNode;
}) {
  const drawer = useDrillDown();
  const top = drawer.stack[drawer.stack.length - 1];
  if (!top) return null;
  const reg = getRegistryEntry(top.type);
  const pageHref = reg?.pageHref?.(top.id);

  return (
    <div
      className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5"
      style={{
        backgroundColor: T.panel,
        borderBottom: `1px solid ${T.borderSoft}`,
      }}
    >
      {isMobile && drawer.stack.length > 1 ? (
        <button
          type="button"
          onClick={() => drawer.back()}
          className="rounded-lg p-1.5"
          style={{ color: T.textPrimary }}
          aria-label="Назад"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <Breadcrumb compact={isMobile} />
      </div>

      <div className="flex items-center gap-1">
        {pageHref && (
          <Link
            href={pageHref}
            className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
            style={{
              color: T.textSecondary,
              border: `1px solid ${T.borderSoft}`,
            }}
            title="Відкрити повну сторінку"
          >
            <ExternalLink size={12} />
            <span>На сторінку</span>
          </Link>
        )}
        {actions}
        <button
          type="button"
          onClick={() => drawer.closeAll()}
          className="rounded-lg p-1.5"
          style={{ color: T.textMuted }}
          aria-label="Закрити панель"
          title="Закрити (Esc)"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
