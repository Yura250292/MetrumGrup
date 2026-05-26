"use client";

import { useEffect, useRef, useState } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type InlineStatus = { id: string; name: string; color: string };

export function InlineStatusPicker({
  current,
  statuses,
  onChange,
  size = "md",
}: {
  current: { id: string; name: string; color: string };
  statuses: InlineStatus[];
  onChange: (statusId: string) => void;
  /** "sm" — компактна пілюлька для щільних view (calendar/people) */
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const color = current.color ?? T.textMuted;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const padding = size === "sm" ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]";

  return (
    <div
      ref={wrapRef}
      className="relative flex-shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full font-bold transition hover:brightness-110 ${padding}`}
        style={{
          backgroundColor: color + "22",
          color,
          border: `1px solid ${color}33`,
        }}
        title="Змінити статус"
      >
        {current.name}
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 flex min-w-[160px] flex-col gap-0.5 rounded-xl p-1 shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {statuses.map((s) => {
            const active = s.id === current.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (!active) onChange(s.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition hover:brightness-110"
                style={{
                  backgroundColor: active ? s.color + "22" : "transparent",
                  color: active ? s.color : T.textPrimary,
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate">{s.name}</span>
                {active && <span style={{ color: s.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
