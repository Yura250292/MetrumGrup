"use client";

import {
  BarChart3,
  ClipboardList,
  AlertTriangle,
  Search,
  TrendingUp,
  Users,
  HelpCircle,
  Wallet,
  FileText,
  Target,
  type LucideIcon,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type QuickAction = {
  label: string;
  prompt: string;
  icon: LucideIcon;
};

// ── Page-aware inline actions ─────────────────────────────────

const DEFAULT_INLINE: QuickAction[] = [
  { label: "KPI дашборд", prompt: "Покажи загальні KPI по всіх проєктах", icon: BarChart3 },
  { label: "Мої завдання", prompt: "Які мої поточні завдання? Що зробити першим?", icon: ClipboardList },
  { label: "Прострочене", prompt: "Покажи всі прострочені платежі та завдання", icon: AlertTriangle },
  { label: "Фін. аналіз", prompt: "Зроби фінансовий аналіз за останні 90 днів графіком", icon: TrendingUp },
  { label: "Команда", prompt: "Покажи навантаження команди — хто чим зайнятий", icon: Users },
  { label: "Як зробити?", prompt: "Як створити AI кошторис покроково?", icon: HelpCircle },
];

const PROJECT_INLINE: QuickAction[] = [
  { label: "Ризики проєкту", prompt: "Які ризики цього проєкту? Бюджет, дедлайни, прострочення", icon: AlertTriangle },
  { label: "План vs факт", prompt: "Порівняй план і факт по цьому проєкту — бюджет, етапи, терміни", icon: Target },
  { label: "Хто перевантажений", prompt: "Хто з команди цього проєкту найбільш завантажений?", icon: Users },
  { label: "Фінанси проєкту", prompt: "Покажи фінансовий стан цього проєкту: бюджет, сплачено, витрати", icon: Wallet },
];

const TASKS_INLINE: QuickAction[] = [
  { label: "Критичне сьогодні", prompt: "Що критичне сьогодні? Які завдання потрібно зробити першими?", icon: AlertTriangle },
  { label: "Заблоковані", prompt: "Чи є заблоковані або прострочені завдання?", icon: ClipboardList },
  { label: "Перепризначити", prompt: "Кого з виконавців варто перепризначити — хто перевантажений?", icon: Users },
];

const FINANCE_INLINE: QuickAction[] = [
  { label: "Перевитрати", prompt: "Де є перевитрати по проєктах? Покажи графіком", icon: AlertTriangle },
  { label: "Касовий розрив", prompt: "Чи є ризик касового розриву? Порівняй надходження і витрати", icon: Wallet },
  { label: "Прострочені", prompt: "Які платежі прострочені і на яку суму?", icon: TrendingUp },
];

const ESTIMATES_INLINE: QuickAction[] = [
  { label: "Структура", prompt: "Поясни структуру поточного кошторису — які секції, що найдорожче", icon: FileText },
  { label: "Маржа", prompt: "Де основна маржа в цьому кошторисі?", icon: TrendingUp },
  { label: "Порівняй ціни", prompt: "Порівняй ціни з ринковими — чи все адекватно?", icon: Search },
];

function getInlineActions(pathname: string): QuickAction[] {
  if (pathname.match(/\/projects\/[^/]+/)) return PROJECT_INLINE;
  if (pathname.includes("/me") || pathname.includes("/tasks")) return TASKS_INLINE;
  if (pathname.includes("/financing") || pathname.includes("/finance")) return FINANCE_INLINE;
  if (pathname.includes("/estimates")) return ESTIMATES_INLINE;
  return DEFAULT_INLINE;
}

// ── Empty state actions ───────────────────────────────────────

const EMPTY_STATE_ACTIONS: QuickAction[] = [
  { label: "Огляд компанії", prompt: "Дай загальний огляд: скільки проєктів, бюджет, виручка, прострочені платежі", icon: BarChart3 },
  { label: "Мої завдання", prompt: "Які мої поточні завдання? Що найтерміновіше?", icon: ClipboardList },
  { label: "Прострочене", prompt: "Є щось прострочене? Платежі, завдання, дедлайни", icon: AlertTriangle },
  { label: "Пошук підрядника", prompt: "Допоможи знайти підрядника для демонтажних робіт", icon: Search },
  { label: "Фін. звіт", prompt: "Зроби детальний фінансовий аналіз за останні 3 місяці", icon: TrendingUp },
  { label: "Як користуватись?", prompt: "Розкажи основні функції платформи Metrum", icon: HelpCircle },
];

type Props = {
  onAction: (prompt: string) => void;
  variant: "inline" | "empty-state";
  pathname?: string;
  disabled?: boolean;
};

export function AiQuickActions({ onAction, variant, pathname = "", disabled }: Props) {
  const actions = variant === "empty-state" ? EMPTY_STATE_ACTIONS : getInlineActions(pathname);

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
