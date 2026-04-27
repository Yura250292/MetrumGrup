"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Trash2, Plus, Check } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { SavedView } from "./useSavedViews";

type Props<S> = {
  views: SavedView<S>[];
  activeId?: string | null;
  onApply: (state: S, id: string) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
};

export function SavedViewsMenu<S>({
  views,
  activeId,
  onApply,
  onSave,
  onDelete,
}: Props<S>) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setDraftName("");
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeView = views.find((v) => v.id === activeId);
  const buttonLabel = activeView ? activeView.name : "Види";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition hover:brightness-95"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textSecondary,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <Bookmark size={14} />
        <span className="max-w-[140px] truncate">{buttonLabel}</span>
      </button>

      {open && (
        <div
          className="dropdown-menu-enter dropdown-menu-enter-right absolute right-0 top-full mt-1.5 w-64 rounded-md py-1 shadow-lg z-50"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {views.length === 0 && !creating && (
            <div className="px-3 py-2 text-[12px]" style={{ color: T.textMuted }}>
              Збережених видів немає
            </div>
          )}

          {views.map((v) => {
            const isActive = v.id === activeId;
            return (
              <div
                key={v.id}
                className="group flex items-center gap-2 px-3 py-1.5 transition hover:bg-[var(--t-panel-el)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    onApply(v.state, v.id);
                    setOpen(false);
                  }}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                  style={{ color: T.textSecondary }}
                >
                  {isActive ? (
                    <Check size={12} style={{ color: T.accentPrimary }} />
                  ) : (
                    <span className="w-3 inline-block" />
                  )}
                  <span className="text-[13px] truncate">{v.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(v.id)}
                  className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-[var(--t-danger-soft)]"
                  title="Видалити"
                >
                  <Trash2 size={12} style={{ color: T.danger }} />
                </button>
              </div>
            );
          })}

          <div
            className="mt-1 border-t px-2 py-1.5"
            style={{ borderColor: T.borderSoft }}
          >
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = draftName.trim();
                  if (!trimmed) return;
                  onSave(trimmed);
                  setCreating(false);
                  setDraftName("");
                  setOpen(false);
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Назва виду"
                  className="flex-1 rounded px-2 py-1 text-[12px] outline-none"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                />
                <button
                  type="submit"
                  className="rounded px-2 py-1 text-[11px] font-semibold"
                  style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
                >
                  OK
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 w-full px-2 py-1 rounded transition hover:bg-[var(--t-panel-el)]"
                style={{ color: T.accentPrimary }}
              >
                <Plus size={12} />
                <span className="text-[12px] font-semibold">Зберегти поточний вид</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
