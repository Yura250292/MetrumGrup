"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { QuadrantPreset } from "./types";

type Preset = {
  key: string;
  label: string;
  hint: string;
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  color: string;
  icon: React.ComponentType<{ size?: number }>;
};

const PRESETS: Preset[] = [
  {
    key: "fact-expense",
    label: "Факт. витрата",
    hint: "Реальна оплата вже відбулась",
    kind: "FACT",
    type: "EXPENSE",
    color: T.success,
    icon: TrendingDown,
  },
  {
    key: "fact-income",
    label: "Факт. дохід",
    hint: "Гроші зайшли на рахунок",
    kind: "FACT",
    type: "INCOME",
    color: T.success,
    icon: TrendingUp,
  },
  {
    key: "plan-expense",
    label: "План витрата",
    hint: "Майбутній платіж",
    kind: "PLAN",
    type: "EXPENSE",
    color: T.warning,
    icon: TrendingDown,
  },
  {
    key: "plan-income",
    label: "План дохід",
    hint: "Очікуване надходження",
    kind: "PLAN",
    type: "INCOME",
    color: T.warning,
    icon: TrendingUp,
  },
];

export function QuickAddSplit({
  onPick,
  compact,
}: {
  onPick: (preset: QuadrantPreset) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Default action — most common: "Факт. витрата"
  const def = PRESETS[0];
  const DefIcon = def.icon;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => onPick({ kind: def.kind, type: def.type })}
        className={`flex items-center gap-1.5 rounded-l-xl ${
          compact ? "px-3 py-2" : "px-4 py-2.5"
        } text-[12px] sm:text-xs font-bold text-white transition hover:brightness-110`}
        style={{ backgroundColor: T.accentPrimary }}
      >
        <Plus size={13} />
        <span>Швидкий запис</span>
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Інші типи запису"
        className={`flex items-center justify-center rounded-r-xl ${
          compact ? "px-2 py-2" : "px-2.5 py-2.5"
        } border-l border-white/20 text-white transition hover:brightness-110`}
        style={{ backgroundColor: T.accentPrimary }}
      >
        <ChevronDown
          size={14}
          style={{
            transition: "transform 200ms",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[280px] rounded-2xl p-1.5 z-50"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderStrong}`,
            boxShadow: "0 12px 32px -8px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.key}
                role="menuitem"
                onClick={() => {
                  onPick({ kind: p.kind, type: p.type });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:opacity-90"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = T.panelSoft)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                  style={{ backgroundColor: `${p.color}1f`, color: p.color }}
                >
                  <Icon size={14} />
                </span>
                <span className="flex flex-col min-w-0">
                  <span
                    className="text-[12.5px] font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    {p.label}
                  </span>
                  <span className="text-[11px]" style={{ color: T.textMuted }}>
                    {p.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
