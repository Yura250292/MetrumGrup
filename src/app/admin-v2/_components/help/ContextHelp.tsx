"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function ContextHelp({
  text,
  label,
  size = 14,
}: {
  text: string;
  label?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-full transition hover:opacity-80"
        style={{ color: T.textMuted, width: size + 4, height: size + 4 }}
        aria-label={label ?? "Підказка"}
        aria-expanded={open}
      >
        <HelpCircle size={size} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1 w-[260px] -translate-x-1/2 rounded-lg px-3 py-2 text-[11.5px] leading-relaxed shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textSecondary,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
