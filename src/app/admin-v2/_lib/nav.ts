import {
  LayoutDashboard,
  FolderKanban,
  Calculator,
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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  superAdminOnly?: boolean;
  showUnreadBadge?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Sidebar navigation — 8-group calm enterprise structure.
// Головне / Проєкти / Фінанси / Кошторисна база / Ресурси / Комунікація / Контент / Адміністрування.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Головне",
    items: [
      { href: "/admin-v2", label: "Дашборд", icon: LayoutDashboard, exact: true },
      { href: "/admin-v2/me", label: "Мої задачі", icon: ListTodo },
    ],
  },
  {
    label: "Проєкти",
    items: [
      { href: "/admin-v2/projects", label: "Проєкти", icon: FolderKanban },
      { href: "/admin-v2/clients", label: "Клієнти", icon: Users },
      { href: "/admin-v2/projects/dashboard", label: "Огляд проєктів", icon: Table },
    ],
  },
  {
    label: "Фінанси",
    items: [
      { href: "/admin-v2/financing", label: "Фінансування", icon: Wallet },
      { href: "/admin-v2/finance", label: "Фінансовий облік", icon: Calculator },
    ],
  },
  {
    label: "Кошторисна база",
    items: [
      { href: "/ai-estimate-v2", label: "AI Кошторис", icon: Calculator },
      { href: "/admin-v2/estimates", label: "Усі кошториси", icon: FileText },
      { href: "/admin-v2/reference-estimates", label: "Довідкові кошториси", icon: FileText },
      { href: "/admin-v2/materials", label: "Матеріали та ціни", icon: Package },
    ],
  },
  {
    label: "Ресурси",
    items: [
      { href: "/admin-v2/resources/equipment", label: "Техніка", icon: Truck },
      { href: "/admin-v2/resources/warehouse", label: "Склад", icon: Warehouse },
      { href: "/admin-v2/resources/workers", label: "Бригади", icon: HardHat },
    ],
  },
  {
    label: "Комунікація",
    items: [
      { href: "/admin-v2/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true },
      { href: "/admin-v2/meetings", label: "Наради", icon: Mic },
      { href: "/admin-v2/feed", label: "Активність", icon: Activity },
    ],
  },
  {
    label: "Контент",
    items: [
      { href: "/admin-v2/cms/portfolio", label: "Портфоліо", icon: Globe },
      { href: "/admin-v2/cms/news", label: "Новини", icon: Globe },
    ],
  },
  {
    label: "Адміністрування",
    items: [
      { href: "/admin-v2/users", label: "Користувачі", icon: Users, superAdminOnly: true },
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
  "/admin-v2/projects": "Проєкти",
  "/admin-v2/projects/new": "Новий проєкт",
  "/admin-v2/projects/dashboard": "Огляд проєктів",
  "/admin-v2/clients": "Клієнти",
  "/admin-v2/estimates": "Кошториси",
  "/admin-v2/estimates/new": "Новий кошторис",
  "/admin-v2/reference-estimates": "Довідкові кошториси",
  // Dynamic [id] segments — handled by header fallback
  "/admin-v2/materials": "Матеріали та ціни",
  "/admin-v2/resources/equipment": "Техніка",
  "/admin-v2/resources/warehouse": "Склад",
  "/admin-v2/resources/workers": "Бригади",
  "/admin-v2/cms/portfolio": "Портфоліо",
  "/admin-v2/cms/news": "Новини",
  "/admin-v2/users": "Користувачі",
  "/admin-v2/settings": "Налаштування",
  "/admin-v2/feed": "Активність",
  "/admin-v2/chat": "Чат",
  "/admin-v2/finance": "Фінансовий облік",
  "/admin-v2/finance/templates": "Шаблони",
  "/admin-v2/profile": "Мій профіль",
  "/admin-v2/financing": "Фінансування",
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
