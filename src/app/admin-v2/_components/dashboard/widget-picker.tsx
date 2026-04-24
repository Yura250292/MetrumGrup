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
    return () => document.removeEventListener("keydown", onKey);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-5 shadow-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold" style={{ color: T.textPrimary }}>
            Додати віджет
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md transition hover:brightness-110"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
            aria-label="Закрити"
          >
            <X size={14} />
          </button>
        </div>

        <input
          type="text"
          placeholder="Шукати віджети..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3 w-full rounded-lg px-3 py-2 text-[13px]"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
          autoFocus
        />

        <div className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
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
                className="flex items-start gap-3 rounded-xl p-3 text-left transition hover:brightness-[0.97]"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: T.accentPrimary + "14",
                    color: T.accentPrimary,
                  }}
                >
                  <Icon size={16} />
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
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: T.accentPrimary,
                    color: "#fff",
                  }}
                >
                  <Plus size={12} />
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
    </div>
  );
}
