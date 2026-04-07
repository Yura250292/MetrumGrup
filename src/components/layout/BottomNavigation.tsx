"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderKanban, Wallet, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Головна", icon: Home },
  { href: "/dashboard/projects", label: "Проєкти", icon: FolderKanban },
  { href: "/dashboard/finance", label: "Фінанси", icon: Wallet },
  { href: "/dashboard/profile", label: "Профіль", icon: User },
];

export function BottomNavigation() {
  const pathname = usePathname();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="fixed bottom-20 left-4 right-4 admin-dark:bg-gray-900 admin-light:bg-white rounded-2xl shadow-2xl border admin-dark:border-white/10 admin-light:border-gray-200 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4 admin-dark:text-white admin-light:text-gray-900">
              Налаштування
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-base font-medium admin-dark:text-gray-300 admin-light:text-gray-700">
                Тема інтерфейсу
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden admin-dark:bg-glass-nav admin-light:bg-white/95 backdrop-blur-xl border-t admin-dark:border-blue-500/15 admin-light:border-gray-200 admin-dark:shadow-neon-top admin-light:shadow-lg transition-colors">
        <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
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
                    ? "admin-dark:text-gradient-neon admin-dark:shadow-neon-glow admin-light:text-blue-600 scale-105"
                    : "admin-dark:text-gray-400 admin-dark:hover:text-gray-300 admin-light:text-gray-600 admin-light:hover:text-gray-900 hover:scale-105"
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      "h-[22px] w-[22px] transition-all duration-300",
                      isActive && "admin-dark:drop-shadow-neon admin-light:text-blue-600"
                    )}
                  />
                  {isActive && (
                    <div className="absolute inset-0 blur-md bg-gradient-to-r from-blue-500 to-green-500 opacity-60 -z-10 admin-light:hidden" />
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  isActive && "admin-light:text-blue-600"
                )}>{item.label}</span>
              </Link>
            );
          })}

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-300",
              showSettings
                ? "admin-dark:text-gradient-neon admin-dark:shadow-neon-glow admin-light:text-blue-600 scale-105"
                : "admin-dark:text-gray-400 admin-dark:hover:text-gray-300 admin-light:text-gray-600 admin-light:hover:text-gray-900 hover:scale-105"
            )}
          >
            <div className="relative">
              <Settings
                className={cn(
                  "h-[22px] w-[22px] transition-all duration-300",
                  showSettings && "admin-dark:drop-shadow-neon admin-light:text-blue-600"
                )}
              />
              {showSettings && (
                <div className="absolute inset-0 blur-md bg-gradient-to-r from-blue-500 to-green-500 opacity-60 -z-10 admin-light:hidden" />
              )}
            </div>
            <span className={cn(
              "text-[10px] font-medium",
              showSettings && "admin-light:text-blue-600"
            )}>Налашт.</span>
          </button>
        </div>
      </nav>
    </>
  );
}
