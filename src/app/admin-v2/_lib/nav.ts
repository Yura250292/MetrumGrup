import {
  LayoutDashboard,
  FolderKanban,
  Package,
  Users,
  Truck,
  Warehouse,
  HardHat,
  Globe,
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
  ClipboardList,
  ClipboardCheck,
  FileSignature,
  HelpCircle,
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
  /** Якщо задано — у sidebar додаємо pending-count бейдж з useInboxCounts(). */
  inboxKey?: "foremanReports" | "documents" | "receipts" | "formSubmissions";
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
// Зміни в кошторисах: інженери + менеджери. SUPER_ADMIN бачить усе.
const CHANGE_ORDER_ROLES = ["SUPER_ADMIN", "MANAGER", "ENGINEER"] as const;
// Procurement (PR/RFQ/PO): тільки керівники закупівель.
const PROCUREMENT_ROLES = ["SUPER_ADMIN", "MANAGER", "FINANCIER"] as const;

export type NavGroup = {
  label: string;
  items: NavItem[];
  /** Якщо true — група згорнута на першому візиті (юзер ще не клацав).
   *  Користувачева перевага у localStorage завжди має пріоритет. */
  collapsedByDefault?: boolean;
};

// Sidebar navigation — після аудиту дублів 2026-05-26.
// Принципи:
// • 15 видимих пунктів замість 30 — рідкісне через табування дублів.
// • Кошториси / Дод. угоди / Довідкові — таби на /estimates.
// • Штат / Підрядники / Бригади — таби на /hr/employees.
// • Контрагенти / Клієнти — таби на /counterparties.
// • Мої / Усі задачі — таби на /me (раніше окреме «Команда»).
// • Документи AI / Накладні / Форми / CMS — в «Менш популярне» (default-collapsed).
// • inbox-counts бейджі (amber) лишаються на 4 чергах через inboxKey.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Головне",
    items: [
      { href: "/admin-v2/dashboard-v2", label: "Дашборд", icon: LayoutDashboard, hrAllowed: true },
      { href: "/admin-v2/me", label: "Мої задачі", icon: ListTodo, hrAllowed: true },
      { href: "/admin-v2/chat", label: "Чат", icon: MessageSquare, showUnreadBadge: true, hrAllowed: true },
      { href: "/admin-v2/feed", label: "Стрічка активності", icon: Activity },
    ],
  },
  {
    label: "Проєкти",
    items: [
      { href: "/admin-v2/projects", label: "Проєкти", icon: FolderKanban },
      { href: "/admin-v2/tasks", label: "Задачі", icon: ListTodo },
      { href: "/admin-v2/estimates", label: "Кошториси", icon: FileText },
      { href: "/admin-v2/change-orders-v2", label: "Зміни в кошторисах", icon: FileSignature, roles: CHANGE_ORDER_ROLES },
      { href: "/admin-v2/rfis-v2", label: "RFI (запити)", icon: HelpCircle },
      { href: "/admin-v2/meetings-v2", label: "Наради", icon: Mic, superAdminOnly: true },
      { href: "/admin-v2/foreman-reports-v2", label: "Заявки виконробів", icon: HardHat, roles: FOREMAN_REVIEW_ROLES, inboxKey: "foremanReports" },
    ],
  },
  {
    label: "Фінанси",
    items: [
      { href: "/admin-v2/financing-v2", label: "Фінансування", icon: Wallet, roles: FINANCE_VIEW_ROLES },
      { href: "/admin-v2/financing/suppliers", label: "Постачальники", icon: Truck, roles: SUPPLIERS_ACCESS_ROLES },
      { href: "/admin-v2/procurement", label: "Закупівлі (RFQ)", icon: ClipboardList, roles: PROCUREMENT_ROLES, pillBadge: { text: "BETA", color: "amber" } },
      { href: "/admin-v2/strategic-planning", label: "Стратегічне планування", icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
      { href: "/admin-v2/reports", label: "Звіти", icon: FileText, roles: FINANCE_VIEW_ROLES },
    ],
  },
  {
    label: "Персонал",
    items: [
      // «Штат» — основна точка входу, всередині таби: Співробітники / Підрядники / Бригади
      { href: "/admin-v2/hr/employees", label: "Штат", icon: Users, hrAllowed: true },
    ],
  },
  {
    label: "Ресурси",
    items: [
      // «Контрагенти» — раніше «Партнери» в «Персоналі»; це довідник зовнішніх
      // сторін (клієнти / постачальники / підрядники) — належить до reference-data.
      { href: "/admin-v2/counterparties-v2", label: "Контрагенти", icon: Building2, hrAllowed: true },
      { href: "/admin-v2/materials-v2", label: "Матеріали і ціни", icon: Package },
      { href: "/admin-v2/resources/warehouse", label: "Склад", icon: Warehouse, hrAllowed: true },
      { href: "/admin-v2/resources/equipment", label: "Техніка", icon: Truck, hrAllowed: true },
      { href: "/admin-v2/catalogs/form-templates", label: "Шаблони форм", icon: ClipboardList, hrAllowed: true },
    ],
  },
  {
    label: "Менш популярне",
    collapsedByDefault: true,
    items: [
      { href: "/admin-v2/documents/inbox", label: "Документи AI", icon: Inbox, roles: SUPPLIERS_ACCESS_ROLES, pillBadge: { text: "AI", color: "accent" }, inboxKey: "documents" },
      { href: "/admin-v2/receipts-v2", label: "Накладні (скан)", icon: ScanLine, inboxKey: "receipts" },
      { href: "/admin-v2/queue/form-submissions", label: "Заповнені форми", icon: ClipboardCheck, hrAllowed: true, inboxKey: "formSubmissions" },
      { href: "/admin-v2/cms/portfolio", label: "Портфоліо", icon: Globe },
      { href: "/admin-v2/cms/news", label: "Новини", icon: Globe },
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
  "/admin-v2/rfis": "RFI (Запити)",
  "/admin-v2/change-orders": "Зміни в кошторисах",
  "/admin-v2/procurement": "Закупівлі (RFQ)",
  "/admin-v2/procurement/requests": "Заявки на закупівлю",
  "/admin-v2/procurement/rfqs": "RFQ",
  "/admin-v2/procurement/orders": "PO (замовлення)",
  "/admin-v2/settings/firm/rfi-sla": "SLA для RFI",
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
  "/admin-v2/catalogs/form-templates": "Шаблони форм",
  "/admin-v2/queue/form-submissions": "Заповнені форми",
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
