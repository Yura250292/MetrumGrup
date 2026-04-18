"use client";

import { Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiAvatar } from "./AiAvatar";

const TOOL_LABELS: Record<string, string> = {
  list_projects: "Завантажую список проєктів...",
  get_project_summary: "Отримую деталі проєкту...",
  get_project_financials: "Аналізую фінансові дані...",
  get_task_list: "Завантажую завдання...",
  get_my_tasks: "Шукаю ваші завдання...",
  get_team_workload: "Аналізую навантаження команди...",
  get_estimate_summary: "Отримую дані кошторису...",
  get_payment_status: "Перевіряю статус платежів...",
  get_stage_progress: "Отримую прогрес по етапах...",
  get_dashboard_kpis: "Збираю KPI дашборду...",
  compare_projects: "Порівнюю проєкти...",
  get_overdue_items: "Шукаю прострочені елементи...",
};

export function AiToolCallIndicator({ toolName }: { toolName: string }) {
  const label = TOOL_LABELS[toolName] ?? "Отримую дані...";

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
      style={{ backgroundColor: T.accentPrimarySoft, color: T.textSecondary }}
    >
      <AiAvatar size="sm" mood="building" />
      <Loader2 className="h-4 w-4 animate-spin" style={{ color: T.accentPrimary }} />
      <span>{label}</span>
    </div>
  );
}
