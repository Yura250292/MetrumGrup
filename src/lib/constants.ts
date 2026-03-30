import { ProjectStage, ProjectStatus, PaymentStatus, EstimateStatus, EquipmentStatus, StageStatus } from "@prisma/client";

export const STAGE_LABELS: Record<ProjectStage, string> = {
  DESIGN: "Проєктування",
  FOUNDATION: "Фундамент",
  WALLS: "Стіни",
  ROOF: "Дах",
  ENGINEERING: "Інженерія",
  FINISHING: "Оздоблення",
  HANDOVER: "Здача",
};

export const STAGE_ORDER: ProjectStage[] = [
  "DESIGN",
  "FOUNDATION",
  "WALLS",
  "ROOF",
  "ENGINEERING",
  "FINISHING",
  "HANDOVER",
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Чернетка",
  ACTIVE: "Активний",
  ON_HOLD: "Призупинено",
  COMPLETED: "Завершено",
  CANCELLED: "Скасовано",
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  ACTIVE: "bg-green-50 text-green-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  PENDING: "Очікує",
  IN_PROGRESS: "В процесі",
  COMPLETED: "Завершено",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Очікує",
  PARTIAL: "Частково",
  PAID: "Сплачено",
  OVERDUE: "Прострочено",
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PARTIAL: "bg-orange-50 text-orange-700",
  PAID: "bg-green-50 text-green-700",
  OVERDUE: "bg-red-50 text-red-700",
};

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  DRAFT: "Чернетка",
  SENT: "Надіслано",
  APPROVED: "Затверджено",
  REJECTED: "Відхилено",
  REVISION: "На доопрацюванні",
  ENGINEER_REVIEW: "Перевірка інженером",
  FINANCE_REVIEW: "Перевірка фінансистом",
};

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  AVAILABLE: "Доступна",
  IN_USE: "В роботі",
  MAINTENANCE: "На обслуговуванні",
  DECOMMISSIONED: "Списана",
};

export const SERVICE_CATEGORIES = [
  { id: "construction", label: "Будівництво", icon: "Building2" },
  { id: "renovation", label: "Ремонт", icon: "Hammer" },
  { id: "design", label: "Дизайн", icon: "Palette" },
  { id: "cleaning", label: "Клінінг", icon: "Sparkles" },
] as const;

export const PROJECT_TEMPLATES = [
  {
    id: "foundation",
    label: "Фундамент",
    icon: "🏗️",
    description: "Тільки фундаментні роботи",
    categories: ["earthworks", "foundation"],
  },
  {
    id: "shell",
    label: "Коробка",
    icon: "🏠",
    description: "Будівництво коробки без оздоблення",
    categories: ["foundation", "walls", "ceiling", "roof"],
  },
  {
    id: "turnkey",
    label: "Під ключ",
    icon: "✨",
    description: "Повний ремонт з усіма роботами",
    categories: [
      "demolition", "walls", "ceiling", "floor", "electrical",
      "plumbing", "heating", "windows", "finishing", "kitchen", "bathroom"
    ],
  },
  {
    id: "house_full",
    label: "Будинок (повний)",
    icon: "🏘️",
    description: "Будівництво повного будинку",
    categories: [
      "earthworks", "foundation", "walls", "ceiling", "roof",
      "electrical", "plumbing", "heating", "windows", "facade"
    ],
  },
  {
    id: "apartment_rough",
    label: "Квартира (чорнові)",
    icon: "🔨",
    description: "Чорнове оздоблення квартири",
    categories: [
      "demolition", "walls", "ceiling", "floor", "electrical", "plumbing"
    ],
  },
  {
    id: "custom",
    label: "Власний вибір",
    icon: "⚙️",
    description: "Оберіть категорії самостійно",
    categories: [],
  },
] as const;

export type ProjectTemplateId = typeof PROJECT_TEMPLATES[number]["id"];
