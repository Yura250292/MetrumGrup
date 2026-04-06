"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderKanban, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Головна", icon: Home },
  { href: "/dashboard/projects", label: "Проєкти", icon: FolderKanban },
  { href: "/dashboard/finance", label: "Фінанси", icon: Wallet },
  { href: "/dashboard/profile", label: "Профіль", icon: User },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-glass-nav backdrop-blur-xl border-t border-blue-500/15 shadow-neon-top">
      <div className="flex items-center justify-between px-4 py-2 safe-area-pb">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-300",
                isActive
                  ? "text-gradient-neon shadow-neon-glow scale-105"
                  : "text-gray-400 hover:text-gray-300 hover:scale-105"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "h-[22px] w-[22px] transition-all duration-300",
                    isActive && "drop-shadow-neon"
                  )}
                />
                {isActive && (
                  <div className="absolute inset-0 blur-md bg-gradient-to-r from-blue-500 to-green-500 opacity-60 -z-10" />
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
