"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TabPivot } from "./tab-pivot";
import type { FinancingFilters } from "./types";

export function PivotFullscreenModal({
  open,
  onClose,
  scope,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  scope?: { id: string; title: string };
  filters: FinancingFilters;
}) {
  // Block body scroll when open + close on Esc
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: T.background }}
      role="dialog"
      aria-modal="true"
      aria-label="Зведена таблиця"
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 flex-shrink-0"
        style={{ borderColor: T.borderSoft, background: T.panel }}
      >
        <div className="flex flex-col min-w-0">
          <h2 className="text-base sm:text-lg font-bold truncate" style={{ color: T.textPrimary }}>
            Зведена таблиця
          </h2>
          <p className="text-[11px] hidden sm:block" style={{ color: T.textMuted }}>
            Фінансовий результат по проєктах, ЗП та адміністративних витратах
          </p>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition hover:brightness-110"
          style={{ borderColor: T.borderSoft, color: T.textPrimary, background: T.panel }}
          aria-label="Закрити"
        >
          <X size={16} />
          <span className="hidden sm:inline">Закрити</span>
        </button>
      </div>

      {/* Body — own scroll, sticky toolbar/headers/first-col live inside TabPivot */}
      <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
        <TabPivot scope={scope} filters={filters} />
      </div>
    </div>
  );
}
