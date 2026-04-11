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

// Sidebar navigation — mirrors legacy AdminSidebar groups, hrefs point to existing
// pages (legacy /admin/* for pages we haven't ported yet, /admin-v2 for the dashboard).
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Головне",
    items: [
      { href: "/admin-v2", label: "Дашборд", icon: LayoutDashboard, exact: true },
      { href: "/admin-v2/projects", label: "Проєкти", icon: FolderKanban },
      { href: "/admin-v2/projects/dashboard", label: "Огляд проєктів", icon: Table },
      { href: "/admin-v2/clients", label: "Клієнти", icon: Users },
      // Chat is too complex to redesign in v2 — keep legacy link
      { href: "/admin/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true },
      { href: "/admin-v2/feed", label: "Стрічка", icon: Activity },
    ],
  },
  {
    label: "Фінанси",
    items: [
      { href: "/ai-estimate-v2", label: "AI Кошторис", icon: Calculator },
      { href: "/admin-v2/estimates", label: "Кошториси", icon: FileText },
      { href: "/admin-v2/materials", label: "Матеріали та ціни", icon: Package },
      // Finance section not yet ported to v2 — keep legacy link
      { href: "/admin/finance", label: "Фінансовий облік", icon: Calculator },
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
    label: "Контент",
    items: [
      { href: "/admin-v2/cms/portfolio", label: "Портфоліо", icon: Globe },
      { href: "/admin-v2/cms/news", label: "Новини", icon: Globe },
    ],
  },
  {
    label: "Система",
    items: [
      { href: "/admin-v2/users", label: "Користувачі", icon: Users, superAdminOnly: true },
      { href: "/admin-v2/settings", label: "Налаштування", icon: Settings, superAdminOnly: true },
    ],
  },
];

// Mobile bottom-nav items
export const MOBILE_NAV: NavItem[] = [
  { href: "/admin-v2", label: "Головна", icon: LayoutDashboard, exact: true },
  { href: "/admin-v2/projects", label: "Проєкти", icon: Building2 },
  { href: "/ai-estimate-v2", label: "AI", icon: Calculator },
  { href: "/admin/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true },
];

// Breadcrumb labels — keyed by full path
export const BREADCRUMB_MAP: Record<string, string> = {
  "/admin-v2": "Дашборд",
  "/admin-v2/projects": "Проєкти",
  "/admin-v2/projects/new": "Новий проєкт",
  "/admin-v2/projects/dashboard": "Огляд проєктів",
  "/admin-v2/clients": "Клієнти",
  "/admin-v2/estimates": "Кошториси",
  "/admin-v2/estimates/new": "Новий кошторис",
  // Dynamic [id] segments — handled by header fallback
  "/admin-v2/materials": "Матеріали та ціни",
  "/admin-v2/resources/equipment": "Техніка",
  "/admin-v2/resources/warehouse": "Склад",
  "/admin-v2/resources/workers": "Бригади",
  "/admin-v2/cms/portfolio": "Портфоліо",
  "/admin-v2/cms/news": "Новини",
  "/admin-v2/users": "Користувачі",
  "/admin-v2/settings": "Налаштування",
  "/admin-v2/feed": "Стрічка",
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
