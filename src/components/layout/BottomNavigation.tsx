"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderKanban,
  Wallet,
  User,
  Settings,
  Bell,
  Camera,
  Sparkles,
  X,
  Check,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useEffect, useState } from "react";

/* ─── All possible nav items ─── */
type NavItemDef = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ALL_NAV_ITEMS: NavItemDef[] = [
  { id: "home", href: "/dashboard", label: "Головна", icon: Home },
  { id: "projects", href: "/dashboard/projects", label: "Проєкти", icon: FolderKanban },
  { id: "finance", href: "/dashboard/finance", label: "Фінанси", icon: Wallet },
  { id: "notifications", href: "/dashboard/notifications", label: "Сповіщення", icon: Bell },
  { id: "profile", href: "/dashboard/profile", label: "Профіль", icon: User },
  { id: "visualizer", href: "/dashboard/visualizer", label: "Візуалізація", icon: Sparkles },
];

const DEFAULT_VISIBLE = ["home", "projects", "finance", "profile"];
const STORAGE_KEY = "bottom-nav-items";
const MAX_ITEMS = 5;

function loadVisibleIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_VISIBLE;
}

function saveVisibleIds(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function BottomNavigation() {
  const pathname = usePathname();
  const [showSettings, setShowSettings] = useState(false);
  const [visibleIds, setVisibleIds] = useState<string[]>(DEFAULT_VISIBLE);
  const [editIds, setEditIds] = useState<string[]>([]);

  useEffect(() => {
    setVisibleIds(loadVisibleIds());
  }, []);

  const visibleItems = visibleIds
    .map((id) => ALL_NAV_ITEMS.find((item) => item.id === id))
    .filter(Boolean) as NavItemDef[];

  function openSettings() {
    setEditIds([...visibleIds]);
    setShowSettings(true);
  }

  function toggleItem(id: string) {
    setEditIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // min 2
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_ITEMS) return prev; // max 5
      return [...prev, id];
    });
  }

  function saveSettings() {
    setVisibleIds(editIds);
    saveVisibleIds(editIds);
    setShowSettings(false);
  }

  function resetToDefault() {
    setEditIds([...DEFAULT_VISIBLE]);
  }

  return (
    <>
      {/* ─── Settings sheet ─── */}
      {showSettings && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="fixed bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden animate-slide-up"
            style={{ maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet background */}
            <div className="admin-dark:bg-gray-900 admin-light:bg-white border-t admin-dark:border-white/10 admin-light:border-gray-200 shadow-2xl">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full admin-dark:bg-white/20 admin-light:bg-gray-300" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                <h3 className="text-base font-bold admin-dark:text-white admin-light:text-gray-900">
                  Налаштування панелі
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetToDefault}
                    className="text-[11px] font-medium admin-dark:text-gray-400 admin-light:text-gray-500"
                  >
                    Скинути
                  </button>
                  <button
                    onClick={saveSettings}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white bg-blue-500"
                  >
                    <Check size={14} />
                    Зберегти
                  </button>
                </div>
              </div>

              {/* Hint */}
              <p className="px-5 pb-2 text-[11px] admin-dark:text-gray-500 admin-light:text-gray-400">
                Оберіть 2–{MAX_ITEMS} кнопок для нижньої панелі
              </p>

              {/* Items grid */}
              <div className="px-5 pb-4 space-y-1.5">
                {ALL_NAV_ITEMS.map((item) => {
                  const selected = editIds.includes(item.id);
                  const Icon = item.icon;
                  const disabled = !selected && editIds.length >= MAX_ITEMS;

                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      disabled={disabled}
                      className={cn(
                        "flex items-center gap-3 w-full rounded-xl px-4 py-3 transition-all",
                        selected
                          ? "admin-dark:bg-blue-500/15 admin-dark:border-blue-500/30 admin-light:bg-blue-50 admin-light:border-blue-200 border"
                          : disabled
                            ? "opacity-40 admin-dark:bg-white/5 admin-light:bg-gray-50 border border-transparent"
                            : "admin-dark:bg-white/5 admin-dark:hover:bg-white/10 admin-light:bg-gray-50 admin-light:hover:bg-gray-100 border border-transparent"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
                          selected
                            ? "admin-dark:bg-blue-500/20 admin-light:bg-blue-100"
                            : "admin-dark:bg-white/10 admin-light:bg-gray-200"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px]",
                            selected
                              ? "admin-dark:text-blue-400 admin-light:text-blue-600"
                              : "admin-dark:text-gray-400 admin-light:text-gray-500"
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium flex-1 text-left",
                          selected
                            ? "admin-dark:text-white admin-light:text-gray-900"
                            : "admin-dark:text-gray-400 admin-light:text-gray-600"
                        )}
                      >
                        {item.label}
                      </span>
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all flex-shrink-0",
                          selected
                            ? "bg-blue-500 border-blue-500"
                            : "admin-dark:border-gray-600 admin-light:border-gray-300"
                        )}
                      >
                        {selected && <Check size={12} className="text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Theme toggle */}
              <div className="border-t admin-dark:border-white/10 admin-light:border-gray-200 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium admin-dark:text-gray-300 admin-light:text-gray-700">
                    Тема інтерфейсу
                  </span>
                  <ThemeToggle />
                </div>
              </div>

              {/* Safe area spacer */}
              <div className="safe-area-pb" />
            </div>
          </div>
        </div>
      )}

      {/* ─── Bottom nav bar ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden admin-dark:bg-glass-nav admin-light:bg-white/95 backdrop-blur-xl border-t admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:shadow-neon-top admin-light:shadow-[0_-2px_10px_rgba(0,0,0,0.06)] transition-colors">
        <div className="flex items-stretch justify-around safe-area-pb">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] transition-all duration-200",
                  isActive
                    ? "admin-dark:text-blue-400 admin-light:text-blue-600"
                    : "admin-dark:text-gray-500 admin-light:text-gray-400 active:scale-95"
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      "h-[22px] w-[22px] transition-all duration-200",
                      isActive && "admin-dark:drop-shadow-neon"
                    )}
                  />
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-blue-500" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-tight font-medium",
                    isActive ? "font-semibold" : ""
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Settings button */}
          <button
            onClick={openSettings}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] transition-all duration-200",
              showSettings
                ? "admin-dark:text-blue-400 admin-light:text-blue-600"
                : "admin-dark:text-gray-500 admin-light:text-gray-400 active:scale-95"
            )}
          >
            <Settings
              className={cn(
                "h-[22px] w-[22px] transition-all duration-200",
                showSettings && "admin-dark:drop-shadow-neon"
              )}
            />
            <span className="text-[10px] leading-tight font-medium">Ще</span>
          </button>
        </div>
      </nav>

      {/* slide-up animation */}
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1);
        }
      `}</style>
    </>
  );
}
