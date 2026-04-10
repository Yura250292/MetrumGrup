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
      { href: "/admin/projects", label: "Проєкти", icon: FolderKanban },
      { href: "/admin/projects/dashboard", label: "Огляд проєктів", icon: Table },
      { href: "/admin/clients", label: "Клієнти", icon: Users },
      { href: "/admin/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true },
      { href: "/admin/feed", label: "Стрічка", icon: Activity },
    ],
  },
  {
    label: "Фінанси",
    items: [
      // AI generator already redesigned — point straight to v2
      { href: "/ai-estimate-v2", label: "AI Кошторис", icon: Calculator },
      { href: "/admin/estimates", label: "Кошториси", icon: FileText },
      { href: "/admin/materials", label: "Матеріали та ціни", icon: Package },
    ],
  },
  {
    label: "Ресурси",
    items: [
      { href: "/admin/resources/equipment", label: "Техніка", icon: Truck },
      { href: "/admin/resources/warehouse", label: "Склад", icon: Warehouse },
      { href: "/admin/resources/workers", label: "Бригади", icon: HardHat },
    ],
  },
  {
    label: "Контент",
    items: [
      { href: "/admin/cms/portfolio", label: "Портфоліо", icon: Globe },
      { href: "/admin/cms/news", label: "Новини", icon: Globe },
    ],
  },
  {
    label: "Система",
    items: [
      { href: "/admin/users", label: "Користувачі", icon: Users, superAdminOnly: true },
      { href: "/admin/settings", label: "Налаштування", icon: Settings, superAdminOnly: true },
    ],
  },
];

// Mobile bottom-nav items
export const MOBILE_NAV: NavItem[] = [
  { href: "/admin-v2", label: "Головна", icon: LayoutDashboard, exact: true },
  { href: "/admin/projects", label: "Проєкти", icon: Building2 },
  { href: "/ai-estimate-v2", label: "AI", icon: Calculator },
  { href: "/admin/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true },
];

// Breadcrumb labels — keyed by full path
export const BREADCRUMB_MAP: Record<string, string> = {
  "/admin-v2": "Дашборд",
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
