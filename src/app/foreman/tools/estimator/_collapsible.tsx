"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  title: React.ReactNode;
  /** Опційний приклад справа (наприклад, сума по кімнаті). */
  trailing?: React.ReactNode;
  /** Чи розкрита за замовч. */
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** Опційний класс на root. */
  className?: string;
}

/** Простий згортний блок для розділів Results / Visualize. */
export function Collapsible({
  title,
  trailing,
  defaultOpen = false,
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 overflow-hidden ${
        className ?? ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 active:bg-white/[0.04] transition text-left"
      >
        <div className="flex-1 min-w-0">{title}</div>
        <div className="flex items-center gap-2 shrink-0">
          {trailing}
          {open ? (
            <ChevronUp size={16} className="text-zinc-400" />
          ) : (
            <ChevronDown size={16} className="text-zinc-400" />
          )}
        </div>
      </button>
      {open && <div className="border-t border-white/5">{children}</div>}
    </section>
  );
}
