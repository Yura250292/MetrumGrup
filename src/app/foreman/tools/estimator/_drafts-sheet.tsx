"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Plus, Save, Trash2, X } from "lucide-react";
import type { EstimatorState } from "./_types";
import {
  deleteDraft,
  listDrafts,
  saveDraftAs,
  type SavedDraft,
} from "./_drafts";

interface Props {
  /** Поточний стейт — для нового збереження. */
  state: EstimatorState;
  /** Колбек завантаження обраної чернетки. */
  onLoad: (state: SavedDraft["state"]) => void;
  onClose: () => void;
}

export function DraftsSheet({ state, onLoad, onClose }: Props) {
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  useEffect(() => {
    setDrafts(listDrafts());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    const name =
      saveName.trim() ||
      `Кошторис ${new Date().toLocaleDateString("uk-UA")} ${new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`;
    saveDraftAs(name, state);
    setDrafts(listDrafts());
    setShowSaveForm(false);
    setSaveName("");
  };

  const handleDelete = (id: string, name: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Видалити «${name}»?`)) {
      return;
    }
    deleteDraft(id);
    setDrafts(listDrafts());
  };

  const isEmpty = state.plan.rooms.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="w-full max-w-md bg-zinc-950 border-t border-white/10 rounded-t-3xl p-5 space-y-4 max-h-[88dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Збережені кошториси</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {drafts.length} {drafts.length === 1 ? "чернетка" : "чернеток"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition"
            aria-label="Закрити"
          >
            <X size={18} className="text-zinc-300" />
          </button>
        </div>

        {/* Save current */}
        {showSaveForm ? (
          <div className="rounded-xl bg-violet-500/10 border border-violet-500/30 p-3 space-y-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                Назва кошторису
              </span>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={`Кошторис ${new Date().toLocaleDateString("uk-UA")}`}
                autoFocus
                className="mt-1 w-full px-3 py-2.5 rounded-lg bg-zinc-950 border border-white/10 text-white text-sm focus:border-violet-500/60 focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSaveForm(false);
                  setSaveName("");
                }}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-300 active:scale-95 transition"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-violet-500/25 border border-violet-500/50 text-xs font-semibold text-violet-100 active:scale-95 transition"
              >
                <Save size={12} />
                Зберегти
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSaveForm(true)}
            disabled={isEmpty}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40"
          >
            <Plus size={14} />
            Зберегти поточний як новий
          </button>
        )}

        {drafts.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-zinc-500">
            Поки нема збережених кошторисів. Збережи поточний з кнопкою вище —
            він з'явиться у списку. Авто-збереження працює окремо (відновиться
            при перезавантаженні).
          </div>
        ) : (
          <ul className="space-y-1.5">
            {drafts.map((d) => {
              const rooms = d.state.plan.rooms.length;
              const totalArea = d.state.plan.rooms.reduce(
                (s, r) => s + r.w * r.h,
                0,
              );
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onLoad(d.state);
                      onClose();
                    }}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left active:scale-[0.99] transition"
                  >
                    <FolderOpen
                      size={14}
                      className="text-violet-300 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{d.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {rooms} кімнат · {totalArea.toFixed(1)} м² ·{" "}
                        {new Date(d.savedAt).toLocaleDateString("uk-UA")}{" "}
                        {new Date(d.savedAt).toLocaleTimeString("uk-UA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id, d.name)}
                    className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-center active:scale-90 transition shrink-0"
                    aria-label="Видалити"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
