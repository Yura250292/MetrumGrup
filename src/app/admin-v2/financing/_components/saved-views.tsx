"use client";

import { useEffect, useState } from "react";
import { Bookmark, ChevronDown, Trash2, Save, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FinancingFilters } from "./types";

type SavedView = {
  id: string;
  name: string;
  filters: Partial<FinancingFilters>;
};

const STORAGE_KEY = "financing-saved-views";

const BUILTIN_VIEWS: SavedView[] = [
  {
    id: "__builtin_my_expenses",
    name: "Мої витрати",
    filters: { kind: "FACT", type: "EXPENSE" },
  },
  {
    id: "__builtin_company_expenses",
    name: "Постійні витрати компанії",
    filters: { folderId: "fld_sys_company_expenses" },
  },
  {
    id: "__builtin_plan_no_fact",
    name: "План без факту",
    filters: { kind: "PLAN" },
  },
  {
    id: "__builtin_no_files",
    name: "Без вкладень",
    filters: { hasAttachments: "false" },
  },
  {
    id: "__builtin_overdue",
    name: "Прострочені",
    filters: { kind: "PLAN" },
  },
];

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function persistViews(views: SavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function SavedViews({
  filters,
  setFilters,
}: {
  filters: FinancingFilters;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
}) {
  const [open, setOpen] = useState(false);
  const [userViews, setUserViews] = useState<SavedView[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setUserViews(loadViews());
  }, []);

  function handleSave() {
    if (!newName.trim()) return;
    const view: SavedView = {
      id: `user_${Date.now()}`,
      name: newName.trim(),
      filters: { ...filters },
    };
    const next = [...userViews, view];
    setUserViews(next);
    persistViews(next);
    setNewName("");
    setSaving(false);
  }

  function handleDelete(id: string) {
    const next = userViews.filter((v) => v.id !== id);
    setUserViews(next);
    persistViews(next);
  }

  function handleApply(view: SavedView) {
    setFilters((prev) => ({
      ...prev,
      ...view.filters,
    }));
    setOpen(false);
  }

  const allViews = [...BUILTIN_VIEWS, ...userViews];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textSecondary,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <Bookmark size={13} />
        Збережені види
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl overflow-hidden shadow-xl"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: T.borderSoft }}
            >
              <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ЗБЕРЕЖЕНІ ВИДИ
              </span>
              <button onClick={() => setOpen(false)}>
                <X size={14} style={{ color: T.textMuted }} />
              </button>
            </div>

            {/* Built-in + user views */}
            <div className="max-h-60 overflow-y-auto">
              {allViews.map((view) => {
                const isBuiltin = view.id.startsWith("__builtin");
                return (
                  <div
                    key={view.id}
                    className="flex items-center gap-2 px-4 py-2.5 hover:brightness-95 cursor-pointer border-b"
                    style={{ borderColor: T.borderSoft }}
                    onClick={() => handleApply(view)}
                  >
                    <Bookmark
                      size={11}
                      style={{ color: isBuiltin ? T.accentPrimary : T.warning }}
                    />
                    <span className="flex-1 text-[12px] font-medium truncate" style={{ color: T.textPrimary }}>
                      {view.name}
                    </span>
                    {!isBuiltin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(view.id);
                        }}
                        className="rounded p-1 hover:brightness-90"
                        style={{ color: T.danger }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save current */}
            <div
              className="border-t px-4 py-3"
              style={{ borderColor: T.borderSoft, backgroundColor: T.panelSoft }}
            >
              {saving ? (
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Назва виду…"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                    style={{
                      backgroundColor: T.panel,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                  <button
                    onClick={handleSave}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white"
                    style={{ backgroundColor: T.accentPrimary }}
                  >
                    <Save size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSaving(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold"
                  style={{ color: T.accentPrimary }}
                >
                  <Save size={12} />
                  Зберегти поточні фільтри
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
