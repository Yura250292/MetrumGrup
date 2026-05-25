import {
  LayoutDashboard,
  FolderKanban,
  Package,
  Users,
  Truck,
  Warehouse,
  HardHat,
  Globe,
  Settings,
  Table,
  MessageSquare,
  Activity,
  Building2,
  FileText,
  ListTodo,
  Wallet,
  Mic,
  ScanLine,
  TrendingUp,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  superAdminOnly?: boolean;
  hrAllowed?: boolean;
  /** Allowlist of roles. If set, ONLY listed roles see the item; other flags ignored. */
  roles?: readonly string[];
  showUnreadBadge?: boolean;
  /** Static pill badge — e.g. "NEW", "BETA". `color` picks the soft palette. */
  pillBadge?: {
    text: string;
    color: "accent" | "violet" | "amber" | "success" | "danger" | "teal";
  };
};

// Хто бачить фінансові пункти меню (cashflow, бюджети, strategic, reports).
// Збігається з FINANCE_ROLES у auth-utils. Правило: ЗП/cashflow/budgets бачить
// ТІЛЬКИ SUPER_ADMIN.
const FINANCE_VIEW_ROLES = ["SUPER_ADMIN"] as const;
// Чергу звітів виконробів — SUPER_ADMIN + FINANCIER (виступає як проджект-менеджер
// по фінансовій частині, approve породжує FinanceEntry). 2026-05-21.
const FOREMAN_REVIEW_ROLES = ["SUPER_ADMIN", "FINANCIER"] as const;
// Облік постачальників (Invoice/SupplierPayment): MANAGER + FINANCIER + SUPER_ADMIN.
// Збігається з SUPPLIER_LEDGER_ROLES у auth-utils. 2026-05-21.
const SUPPLIERS_ACCESS_ROLES = ["SUPER_ADMIN", "MANAGER", "FINANCIER"] as const;
// Manager-only analytics overlays на проєктному списку (огляд по проєктах).
const PROJECTS_MANAGER_ROLES = ["SUPER_ADMIN", "MANAGER"] as const;

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Sidebar navigation — 7-group intent-first structure.
// Plan: ADMIN_V2_UX_UI_SIMPLIFICATION_PLAN.md (Phase 1 IA cleanup, 2026-05-14).
// Принципи: сценарій > модуль; одна предметна область = одна група; рідкісне → «Ще».
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Головне",
    items: [
      { href: "/admin-v2", label: "Дашборд", icon: LayoutDashboard, exact: true, hrAllowed: true },
      { href: "/admin-v2/me", label: "Мої задачі", icon: ListTodo, hrAllowed: true },
      { href: "/admin-v2/team", label: "Команда", icon: Users, hrAllowed: true },
    ],
  },
  {
    label: "Проєкти",
    items: [
      { href: "/admin-v2/projects", label: "Проєкти", icon: FolderKanban },
      // «Огляд проєктів» — manager-only analytics; ховаємо у звичайних користувачів,
      // щоб не виглядало як дубль пункту «Проєкти».
      { href: "/admin-v2/projects/dashboard", label: "Огляд проєктів", icon: Table, roles: PROJECTS_MANAGER_ROLES },
    ],
  },
  {
    label: "Фінанси",
    items: [
      { href: "/admin-v2/financing", label: "Фінансування", icon: Wallet, roles: FINANCE_VIEW_ROLES },
      { href: "/admin-v2/foreman-reports", label: "Заявки виконробів", icon: HardHat, roles: FOREMAN_REVIEW_ROLES },
      { href: "/admin-v2/financing/suppliers", label: "Облік постачальників", icon: Truck, roles: SUPPLIERS_ACCESS_ROLES },
      { href: "/admin-v2/documents/inbox", label: "Документи / Inbox", icon: Inbox, roles: SUPPLIERS_ACCESS_ROLES, pillBadge: { text: "AI", color: "accent" } },
      // Кошториси: один пункт. Вхід «AI генератор» — primary CTA на самій сторінці.
      { href: "/admin-v2/estimates", label: "Кошториси", icon: FileText },
    ],
  },
  {
    label: "Комунікація",
    items: [
      { href: "/admin-v2/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true, hrAllowed: true },
      { href: "/admin-v2/meetings", label: "Наради", icon: Mic, superAdminOnly: true },
      { href: "/admin-v2/feed", label: "Активність", icon: Activity },
    ],
  },
  {
    label: "Довідники",
    items: [
      { href: "/admin-v2/counterparties", label: "Контрагенти", icon: Building2, hrAllowed: true },
      { href: "/admin-v2/catalogs/materials", label: "Матеріали та ціни", icon: Package },
      { href: "/admin-v2/resources/equipment", label: "Техніка", icon: Truck, hrAllowed: true },
      { href: "/admin-v2/resources/warehouse", label: "Склад", icon: Warehouse, hrAllowed: true },
      { href: "/admin-v2/resources/workers", label: "Робітники", icon: HardHat, hrAllowed: true },
    ],
  },
  {
    label: "HR",
    items: [
      { href: "/admin-v2/hr/employees", label: "Співробітники та акаунти", icon: Users, hrAllowed: true },
      { href: "/admin-v2/hr/subcontractors", label: "Підрядники", icon: HardHat, hrAllowed: true },
      { href: "/admin-v2/clients", label: "Клієнти", icon: Users, hrAllowed: true },
    ],
  },
  {
    label: "Ще",
    items: [
      { href: "/admin-v2/strategic-planning", label: "Стратегічне планування", icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
      { href: "/admin-v2/reports", label: "Звіти", icon: FileText, roles: FINANCE_VIEW_ROLES },
      { href: "/admin-v2/receipts", label: "Накладні (скан)", icon: ScanLine },
      { href: "/admin-v2/reference-estimates", label: "Довідкові кошториси", icon: FileText },
      { href: "/admin-v2/cms/portfolio", label: "Портфоліо", icon: Globe },
      { href: "/admin-v2/cms/news", label: "Новини", icon: Globe },
      { href: "/admin-v2/settings", label: "Налаштування", icon: Settings, superAdminOnly: true },
    ],
  },
];

// Mobile bottom-nav — 4 most-used daily entries. Rest reachable via "Ще" drawer.
// User-confirmed critical: Дашборд, Проєкти, Задачі, Чат.
export const MOBILE_NAV: NavItem[] = [
  { href: "/admin-v2", label: "Головна", icon: LayoutDashboard, exact: true },
  { href: "/admin-v2/projects", label: "Проєкти", icon: Building2 },
  { href: "/admin-v2/me", label: "Задачі", icon: ListTodo },
  { href: "/admin-v2/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true },
];

// Breadcrumb labels — keyed by full path
export const BREADCRUMB_MAP: Record<string, string> = {
  "/admin-v2": "Дашборд",
  "/admin-v2/me": "Мої задачі",
  "/admin-v2/team": "Команда",
  "/admin-v2/projects": "Проєкти",
  "/admin-v2/projects/new": "Новий проєкт",
  "/admin-v2/projects/dashboard": "Огляд проєктів",
  "/admin-v2/clients": "Клієнти",
  "/admin-v2/estimates": "Кошториси",
  "/admin-v2/estimates/new": "Новий кошторис",
  "/admin-v2/reference-estimates": "Довідкові кошториси",
  // Dynamic [id] segments — handled by header fallback
  "/admin-v2/materials": "Матеріали та ціни",
  "/admin-v2/catalogs/materials": "Матеріали та ціни",
  "/admin-v2/resources/equipment": "Техніка",
  "/admin-v2/resources/warehouse": "Склад",
  "/admin-v2/resources/workers": "Робітники",
  "/admin-v2/hr/employees": "Співробітники та акаунти",
  "/admin-v2/hr/subcontractors": "Підрядники",
  "/admin-v2/cms/portfolio": "Портфоліо",
  "/admin-v2/cms/news": "Новини",
  "/admin-v2/settings": "Налаштування",
  "/admin-v2/feed": "Активність",
  "/admin-v2/chat": "Чат",
  "/admin-v2/finance": "Фінансовий облік",
  "/admin-v2/finance/templates": "Шаблони",
  "/admin-v2/profile": "Мій профіль",
  "/admin-v2/financing": "Фінансування",
  "/admin-v2/strategic-planning": "Стратегічне планування",
  "/admin-v2/reports": "Звіти",
  "/admin-v2/foreman-reports": "Звіти виконробів",
  "/admin-v2/counterparties": "Контрагенти",
  "/admin-v2/financing/suppliers": "Постачальники",
  "/admin-v2/catalogs": "Довідники",
  "/admin-v2/receipts": "Накладні (скан)",
  "/admin-v2/receipts/scan": "Сканувати накладну",
  "/admin-v2/meetings": "Наради",
  "/admin-v2/meetings/new": "Нова нарада",
  "/admin": "Дашборд",
  "/admin/projects": "Проєкти",
  "/admin/projects/new": "Новий проєкт",
  "/admin/projects/dashboard": "Огляд проєктів",
  "/admin/clients": "Клієнти",
  "/admin/chat": "Чат",
  "/admin/feed": "Стрічка",
  "/admin/estimates": "Кошториси",
  "/admin/estimates/new": "Новий кошторис",
  "/admin/materials": "Матеріали та ціни",
  "/admin/resources/equipment": "Техніка",
  "/admin/resources/warehouse": "Склад",
  "/admin/resources/workers": "Бригади",
  "/admin/cms/portfolio": "Портфоліо",
  "/admin/cms/news": "Новини",
  "/admin/users": "Користувачі",
  "/admin/settings": "Налаштування",
  "/ai-estimate-v2": "AI Кошторис",
};

export function isItemActive(href: string, exact: boolean | undefined, pathname: string): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function isItemVisibleForRole(item: NavItem, role: string | undefined): boolean {
  // Explicit allowlist wins — if `roles` set, role MUST be in it.
  if (item.roles && (!role || !item.roles.includes(role))) return false;
  if (item.superAdminOnly && role !== "SUPER_ADMIN") return false;
  if (role === "HR" && !item.hrAllowed) return false;
  return true;
}

// Page prefixes HR can access — enforced both in nav filtering and (defensively) in API/page guards.
export const HR_ALLOWED_PREFIXES: string[] = [
  "/admin-v2",
  "/admin-v2/me",
  "/admin-v2/profile",
  "/admin-v2/clients",
  "/admin-v2/resources/equipment",
  "/admin-v2/resources/warehouse",
  "/admin-v2/resources/workers",
  "/admin-v2/hr",
  "/admin-v2/chat",
];
