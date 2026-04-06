"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState } from "react";
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

  // Color theme configurations
  const colorThemes = {
    blue: {
      active: "bg-gradient-to-r from-blue-500/20 to-green-500/20 shadow-neon-blue-soft",
      icon: "text-blue-400",
      text: "text-blue-100",
      hover: "hover:bg-blue-500/10",
    },
    purple: {
      active: "bg-gradient-to-r from-purple-500/20 to-violet-500/20 shadow-[0_0_20px_rgba(168,85,247,0.15)]",
      icon: "text-purple-400",
      text: "text-purple-100",
      hover: "hover:bg-purple-500/10",
    },
    orange: {
      active: "bg-gradient-to-r from-orange-500/20 to-amber-500/20 shadow-[0_0_20px_rgba(251,146,60,0.15)]",
      icon: "text-orange-400",
      text: "text-orange-100",
      hover: "hover:bg-orange-500/10",
    },
    cyan: {
      active: "bg-gradient-to-r from-cyan-500/20 to-teal-500/20 shadow-[0_0_20px_rgba(34,211,238,0.15)]",
      icon: "text-cyan-400",
      text: "text-cyan-100",
      hover: "hover:bg-cyan-500/10",
    },
    red: {
      active: "bg-gradient-to-r from-red-500/20 to-pink-500/20 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
      icon: "text-red-400",
      text: "text-red-100",
      hover: "hover:bg-red-500/10",
    },
  };

  return (
    <>
      {/* Mobile overlay */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden md:flex flex-col border-r border-white/10 bg-gradient-to-b from-gray-900 to-black backdrop-blur-xl transition-all duration-300 shadow-lg",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img src="/images/metrum-logo.svg" alt="Metrum" className="h-5 w-auto brightness-0 invert" />
              <span className="text-[8px] text-gray-400 uppercase tracking-[0.15em]">Адмін-панель</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors",
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
                  <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5 px-2">
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
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-all duration-200",
                          isActive
                            ? `${theme.active} ${theme.text} font-semibold`
                            : `text-gray-300 ${theme.hover} hover:text-white`,
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon className={cn(
                          "h-[18px] w-[18px] flex-shrink-0",
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

        {/* User */}
        <div className="border-t border-white/10 p-3">
          <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
            {!collapsed && (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-green-500 text-white text-xs font-medium flex-shrink-0">
                  {session?.user?.name?.charAt(0) || "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-white">
                    {session?.user?.name}
                  </p>
                  <p className="truncate text-[10px] text-gray-400">
                    {session?.user?.role === "SUPER_ADMIN" ? "Адмін" : "Менеджер"}
                  </p>
                </div>
              </>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              title="Вийти"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
