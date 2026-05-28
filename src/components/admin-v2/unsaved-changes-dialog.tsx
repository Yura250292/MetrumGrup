"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Save, Trash2 } from "lucide-react";

export function UnsavedChangesDialog({
  open,
  dirtyCount,
  saving,
  onSave,
  onDiscard,
  onContinue,
}: {
  open: boolean;
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onContinue: () => void;
}) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => continueRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onContinue();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onContinue]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={onContinue}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-5 shadow-xl dark:border-amber-700 dark:bg-zinc-900"
      >
        <div className="mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <AlertTriangle size={20} />
          <h3 id="unsaved-changes-title" className="text-base font-bold">
            У вас є незбережені зміни
          </h3>
        </div>
        <p className="mb-5 text-sm text-zinc-700 dark:text-zinc-300">
          {dirtyCount === 1
            ? "Ви змінили 1 поле."
            : `Ви змінили ${dirtyCount} поля.`}{" "}
          Що зробити перед виходом?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            <Save size={14} />
            Зберегти і вийти
          </button>
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            disabled={saving}
            className="flex flex-1 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            Продовжити редагування
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            <Trash2 size={14} />
            Відкинути зміни
          </button>
        </div>
      </div>
    </div>
  );
}
