"use client";

import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useDrillDown } from "../use-drill-down";
import { getRegistryEntry } from "../registry";
import type { DrawerStackItem } from "../types";

/**
 * Клікабельний breadcrumb: tap на проміжний рівень — pop до нього.
 * Якщо у стеку >3 елементів — згортаємо середину в "..." dropdown.
 */
export function Breadcrumb({ compact = false }: { compact?: boolean }) {
  const drawer = useDrillDown();
  const stack = drawer.stack;
  if (stack.length === 0) return null;

  const popToIndex = (idx: number) => {
    const popCount = stack.length - 1 - idx;
    if (popCount <= 0) return;
    for (let i = 0; i < popCount; i++) drawer.back();
  };

  const labels = stack.map((item, i) => labelFor(item, i === stack.length - 1));

  // Compact (mobile) — показуємо лише верх + кнопку back. Без overflow.
  if (compact) {
    const last = stack[stack.length - 1];
    return (
      <span
        className="truncate text-[12px] font-semibold"
        style={{ color: T.textPrimary }}
        title={labels[labels.length - 1]}
      >
        {labels[labels.length - 1] || labelFor(last, true)}
      </span>
    );
  }

  // Desktop: 3 видимі рівні max. Якщо >3 — middle через "...".
  const items: (
    | { kind: "item"; idx: number; label: string }
    | { kind: "overflow"; hiddenIndices: number[] }
  )[] = [];
  if (stack.length <= 3) {
    stack.forEach((_, i) => items.push({ kind: "item", idx: i, label: labels[i] }));
  } else {
    items.push({ kind: "item", idx: 0, label: labels[0] });
    items.push({
      kind: "overflow",
      hiddenIndices: stack.slice(1, -1).map((_, i) => i + 1),
    });
    items.push({
      kind: "item",
      idx: stack.length - 1,
      label: labels[stack.length - 1],
    });
  }

  return (
    <nav
      className="flex min-w-0 items-center gap-1 text-[11px]"
      aria-label="Drawer breadcrumb"
    >
      {items.map((part, i) => {
        const isLast = i === items.length - 1;
        if (part.kind === "overflow") {
          return (
            <BreadcrumbOverflow
              key="ov"
              indices={part.hiddenIndices}
              labels={labels}
              onPick={popToIndex}
            />
          );
        }
        return (
          <span key={part.idx} className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => popToIndex(part.idx)}
              disabled={isLast}
              className="truncate max-w-[180px] rounded px-1 py-0.5 transition"
              style={{
                color: isLast ? T.textPrimary : T.textMuted,
                cursor: isLast ? "default" : "pointer",
                fontWeight: isLast ? 700 : 500,
              }}
              title={part.label}
            >
              {part.label}
            </button>
            {!isLast && (
              <ChevronRight size={12} style={{ color: T.textMuted }} />
            )}
          </span>
        );
      })}
    </nav>
  );
}

function labelFor(item: DrawerStackItem, _isLast: boolean): string {
  if (item.breadcrumbLabel) return item.breadcrumbLabel;
  const reg = getRegistryEntry(item.type);
  return reg?.defaultBreadcrumb ?? item.type;
}

function BreadcrumbOverflow({
  indices,
  labels,
  onPick,
}: {
  indices: number[];
  labels: string[];
  onPick: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded px-1 py-0.5"
        style={{ color: T.textMuted }}
        aria-label="Показати приховані рівні"
      >
        <MoreHorizontal size={14} />
      </button>
      <ChevronRight size={12} style={{ color: T.textMuted }} />
      {open && (
        <div
          className="absolute top-6 left-0 z-50 min-w-[160px] rounded-lg p-1 shadow-lg"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {indices.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(i);
              }}
              className="block w-full truncate rounded px-2 py-1.5 text-left text-[12px] hover:opacity-80"
              style={{ color: T.textPrimary }}
            >
              {labels[i]}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
