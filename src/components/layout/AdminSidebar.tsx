"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  LogOut,
  ChevronLeft,
  Menu,
  Table,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  superAdminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
  colorTheme: "blue" | "purple" | "orange" | "cyan" | "red";
};

const navGroups: NavGroup[] = [
  {
    label: "Головне",
    colorTheme: "blue",
    items: [
      { href: "/admin", label: "Дашборд", icon: LayoutDashboard, exact: true },
      { href: "/admin/projects", label: "Проєкти", icon: FolderKanban },
      { href: "/admin/projects/dashboard", label: "Огляд проєктів", icon: Table },
      { href: "/admin/clients", label: "Клієнти", icon: Users },
    ],
  },
  {
    label: "Фінанси",
    colorTheme: "purple",
    items: [
      { href: "/admin/estimates", label: "Кошториси", icon: Calculator },
      { href: "/admin/materials", label: "Матеріали та ціни", icon: Package },
    ],
  },
  {
    label: "Ресурси",
    colorTheme: "orange",
    items: [
      { href: "/admin/resources/equipment", label: "Техніка", icon: Truck },
      { href: "/admin/resources/warehouse", label: "Склад", icon: Warehouse },
      { href: "/admin/resources/workers", label: "Бригади", icon: HardHat },
    ],
  },
  {
    label: "Контент",
    colorTheme: "cyan",
    items: [
      { href: "/admin/cms/portfolio", label: "Портфоліо", icon: Globe },
      { href: "/admin/cms/news", label: "Новини", icon: Globe },
    ],
  },
  {
    label: "Система",
    colorTheme: "red",
    items: [
      { href: "/admin/users", label: "Користувачі", icon: Users, superAdminOnly: true },
      { href: "/admin/settings", label: "Налаштування", icon: Settings, superAdminOnly: true },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  // Color theme configurations for navigation items
  const colorThemes = {
    blue: {
      active: "admin-dark:bg-gradient-to-r admin-dark:from-blue-500/20 admin-dark:to-green-500/20 admin-dark:shadow-neon-blue-soft admin-light:bg-blue-50 admin-light:border admin-light:border-blue-200",
      icon: "admin-dark:text-blue-400 admin-light:text-blue-600",
      text: "admin-dark:text-blue-100 admin-light:text-blue-900",
      hover: "admin-dark:hover:bg-blue-500/10 admin-light:hover:bg-blue-50",
    },
    purple: {
      active: "admin-dark:bg-gradient-to-r admin-dark:from-purple-500/20 admin-dark:to-violet-500/20 admin-dark:shadow-[0_0_20px_rgba(168,85,247,0.15)] admin-light:bg-purple-50 admin-light:border admin-light:border-purple-200",
      icon: "admin-dark:text-purple-400 admin-light:text-purple-600",
      text: "admin-dark:text-purple-100 admin-light:text-purple-900",
      hover: "admin-dark:hover:bg-purple-500/10 admin-light:hover:bg-purple-50",
    },
    orange: {
      active: "admin-dark:bg-gradient-to-r admin-dark:from-orange-500/20 admin-dark:to-amber-500/20 admin-dark:shadow-[0_0_20px_rgba(251,146,60,0.15)] admin-light:bg-orange-50 admin-light:border admin-light:border-orange-200",
      icon: "admin-dark:text-orange-400 admin-light:text-orange-600",
      text: "admin-dark:text-orange-100 admin-light:text-orange-900",
      hover: "admin-dark:hover:bg-orange-500/10 admin-light:hover:bg-orange-50",
    },
    cyan: {
      active: "admin-dark:bg-gradient-to-r admin-dark:from-cyan-500/20 admin-dark:to-teal-500/20 admin-dark:shadow-[0_0_20px_rgba(34,211,238,0.15)] admin-light:bg-cyan-50 admin-light:border admin-light:border-cyan-200",
      icon: "admin-dark:text-cyan-400 admin-light:text-cyan-600",
      text: "admin-dark:text-cyan-100 admin-light:text-cyan-900",
      hover: "admin-dark:hover:bg-cyan-500/10 admin-light:hover:bg-cyan-50",
    },
    red: {
      active: "admin-dark:bg-gradient-to-r admin-dark:from-red-500/20 admin-dark:to-pink-500/20 admin-dark:shadow-[0_0_20px_rgba(239,68,68,0.15)] admin-light:bg-red-50 admin-light:border admin-light:border-red-200",
      icon: "admin-dark:text-red-400 admin-light:text-red-600",
      text: "admin-dark:text-red-100 admin-light:text-red-900",
      hover: "admin-dark:hover:bg-red-500/10 admin-light:hover:bg-red-50",
    },
  };

  return (
    <>
      {/* Mobile overlay */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden md:flex flex-col border-r transition-all duration-300 shadow-lg",
          "admin-dark:border-white/10 admin-dark:bg-gradient-to-b admin-dark:from-gray-900 admin-dark:to-black admin-dark:backdrop-blur-xl",
          "admin-light:border-gray-200 admin-light:bg-white",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b admin-dark:border-white/10 admin-light:border-gray-200 px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img
                src="/images/metrum-logo.svg"
                alt="Metrum"
                className="h-5 w-auto admin-dark:brightness-0 admin-dark:invert admin-light:brightness-100"
              />
              <span className="text-[9px] admin-dark:text-gray-400 admin-light:text-gray-600 uppercase tracking-[0.15em] font-semibold">
                Адмін-панель
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              "admin-dark:text-gray-400 admin-dark:hover:bg-white/10 admin-dark:hover:text-white",
              "admin-light:text-gray-600 admin-light:hover:bg-gray-100 admin-light:hover:text-gray-900",
              collapsed && "mx-auto"
            )}
          >
            {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.superAdminOnly || isSuperAdmin
            );
            if (visibleItems.length === 0) return null;

            const theme = colorThemes[group.colorTheme];

            return (
              <div key={group.label} className="mb-4">
                {!collapsed && (
                  <p className="mb-2 px-4 text-[11px] font-bold uppercase tracking-wider admin-dark:text-gray-400 admin-light:text-gray-500">
                    {group.label}
                  </p>
                )}
                <div className="space-y-1 px-2">
                  {visibleItems.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-3 text-[16px] transition-all duration-200",
                          isActive
                            ? `${theme.active} ${theme.text} font-semibold admin-light:!text-gray-900`
                            : "admin-dark:text-gray-300 admin-light:text-gray-700 hover:admin-dark:text-white hover:admin-light:text-gray-900",
                          isActive ? "" : theme.hover,
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon className={cn(
                          "h-5 w-5 flex-shrink-0",
                          isActive ? theme.icon : ""
                        )} />
                        {!collapsed && <span className="font-medium">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Theme Toggle & User */}
        <div className="border-t admin-dark:border-white/10 admin-light:border-gray-200">
          {/* Theme Toggle */}
          {!collapsed && (
            <div className="p-3 border-b admin-dark:border-white/10 admin-light:border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium admin-dark:text-gray-300 admin-light:text-gray-700">
                  Тема
                </span>
                <ThemeToggle />
              </div>
            </div>
          )}

          {/* User Section */}
          <div className="p-3">
            <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
              {!collapsed && (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-green-500 text-white text-sm font-semibold flex-shrink-0">
                    {session?.user?.name?.charAt(0) || "A"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold admin-dark:text-white admin-light:text-gray-900">
                      {session?.user?.name}
                    </p>
                    <p className="truncate text-xs admin-dark:text-gray-400 admin-light:text-gray-600">
                      {session?.user?.role === "SUPER_ADMIN" ? "Адмін" : "Менеджер"}
                    </p>
                  </div>
                </>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className={cn(
                  "rounded-lg p-2 transition-colors",
                  "admin-dark:text-gray-400 admin-dark:hover:bg-white/10 admin-dark:hover:text-white",
                  "admin-light:text-gray-600 admin-light:hover:bg-gray-100 admin-light:hover:text-gray-900"
                )}
                title="Вийти"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
