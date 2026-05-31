"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { motion } from "framer-motion";
import { ArrowLeft, MoreHorizontal, LogOut } from "lucide-react";
import { BottomNav } from "./bottom-nav";

interface LightShellProps {
  /** Заголовок у хедері. Не показуємо якщо isRoot — там кастомний home-header. */
  title?: string;
  backHref?: string;
  /** Якщо true — show only back + title, ховаємо BottomNav (для full-screen flows). */
  hideBottomNav?: boolean;
  /** Корінь = home екран, показуємо власний header у дочірньому контенті, без шапки і back. */
  isRoot?: boolean;
  /** Кастомний action у правому куті (напр., MoreHorizontal/Save). */
  rightSlot?: React.ReactNode;
  showLogout?: boolean;
  children: React.ReactNode;
}

export function LightShell({
  title,
  backHref,
  hideBottomNav,
  isRoot,
  rightSlot,
  showLogout,
  children,
}: LightShellProps) {
  const router = useRouter();

  return (
    <div className="relative min-h-dvh bg-slate-100 text-slate-900 flex flex-col overflow-x-hidden">
      {!isRoot && (
        <header className="sticky top-0 z-30 bg-slate-100/95 backdrop-blur-md">
          <div className="max-w-md mx-auto px-4 pt-2 pb-3 flex items-center gap-3 min-h-[56px]">
            {backHref ? (
              <Link
                href={backHref}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 active:scale-90 transition shrink-0"
                aria-label="Назад"
              >
                <ArrowLeft size={18} className="text-slate-900" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 active:scale-90 transition shrink-0"
                aria-label="Назад"
              >
                <ArrowLeft size={18} className="text-slate-900" />
              </button>
            )}

            <h1 className="flex-1 text-center text-base font-bold text-slate-900 truncate">
              {title}
            </h1>

            {rightSlot ?? (
              showLogout ? (
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 active:scale-90 transition shrink-0"
                  aria-label="Вийти"
                >
                  <LogOut size={16} className="text-slate-700" />
                </button>
              ) : (
                <div className="w-10 h-10 shrink-0" aria-hidden />
              )
            )}
          </div>
        </header>
      )}

      <motion.main
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={`relative z-10 flex-1 max-w-md w-full mx-auto px-4 ${
          isRoot ? "pt-3" : "pt-1"
        } ${hideBottomNav ? "pb-6" : "pb-32"}`}
      >
        {children}
      </motion.main>

      {!hideBottomNav && <BottomNav />}
    </div>
  );
}

/** Convenience helper для menu-button (right slot) */
export function HeaderMenuButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 active:scale-90 transition shrink-0"
      aria-label="Меню"
    >
      <MoreHorizontal size={18} className="text-slate-900" />
    </button>
  );
}
