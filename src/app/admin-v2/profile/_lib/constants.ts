import {
  User,
  Camera,
  FileText,
  Shield,
  Bell,
  MessageCircle,
  Send,
  Settings,
  Clock,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { ProfileSection, NotificationPrefs, ProductivityPrefs, NotificationCategory, NotificationChannel } from "./types";

export type SectionDef = {
  id: ProfileSection;
  label: string;
  icon: LucideIcon;
};

export const SECTIONS: SectionDef[] = [
  { id: "basic", label: "Основне", icon: User },
  { id: "avatar", label: "Аватар", icon: Camera },
  { id: "about", label: "Про мене", icon: FileText },
  { id: "role", label: "Роль і повноваження", icon: Shield },
  { id: "notifications", label: "Сповіщення", icon: Bell },
  { id: "telegram", label: "Telegram бот", icon: Send },
  { id: "quickChat", label: "Швидкий чат", icon: MessageCircle },
  { id: "workSettings", label: "Робочі налаштування", icon: Settings },
  { id: "productivity", label: "Час і продуктивність", icon: Clock },
  { id: "security", label: "Безпека", icon: Lock },
];

export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: "taskAssignment", label: "Нові призначення на задачі" },
  { key: "taskStatusChange", label: "Зміна статусу задачі" },
  { key: "taskComment", label: "Коментарі в задачах" },
  { key: "mention", label: "Згадки @mention" },
  { key: "deadlineToday", label: "Дедлайн сьогодні" },
  { key: "overdueTask", label: "Прострочені задачі" },
  { key: "chatMessage", label: "Нові повідомлення в чаті" },
  { key: "projectChange", label: "Зміни у проєктах" },
  { key: "systemEvent", label: "Системні події" },
  { key: "financeReview", label: "Фінансові погодження" },
];

export const NOTIFICATION_CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: "inApp", label: "У системі" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
  { key: "telegram", label: "Telegram" },
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  channels: { inApp: true, email: true, push: false, telegram: false },
  categories: Object.fromEntries(
    [
      "taskAssignment", "taskStatusChange", "taskComment", "mention",
      "deadlineToday", "overdueTask", "chatMessage", "projectChange",
      "systemEvent", "financeReview",
    ].map((k) => [k, { inApp: true, email: false, push: false, telegram: false }])
  ) as NotificationPrefs["categories"],
  mode: "all",
};

export const DEFAULT_PRODUCTIVITY_PREFS: ProductivityPrefs = {
  workingDays: [1, 2, 3, 4, 5],
  workStartTime: "09:00",
  workEndTime: "18:00",
  dailyHourNorm: 8,
  timerAutoStop: true,
  timerLongRunningReminder: true,
  timerLongRunningMinutes: 120,
  timerConfirmStop: false,
  showTimeInMyTasks: true,
  remindNoTimeLog: false,
  remindEndOfDay: false,
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Супер-адміністратор",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  HR: "HR",
  CLIENT: "Клієнт",
  USER: "Користувач",
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    "Повний доступ до системи",
    "Управління користувачами",
    "Управління налаштуваннями",
    "Перегляд фінансів та звітів",
    "Управління автоматизаціями",
  ],
  MANAGER: [
    "Створення та редагування задач",
    "Призначення виконавців",
    "Управління проєктами",
    "Ведення часу",
    "Перегляд звітів",
  ],
  ENGINEER: [
    "Перегляд призначених задач",
    "Ведення часу",
    "Коментування задач",
    "Перегляд кошторисів",
  ],
  FINANCIER: [
    "Перегляд фінансових звітів",
    "Погодження кошторисів",
    "Перегляд cost reports",
    "Фінансовий облік",
  ],
  HR: [
    "Ведення співробітників, контрагентів, підрядників",
    "Перегляд клієнтів, техніки, складу, бригад",
    "Участь у чатах і нарадах",
    "Без доступу до кошторисів і фінансів",
  ],
  CLIENT: [
    "Перегляд власних проєктів",
    "Коментування",
    "Перегляд прогресу",
  ],
  USER: [
    "Базовий доступ",
  ],
};

export const TIMEZONES = [
  { value: "Europe/Kyiv", label: "Київ (UTC+2/+3)" },
  { value: "Europe/Warsaw", label: "Варшава (UTC+1/+2)" },
  { value: "Europe/London", label: "Лондон (UTC+0/+1)" },
  { value: "Europe/Berlin", label: "Берлін (UTC+1/+2)" },
  { value: "America/New_York", label: "Нью-Йорк (UTC-5/-4)" },
  { value: "Asia/Istanbul", label: "Стамбул (UTC+3)" },
];

export const DATE_FORMATS = [
  { value: "DD.MM.YYYY", label: "31.12.2025" },
  { value: "DD/MM/YYYY", label: "31/12/2025" },
  { value: "YYYY-MM-DD", label: "2025-12-31" },
  { value: "MM/DD/YYYY", label: "12/31/2025" },
];

export const TASK_VIEW_OPTIONS = [
  { value: "list", label: "Список" },
  { value: "kanban", label: "Kanban" },
  { value: "calendar", label: "Календар" },
  { value: "people", label: "По людях" },
];

export const LANDING_PAGE_OPTIONS = [
  { value: "dashboard", label: "Дашборд" },
  { value: "my-tasks", label: "Мої задачі" },
  { value: "projects", label: "Проєкти" },
  { value: "chat", label: "Чат" },
];

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Нд" },
];
