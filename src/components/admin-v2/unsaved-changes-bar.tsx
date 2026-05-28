"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Save, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function UnsavedChangesBar({
  isDirty,
  dirtyCount,
  saving,
  onSave,
  onDiscard,
  className,
  saveLabel = "Зберегти зміни",
  discardLabel = "Скасувати",
}: {
  isDirty: boolean;
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  className?: string;
  saveLabel?: string;
  discardLabel?: string;
}) {
  return (
    <AnimatePresence>
      {isDirty && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100",
            className,
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span>
              {dirtyCount === 1
                ? "1 незбережена зміна"
                : `${dirtyCount} незбережених змін`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-white disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/70"
            >
              <Undo2 size={13} />
              {discardLabel}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              {saveLabel}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
