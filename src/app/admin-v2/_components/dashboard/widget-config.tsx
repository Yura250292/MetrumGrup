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
      title={isEditing ? "Готово" : "Налаштувати віджети"}
      className="flex items-center justify-center gap-1.5 rounded-lg w-9 h-9 transition hover:brightness-[0.95]"
      style={{
        backgroundColor: isEditing ? T.accentPrimary : T.panel,
        color: isEditing ? "#fff" : T.textMuted,
        border: `1px solid ${isEditing ? T.accentPrimary : T.borderSoft}`,
      }}
    >
      {isSaving ? (
        <Loader2 size={15} className="animate-spin" />
      ) : isEditing ? (
        <Check size={15} />
      ) : (
        <Settings size={15} />
      )}
    </button>
  );
}
