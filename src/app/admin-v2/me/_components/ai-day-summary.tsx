"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  ListChecks,
  AlertTriangle,
  Users,
  UserMinus,
  CheckCircle2,
  Wand2,
  ChevronDown,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiPanel } from "@/contexts/AiPanelContext";
import { DAY_SUMMARY_PROMPTS } from "@/lib/ai-assistant/task-prompts";

type SummaryKey = keyof typeof DAY_SUMMARY_PROMPTS;

const SECONDARY_ACTIONS: { key: SummaryKey; label: string; icon: typeof Sparkles }[] = [
  { key: "priorities", label: "Пріоритети", icon: ListChecks },
  { key: "stalled", label: "Що зависло", icon: AlertTriangle },
  { key: "blocking-team", label: "Де я блокую команду", icon: Users },
  { key: "delegate", label: "Що делегувати", icon: UserMinus },
  { key: "close-today", label: "Закрити сьогодні", icon: CheckCircle2 },
];

export function AiDaySummary() {
  const { open } = useAiPanel();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const fire = (key: SummaryKey) => {
    setMenuOpen(false);
    open(DAY_SUMMARY_PROMPTS[key]);
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => fire("summary")}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
        style={{ backgroundColor: T.accentSecondary, color: "#FFFFFF" }}
      >
        <Wand2 size={12} />
        Скласти план дня
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition"
        style={{
          backgroundColor: menuOpen ? T.panelElevated : "transparent",
          color: T.textSecondary,
          border: `1px solid ${T.borderSoft}`,
        }}
        title="Інші AI-дії"
      >
        <Sparkles size={11} style={{ color: T.accentPrimary }} />
        <ChevronDown size={11} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="dropdown-menu-enter dropdown-menu-enter-right absolute right-0 top-full mt-1 z-20 flex flex-col gap-0.5 rounded-xl p-1.5 min-w-[220px]"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {SECONDARY_ACTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="menuitem"
              type="button"
              onClick={() => fire(key)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium text-left transition hover:brightness-95"
              style={{
                color: T.textSecondary,
                backgroundColor: "transparent",
              }}
            >
              <Icon size={12} style={{ color: T.accentPrimary }} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
