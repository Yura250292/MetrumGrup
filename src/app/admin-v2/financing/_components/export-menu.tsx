"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileSpreadsheet, FileText, Loader2, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Export-format split button used in the financing view.
 * Click main button → default (Excel). Click chevron → opens menu with PDF.
 */
export function ExportMenu({
  onExport,
  exporting,
  disabled,
  compact,
}: {
  onExport: (format: "xlsx" | "pdf") => void | Promise<void>;
  exporting: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => onExport("xlsx")}
        disabled={exporting || disabled}
        title="Завантажити Excel (за поточними фільтрами)"
        className="flex items-center justify-center rounded-l-xl h-10 px-3 text-xs font-semibold disabled:opacity-50 transition hover:brightness-105"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textPrimary,
          border: `1px solid ${T.borderStrong}`,
          borderRight: "none",
        }}
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {!compact && <span className="ml-1.5">Excel</span>}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting || disabled}
        title="Інші формати"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center rounded-r-xl h-10 px-1.5 disabled:opacity-50 transition hover:brightness-105"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textSecondary,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <ChevronDown size={13} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="menu"
            className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl shadow-xl"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onExport("xlsx");
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] hover:bg-black/5"
              style={{ color: T.textPrimary }}
            >
              <FileSpreadsheet size={14} style={{ color: "#16A34A" }} />
              <div className="flex flex-col">
                <span className="font-semibold">Excel (.xlsx)</span>
                <span className="text-[10px]" style={{ color: T.textMuted }}>
                  Повний список + підсумок
                </span>
              </div>
            </button>
            <div className="h-px" style={{ backgroundColor: T.borderSoft }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onExport("pdf");
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] hover:bg-black/5"
              style={{ color: T.textPrimary }}
            >
              <FileText size={14} style={{ color: "#DC2626" }} />
              <div className="flex flex-col">
                <span className="font-semibold">PDF (.pdf)</span>
                <span className="text-[10px]" style={{ color: T.textMuted }}>
                  Для друку / клієнту (до 500 рядків)
                </span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
