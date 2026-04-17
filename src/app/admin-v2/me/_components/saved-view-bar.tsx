"use client";

import { useEffect, useState } from "react";
import { Bookmark, Plus, Trash2, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { Scope, Focus, ViewMode } from "./use-me-tasks";

export type SavedViewFilters = {
  scope?: Scope;
  focus?: Focus;
  viewMode?: ViewMode;
  projectIds?: string[];
  includeCompleted?: boolean;
};

type SavedView = {
  id: string;
  name: string;
  filtersJson: SavedViewFilters;
};

export function SavedViewBar({
  currentFilters,
  onApply,
}: {
  currentFilters: SavedViewFilters;
  onApply: (filters: SavedViewFilters) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch("/api/admin/me/views")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) =>
        setViews(
          (j.data ?? []).map((v: any) => ({
            id: v.id,
            name: v.name,
            filtersJson: v.filtersJson ?? {},
          }))
        )
      )
      .catch(() => {});
  }, []);

  const saveView = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/me/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          filtersJson: currentFilters,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setViews((prev) => [
          { id: data.id, name: data.name, filtersJson: data.filtersJson ?? {} },
          ...prev,
        ]);
        setNewName("");
        setShowNameInput(false);
        setActiveId(data.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteView = async (id: string) => {
    await fetch(`/api/admin/me/views/${id}`, { method: "DELETE" });
    setViews((prev) => prev.filter((v) => v.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const applyView = (view: SavedView) => {
    setActiveId(view.id);
    onApply(view.filtersJson);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="flex items-center gap-1 text-[10px] font-bold tracking-wider mr-1"
        style={{ color: T.textMuted }}
      >
        <Bookmark size={11} />
        VIEWS
      </span>

      {views.map((v) => (
        <div key={v.id} className="flex items-center gap-0">
          <button
            onClick={() => applyView(v)}
            className="rounded-l-full px-2.5 py-1 text-[11px] font-semibold transition"
            style={{
              backgroundColor: activeId === v.id ? T.accentPrimarySoft : "transparent",
              color: activeId === v.id ? T.accentPrimary : T.textMuted,
              border: `1px solid ${activeId === v.id ? T.accentPrimary : T.borderSoft}`,
              borderRight: "none",
            }}
          >
            {v.name}
          </button>
          <button
            onClick={() => void deleteView(v.id)}
            className="rounded-r-full px-1.5 py-1 transition"
            style={{
              backgroundColor: activeId === v.id ? T.accentPrimarySoft : "transparent",
              color: T.textMuted,
              border: `1px solid ${activeId === v.id ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}

      {showNameInput ? (
        <div className="flex items-center gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveView();
              if (e.key === "Escape") setShowNameInput(false);
            }}
            placeholder="Назва view…"
            autoFocus
            className="rounded-lg px-2 py-1 text-[11px] outline-none w-32"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderAccent}`,
            }}
          />
          <button
            onClick={() => void saveView()}
            disabled={saving || !newName.trim()}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            {saving ? <Loader2 size={10} className="animate-spin" /> : "OK"}
          </button>
          <button
            onClick={() => setShowNameInput(false)}
            className="text-[11px]"
            style={{ color: T.textMuted }}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNameInput(true)}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
          style={{
            backgroundColor: "transparent",
            color: T.textMuted,
            border: `1px dashed ${T.borderSoft}`,
          }}
        >
          <Plus size={10} />
          Зберегти вигляд
        </button>
      )}
    </div>
  );
}
