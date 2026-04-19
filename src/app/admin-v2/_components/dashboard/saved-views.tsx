"use client";

import { useRouter, usePathname } from "next/navigation";
import { Bookmark } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const PRESETS = [
  { id: "morning", label: "Ранковий контроль", params: "?period=today" },
  { id: "weekly", label: "Тижневий огляд", params: "?period=week" },
  { id: "finance", label: "Фінансовий контроль", params: "?period=month" },
  { id: "quarter", label: "Квартальний звіт", params: "?period=quarter" },
] as const;

export function SavedViews() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      <Bookmark size={14} style={{ color: T.textMuted }} className="flex-shrink-0" />
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          onClick={() => router.push(`${pathname}${preset.params}`, { scroll: false })}
          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition whitespace-nowrap hover:brightness-[0.95]"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textSecondary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
