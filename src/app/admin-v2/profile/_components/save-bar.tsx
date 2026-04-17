"use client";

import { Loader2, Check } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset?: () => void;
};

export function SaveBar({ dirty, saving, onSave, onReset }: Props) {
  if (!dirty && !saving) return null;

  return (
    <div
      className="flex items-center justify-end gap-3 pt-4 mt-4"
      style={{ borderTop: "1px solid " + T.borderSoft }}
    >
      {onReset && (
        <button
          onClick={onReset}
          disabled={saving}
          className="rounded-xl px-4 py-2.5 text-[13px] font-medium transition disabled:opacity-50"
          style={{
            color: T.textSecondary,
            backgroundColor: T.panelElevated,
          }}
        >
          Скасувати
        </button>
      )}
      <button
        onClick={onSave}
        disabled={saving || !dirty}
        className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-50"
        style={{ backgroundColor: T.accentPrimary }}
      >
        {saving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Check size={14} />
        )}
        {saving ? "Збереження..." : "Зберегти зміни"}
      </button>
    </div>
  );
}
