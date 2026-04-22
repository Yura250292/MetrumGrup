"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { SectionDef } from "../_lib/constants";
import type { ProfileSection } from "../_lib/types";

type Props = {
  sections: SectionDef[];
  active: ProfileSection;
  onSelect: (id: ProfileSection) => void;
};

export function ProfileSectionNav({ sections, active, onSelect }: Props) {
  return (
    <nav className="flex flex-col gap-1">
      {sections.map((s) => {
        const isActive = s.id === active;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-all"
            style={{
              background: isActive ? "var(--nav-active)" : undefined,
              color: isActive ? T.accentPrimary : T.textSecondary,
              boxShadow: isActive ? "inset 2px 0 0 var(--nav-active-bar)" : undefined,
            }}
          >
            <Icon size={16} />
            <span className="text-[13px] font-medium">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
