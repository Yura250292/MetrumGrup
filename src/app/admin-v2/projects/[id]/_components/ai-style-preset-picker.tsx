"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { AiStylePresetDTO } from "@/lib/ai-render/types";

export function AiStylePresetPicker({
  presets,
  selected,
  onSelect,
  category,
}: {
  presets: AiStylePresetDTO[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  category?: string;
}) {
  const filtered = category
    ? presets.filter((p) => p.category === category)
    : presets;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      {/* "No style" option */}
      <button
        onClick={() => onSelect(null)}
        className="flex-shrink-0 flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all"
        style={{
          backgroundColor: selected === null ? T.accentPrimarySoft : T.panelElevated,
          border: `2px solid ${selected === null ? T.accentPrimary : "transparent"}`,
          minWidth: 80,
        }}
      >
        <div
          className="w-14 h-14 rounded-lg flex items-center justify-center text-lg"
          style={{ backgroundColor: T.panel }}
        >
          --
        </div>
        <span
          className="text-[11px] font-medium text-center leading-tight"
          style={{ color: selected === null ? T.textPrimary : T.textSecondary }}
        >
          Без стилю
        </span>
      </button>

      {filtered.map((preset) => {
        const isSelected = selected === preset.name;
        return (
          <button
            key={preset.id}
            onClick={() => onSelect(preset.name)}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all"
            style={{
              backgroundColor: isSelected ? T.accentPrimarySoft : T.panelElevated,
              border: `2px solid ${isSelected ? T.accentPrimary : "transparent"}`,
              minWidth: 80,
            }}
          >
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: T.panel }}
            >
              {preset.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preset.thumbnailUrl}
                  alt={preset.label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[20px]">
                  {preset.category === "interior" ? "🏠" : preset.category === "landscape" ? "🌳" : "🏗️"}
                </span>
              )}
            </div>
            <span
              className="text-[11px] font-medium text-center leading-tight max-w-[76px]"
              style={{ color: isSelected ? T.textPrimary : T.textSecondary }}
            >
              {preset.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
