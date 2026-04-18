"use client";

import {
  BarChart3,
  ClipboardList,
  AlertTriangle,
  Search,
  TrendingUp,
  Users,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type QuickAction = {
  label: string;
  prompt: string;
  icon: LucideIcon;
};

const QUICK_ACTIONS: QuickAction[] = [
  { label: "KPI дашборд", prompt: "Покажи загальні KPI по всіх проєктах", icon: BarChart3 },
  { label: "Мої завдання", prompt: "Які мої поточні завдання? Що зробити першим?", icon: ClipboardList },
  { label: "Прострочене", prompt: "Покажи всі прострочені платежі та завдання", icon: AlertTriangle },
  { label: "Фін. аналіз", prompt: "Зроби фінансовий аналіз за останні 90 днів", icon: TrendingUp },
  { label: "Команда", prompt: "Покажи навантаження команди — хто чим зайнятий", icon: Users },
  { label: "Як зробити?", prompt: "Як створити AI кошторис покроково?", icon: HelpCircle },
];

const EMPTY_STATE_ACTIONS: QuickAction[] = [
  { label: "Огляд компанії", prompt: "Дай загальний огляд: скільки проєктів, бюджет, виручка, прострочені платежі", icon: BarChart3 },
  { label: "Мої завдання", prompt: "Які мої поточні завдання? Що найтерміновіше?", icon: ClipboardList },
  { label: "Прострочене", prompt: "Є щось прострочене? Платежі, завдання, дедлайни", icon: AlertTriangle },
  { label: "Пошук підрядника", prompt: "Допоможи знайти підрядника для демонтажних робіт в Києві", icon: Search },
  { label: "Фін. звіт", prompt: "Зроби детальний фінансовий аналіз за останні 3 місяці з рекомендаціями", icon: TrendingUp },
  { label: "Як користуватись?", prompt: "Розкажи які основні функції є на платформі Metrum і як ними користуватись", icon: HelpCircle },
];

type Props = {
  onAction: (prompt: string) => void;
  variant: "inline" | "empty-state";
  disabled?: boolean;
};

export function AiQuickActions({ onAction, variant, disabled }: Props) {
  const actions = variant === "empty-state" ? EMPTY_STATE_ACTIONS : QUICK_ACTIONS;

  if (variant === "empty-state") {
    return (
      <div className="grid grid-cols-2 gap-2 px-4 md:px-6">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => onAction(action.prompt)}
              disabled={disabled}
              className="flex flex-col items-start gap-1.5 rounded-xl px-3 py-3 text-left text-xs transition-all active:scale-[0.98] tap-highlight-none disabled:opacity-40"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
                color: T.textSecondary,
              }}
            >
              <Icon className="h-4 w-4" style={{ color: T.accentPrimary }} />
              <span className="font-medium" style={{ color: T.textPrimary }}>
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-1.5 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" as never }}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={() => onAction(action.prompt)}
            disabled={disabled}
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all active:scale-95 tap-highlight-none disabled:opacity-40"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderSoft}`,
              color: T.textSecondary,
            }}
          >
            <Icon className="h-3 w-3" style={{ color: T.accentPrimary }} />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
