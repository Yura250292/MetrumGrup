"use client";

import {
  Sparkles,
  ListChecks,
  AlertTriangle,
  Users,
  UserMinus,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiPanel } from "@/contexts/AiPanelContext";
import { DAY_SUMMARY_PROMPTS } from "@/lib/ai-assistant/task-prompts";

const BUTTONS: {
  key: keyof typeof DAY_SUMMARY_PROMPTS;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { key: "priorities", label: "Мої 5 пріоритетів", icon: ListChecks },
  { key: "stalled", label: "Що зависло", icon: AlertTriangle },
  { key: "blocking-team", label: "Де я блокую команду", icon: Users },
  { key: "delegate", label: "Що делегувати", icon: UserMinus },
  { key: "close-today", label: "Закрити сьогодні", icon: CheckCircle2 },
];

export function AiDaySummary() {
  const { open } = useAiPanel();

  const fire = (key: keyof typeof DAY_SUMMARY_PROMPTS) => {
    open(DAY_SUMMARY_PROMPTS[key]);
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl px-3 py-2.5"
      style={{
        backgroundColor: T.accentPrimarySoft,
        border: `1px solid ${T.accentPrimary}20`,
      }}
    >
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: T.accentPrimary }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: T.accentPrimary }}>
          AI-помічник дня
        </span>
        <button
          type="button"
          onClick={() => fire("summary")}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
        >
          <Wand2 size={12} />
          AI-резюме дня
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BUTTONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => fire(key)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition hover:brightness-95"
            style={{
              backgroundColor: T.panel,
              color: T.textSecondary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <Icon size={11} style={{ color: T.accentPrimary }} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
