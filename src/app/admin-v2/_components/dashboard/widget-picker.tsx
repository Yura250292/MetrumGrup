"use client";

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { WIDGET_LIST } from "./widget-registry";
import type { WidgetType } from "./layout-schema";

export function WidgetPicker({
  onAdd,
  onClose,
}: {
  onAdd: (type: WidgetType) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Body scroll lock for mobile.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const [query, setQuery] = useState("");
  const filtered = WIDGET_LIST.filter((w) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      w.label.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="sheet-in flex w-full max-h-[92dvh] flex-col rounded-t-2xl sm:max-w-xl sm:rounded-2xl shadow-2xl"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <span
            className="h-1 w-10 rounded-full"
            style={{ backgroundColor: T.borderSoft }}
          />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-3 sm:pt-5">
          <h2 className="text-[16px] font-bold" style={{ color: T.textPrimary }}>
            Додати віджет
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md transition hover:brightness-110 touch-manipulation"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
            aria-label="Закрити"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <input
            type="text"
            placeholder="Шукати віджети..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-[14px]"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
              fontSize: 16, // Prevent iOS zoom-on-focus
            }}
          />
        </div>

        <div
          className="grid grid-cols-1 gap-2 overflow-y-auto px-5 pb-5 sm:grid-cols-2"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
          {filtered.map((w) => {
            const Icon = w.icon;
            return (
              <button
                key={w.type}
                type="button"
                onClick={() => {
                  onAdd(w.type);
                  onClose();
                }}
                className="flex min-h-[60px] items-start gap-3 rounded-xl p-3 text-left transition hover:brightness-[0.97] touch-manipulation"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: T.accentPrimary + "14",
                    color: T.accentPrimary,
                  }}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[13px] font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    {w.label}
                  </span>
                  <span
                    className="mt-0.5 block text-[11.5px]"
                    style={{ color: T.textMuted }}
                  >
                    {w.description}
                  </span>
                </span>
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: T.accentPrimary,
                    color: "#fff",
                  }}
                >
                  <Plus size={14} />
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div
              className="col-span-full py-6 text-center text-[12px]"
              style={{ color: T.textMuted }}
            >
              Нічого не знайдено
            </div>
          )}
        </div>
      </div>

      <style>{`
        .sheet-in {
          animation: sheet-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes sheet-in {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sheet-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
