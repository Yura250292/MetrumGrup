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
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  superAdminOnly?: boolean;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Головне",
    items: [
      { href: "/admin", label: "Дашборд", icon: LayoutDashboard, exact: true },
      { href: "/admin/projects", label: "Проєкти", icon: FolderKanban },
      { href: "/admin/clients", label: "Клієнти", icon: Users },
    ],
  },
  {
    label: "Фінанси",
    items: [
      { href: "/admin/estimates", label: "Кошториси", icon: Calculator },
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

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  return (
    <>
      {/* Mobile overlay */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden md:flex flex-col border-r border-border/50 bg-white transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border/50 px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img src="/images/metrum-logo.svg" alt="Metrum" className="h-5 w-auto" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-[0.15em]">Адмін-панель</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
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

            return (
              <div key={group.label} className="mb-4">
                {!collapsed && (
                  <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200",
                          isActive
                            ? "bg-primary/10 text-primary font-semibold shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon className="h-4.5 w-4.5 flex-shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t p-3">
          <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
            {!collapsed && (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                  {session?.user?.name?.charAt(0) || "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">
                    {session?.user?.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {session?.user?.role === "SUPER_ADMIN" ? "Адмін" : "Менеджер"}
                  </p>
                </div>
              </>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
