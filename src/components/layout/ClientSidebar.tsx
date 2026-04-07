"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LayoutDashboard, FolderKanban, Bell, User, LogOut } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Огляд", icon: LayoutDashboard },
  { href: "/dashboard/projects", label: "Проєкти", icon: FolderKanban },
  { href: "/dashboard/notifications", label: "Сповіщення", icon: Bell },
  { href: "/dashboard/profile", label: "Профіль", icon: User },
];

export function ClientSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="hidden md:flex md:w-[260px] md:flex-col md:fixed md:inset-y-0 border-r admin-dark:border-white/10 admin-light:border-border/50 admin-dark:bg-gradient-to-b admin-dark:from-gray-900 admin-dark:to-black admin-light:bg-white transition-colors">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b admin-dark:border-white/10 admin-light:border-border/50 px-6">
        <img
          src="/images/metrum-logo.svg"
          alt="Metrum"
          className="h-5 w-auto admin-dark:brightness-0 admin-dark:invert admin-light:brightness-100"
        />
        <span className="text-[8px] admin-dark:text-gray-400 admin-light:text-muted-foreground uppercase tracking-[0.15em]">
          Кабінет клієнта
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "admin-dark:bg-gradient-to-r admin-dark:from-blue-500/20 admin-dark:to-green-500/20 admin-dark:text-blue-100 admin-dark:shadow-neon-blue-soft admin-light:bg-primary/10 admin-light:text-primary admin-light:shadow-sm"
                  : "admin-dark:text-gray-300 admin-dark:hover:bg-white/10 admin-dark:hover:text-white admin-light:text-muted-foreground admin-light:hover:bg-muted admin-light:hover:text-foreground"
              )}
            >
              <item.icon className={cn(
                "h-[18px] w-[18px]",
                isActive && "admin-dark:text-blue-400 admin-light:text-primary"
              )} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="border-t admin-dark:border-white/10 admin-light:border-border/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium admin-dark:text-gray-300 admin-light:text-gray-700">
            Тема
          </span>
          <ThemeToggle />
        </div>
      </div>

      {/* User info */}
      <div className="border-t admin-dark:border-white/10 admin-light:border-border/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-green-500 text-white text-xs font-bold shadow-lg">
            {session?.user?.name?.charAt(0) || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium admin-dark:text-white admin-light:text-gray-900">
              {session?.user?.name || "Користувач"}
            </p>
            <p className="truncate text-[11px] admin-dark:text-gray-400 admin-light:text-muted-foreground">
              {session?.user?.email}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg p-2 admin-dark:text-gray-400 admin-dark:hover:bg-white/10 admin-dark:hover:text-white admin-light:text-muted-foreground admin-light:hover:bg-muted admin-light:hover:text-foreground transition-colors"
            title="Вийти"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
