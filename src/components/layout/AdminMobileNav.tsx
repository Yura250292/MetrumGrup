"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Building2, FileText, MessageSquare, LogOut } from "lucide-react";
import { useUnreadChatCount } from "@/hooks/useChat";

const navItems = [
  { href: "/admin", label: "Головна", icon: LayoutDashboard, colorTheme: "blue" as const, showUnreadBadge: false },
  { href: "/admin/projects", label: "Проєкти", icon: Building2, colorTheme: "blue" as const, showUnreadBadge: false },
  { href: "/admin/estimates", label: "Кошториси", icon: FileText, colorTheme: "purple" as const, showUnreadBadge: false },
  { href: "/admin/chat", label: "Чат", icon: MessageSquare, colorTheme: "blue" as const, showUnreadBadge: true },
];

export function AdminMobileNav() {
  const pathname = usePathname();
  const unreadChatCount = useUnreadChatCount();

  const colorThemes = {
    blue: {
      active: "admin-dark:bg-gradient-to-r admin-dark:from-blue-500/20 admin-dark:to-green-500/20 admin-dark:shadow-neon-blue-soft admin-light:bg-blue-100",
      icon: "admin-dark:text-blue-400 admin-light:text-blue-600",
    },
    purple: {
      active: "admin-dark:bg-gradient-to-r admin-dark:from-purple-500/20 admin-dark:to-violet-500/20 admin-dark:shadow-[0_0_20px_rgba(168,85,247,0.15)] admin-light:bg-purple-100",
      icon: "admin-dark:text-purple-400 admin-light:text-purple-600",
    },
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl md:hidden safe-area-pb shadow-lg transition-colors admin-dark:border-white/10 admin-dark:bg-gradient-to-r admin-dark:from-gray-900/95 admin-dark:via-black/95 admin-dark:to-gray-900/95 admin-light:border-gray-200 admin-light:bg-white/95">
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          const theme = colorThemes[item.colorTheme];

          const badge = item.showUnreadBadge ? unreadChatCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 w-16 h-12 rounded-lg transition-all duration-200",
                isActive
                  ? `admin-dark:text-white admin-light:text-gray-900 ${theme.active}`
                  : "admin-dark:text-gray-300 admin-dark:hover:bg-white/10 admin-dark:hover:text-white admin-light:text-gray-600 admin-light:hover:bg-gray-100 admin-light:hover:text-gray-900"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? theme.icon : "")} />
              <span className="text-[12px] font-semibold">{item.label}</span>
              {badge > 0 && (
                <span className="absolute top-0 right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Logout button */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex flex-col items-center justify-center gap-1 w-16 h-12 rounded-lg transition-all duration-200 admin-dark:text-gray-400 admin-dark:hover:bg-white/10 admin-dark:hover:text-white admin-light:text-gray-600 admin-light:hover:bg-gray-100 admin-light:hover:text-gray-900 active:scale-95"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[11px] font-semibold">Вийти</span>
        </button>
      </div>
    </nav>
  );
}
