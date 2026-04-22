"use client";

import {
  Sparkles,
  ListChecks,
  Calendar,
  AlertTriangle,
  Users,
  Send,
  CheckSquare,
  FileText,
  Package,
  Briefcase,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiPanel } from "@/contexts/AiPanelContext";
import {
  buildTaskPrompt,
  type TaskAiAction,
  type TaskContextForAi,
} from "@/lib/ai-assistant/task-prompts";

type Props = {
  task: TaskContextForAi;
};

const CORE_ACTIONS: {
  key: TaskAiAction;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { key: "explain", label: "Коротко поясни", icon: Sparkles },
  { key: "breakdown", label: "Розбий на кроки", icon: ListChecks },
  { key: "today", label: "Що робити сьогодні", icon: Calendar },
  { key: "blockers", label: "Знайди блокери", icon: AlertTriangle },
  { key: "who-to-involve", label: "Кого підключити", icon: Users },
  { key: "message", label: "Підготуй повідомлення", icon: Send },
  { key: "checklist", label: "Склади чекліст", icon: CheckSquare },
];

const WEB_ACTIONS: {
  key: TaskAiAction;
  label: string;
  icon: typeof FileText;
}[] = [
  { key: "regulations", label: "Нормативка", icon: FileText },
  { key: "material-analogs", label: "Аналоги матеріалів", icon: Package },
  { key: "suppliers", label: "Постачальники", icon: Briefcase },
];

export function TaskAiActions({ task }: Props) {
  const { open } = useAiPanel();

  const fire = (action: TaskAiAction) => {
    open(buildTaskPrompt(action, task));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: T.accentPrimary }} />
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          AI-помічник
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {CORE_ACTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => fire(key)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12px] font-medium text-left transition hover:brightness-95"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textSecondary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <Icon size={14} style={{ color: T.accentPrimary }} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          Зовнішній пошук
        </span>
        <span className="flex-1 h-px" style={{ backgroundColor: T.borderSoft }} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {WEB_ACTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => fire(key)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12px] font-medium text-left transition hover:brightness-95"
            style={{
              backgroundColor: T.accentPrimarySoft,
              color: T.accentPrimary,
              border: `1px solid ${T.accentPrimary}30`,
            }}
          >
            <Icon size={14} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
