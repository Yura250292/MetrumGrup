"use client";

import type { ReactNode } from "react";
import {
  Sparkles,
  BellRing,
  LineChart,
  ListChecks,
  Users,
  Activity,
  FolderKanban,
  Compass,
  Brain,
  Wallet,
  MessageSquare,
  CheckSquare,
  Calendar,
  Home,
  TableProperties,
} from "lucide-react";
import type { WidgetSize, WidgetType } from "./layout-schema";
import { WIDGET_SIZES } from "./layout-schema";
import { ChatsWidget } from "./widgets/chats-widget";
import { MyTasksWidget } from "./widgets/my-tasks-widget";
import { MeetingsWidget } from "./widgets/meetings-widget";
import { FinanceQuickWidget } from "./widgets/finance-quick-widget";
import { PivotQuickWidget } from "./widgets/pivot-quick-widget";

export type WidgetRendererProps = {
  slot?: ReactNode;
};

export type WidgetDefinition = {
  type: WidgetType;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  defaultSize: WidgetSize;
  sizes: readonly WidgetSize[];
  /** If true, rendered by page.tsx server-side and injected via slots map. */
  serverRendered?: boolean;
  /** Client-side standalone renderer (only for new widgets). */
  Render?: (props: WidgetRendererProps) => ReactNode;
};

const ALL_SIZES = WIDGET_SIZES;
const WIDE_SIZES = ["2x1", "2x2", "3x1", "4x1", "4x2"] as const;
const COMPACT_SIZES = ["1x1", "2x1", "2x2"] as const;

export const WIDGET_REGISTRY: Record<WidgetType, WidgetDefinition> = {
  hero: {
    type: "hero",
    label: "Привітання",
    description: "Greeting-блок з ключовими метриками дня",
    icon: Home,
    defaultSize: "4x1",
    sizes: ["4x1", "4x2"],
    serverRendered: true,
  },
  "ai-summary": {
    type: "ai-summary",
    label: "AI-підсумок дня",
    description: "Коротка AI-вижимка що відбувається",
    icon: Sparkles,
    defaultSize: "4x1",
    sizes: ["2x1", "3x1", "4x1"],
    serverRendered: true,
  },
  attention: {
    type: "attention",
    label: "Потребує уваги",
    description: "Прострочені задачі, платежі, ризики",
    icon: BellRing,
    defaultSize: "4x1",
    sizes: ["2x2", "3x1", "4x1", "4x2"],
    serverRendered: true,
  },
  "kpi-business": {
    type: "kpi-business",
    label: "KPI бізнесу",
    description: "Основні бізнес-метрики",
    icon: LineChart,
    defaultSize: "2x1",
    sizes: COMPACT_SIZES,
    serverRendered: true,
  },
  "kpi-tasks": {
    type: "kpi-tasks",
    label: "KPI задач",
    description: "Активні/завершені/прострочені",
    icon: ListChecks,
    defaultSize: "2x1",
    sizes: COMPACT_SIZES,
    serverRendered: true,
  },
  "finance-pulse": {
    type: "finance-pulse",
    label: "Фінансова аналітика",
    description: "Надходження, витрати, чистий прибуток",
    icon: LineChart,
    defaultSize: "2x2",
    sizes: WIDE_SIZES,
    serverRendered: true,
  },
  stages: {
    type: "stages",
    label: "Етапи проєктів",
    description: "Розподіл по етапах",
    icon: Compass,
    defaultSize: "2x1",
    sizes: WIDE_SIZES,
    serverRendered: true,
  },
  team: {
    type: "team",
    label: "Team Pulse",
    description: "Завантаженість команди",
    icon: Users,
    defaultSize: "2x1",
    sizes: WIDE_SIZES,
    serverRendered: true,
  },
  activity: {
    type: "activity",
    label: "Активність",
    description: "Останні події системи",
    icon: Activity,
    defaultSize: "2x2",
    sizes: WIDE_SIZES,
    serverRendered: true,
  },
  "projects-risk": {
    type: "projects-risk",
    label: "Проєкти з ризиками",
    description: "Топ ризикових проєктів",
    icon: FolderKanban,
    defaultSize: "4x2",
    sizes: WIDE_SIZES,
    serverRendered: true,
  },
  utility: {
    type: "utility",
    label: "Бічна панель",
    description: "Найближчі дедлайни й швидкі дії",
    icon: Compass,
    defaultSize: "2x2",
    sizes: WIDE_SIZES,
    serverRendered: true,
  },
  "ai-widget": {
    type: "ai-widget",
    label: "AI Інсайти",
    description: "Інсайти й рекомендації",
    icon: Brain,
    defaultSize: "2x2",
    sizes: WIDE_SIZES,
    serverRendered: true,
  },
  "finance-quick": {
    type: "finance-quick",
    label: "Фінансування · швидкий доступ",
    description: "Кільце балансу, швидкі дії та останні папки з показниками",
    icon: Wallet,
    defaultSize: "2x2",
    sizes: ["2x1", "2x2", "3x1", "4x2"],
    Render: () => <FinanceQuickWidget />,
  },
  chats: {
    type: "chats",
    label: "Чати",
    description: "Останні розмови та непрочитані",
    icon: MessageSquare,
    defaultSize: "2x1",
    sizes: COMPACT_SIZES,
    Render: () => <ChatsWidget />,
  },
  "my-tasks": {
    type: "my-tasks",
    label: "Мої завдання",
    description: "Ваші активні задачі",
    icon: CheckSquare,
    defaultSize: "2x2",
    sizes: WIDE_SIZES,
    Render: () => <MyTasksWidget />,
  },
  meetings: {
    type: "meetings",
    label: "Наради",
    description: "Найближчі зустрічі та посилання для входу",
    icon: Calendar,
    defaultSize: "2x1",
    sizes: WIDE_SIZES,
    Render: () => <MeetingsWidget />,
  },
  "pivot-quick": {
    type: "pivot-quick",
    label: "Зведена таблиця · міні",
    description: "Топ проєктів за чистим прибутком за останні 3 місяці",
    icon: TableProperties,
    defaultSize: "4x2",
    sizes: ["2x2", "3x1", "4x2"],
    Render: () => <PivotQuickWidget />,
  },
};

export const WIDGET_LIST: WidgetDefinition[] = Object.values(WIDGET_REGISTRY);

export function getSizeClasses(size: WidgetSize): string {
  switch (size) {
    case "1x1":
      return "col-span-12 sm:col-span-6 lg:col-span-3 row-span-1";
    case "2x1":
      return "col-span-12 sm:col-span-6 lg:col-span-6 row-span-1";
    case "2x2":
      return "col-span-12 sm:col-span-6 lg:col-span-6 row-span-2";
    case "3x1":
      return "col-span-12 lg:col-span-9 row-span-1";
    case "4x1":
      return "col-span-12 row-span-1";
    case "4x2":
      return "col-span-12 row-span-2";
    default:
      return "col-span-12 row-span-1";
  }
}

export { ALL_SIZES };
