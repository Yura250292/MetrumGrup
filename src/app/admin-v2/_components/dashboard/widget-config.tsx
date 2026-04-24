"use client";

import { Settings, Check, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useDashboardLayoutContext } from "./dashboard-shell";

/**
 * Edit-mode toggle. Replaces the previous visibility checkbox menu —
 * the full layout (order, sizes, add/remove) is now edited inline on the grid.
 */
export function WidgetConfigButton() {
  const { isEditing, setEditing, isSaving } = useDashboardLayoutContext();

  return (
    <button
      type="button"
      onClick={() => setEditing(!isEditing)}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-[0.95]"
      style={{
        backgroundColor: isEditing ? T.accentPrimary : T.panelElevated,
        color: isEditing ? "#fff" : T.textMuted,
        border: `1px solid ${isEditing ? T.accentPrimary : T.borderSoft}`,
      }}
    >
      {isSaving ? (
        <Loader2 size={14} className="animate-spin" />
      ) : isEditing ? (
        <Check size={14} />
      ) : (
        <Settings size={14} />
      )}
      <span className="hidden sm:inline">
        {isEditing ? "Готово" : "Налаштувати"}
      </span>
    </button>
  );
}
