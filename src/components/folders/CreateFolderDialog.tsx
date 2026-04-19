"use client";

import { useState } from "react";
import { X, FolderPlus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const PRESET_COLORS = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#6366f1",
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; color: string | null }) => void;
  loading?: boolean;
};

export function CreateFolderDialog({ open, onClose, onSubmit, loading }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(PRESET_COLORS[0]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), color });
    setName("");
    setColor(PRESET_COLORS[0]);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderPlus size={18} style={{ color: T.accentPrimary }} />
            <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Нова папка
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
              style={{ color: T.textMuted }}
            >
              Назва
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Наприклад: АТБ"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            />
          </div>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider mb-2 block"
              style={{ color: T.textMuted }}
            >
              Колір
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? `2px solid ${c}` : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
            }}
          >
            {loading ? "Створення..." : "Створити папку"}
          </button>
        </form>
      </div>
    </div>
  );
}
