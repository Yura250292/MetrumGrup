"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { useUnreadChatCount } from "@/hooks/useChat";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MOBILE_NAV, isItemActive } from "../_lib/nav";

export function MobileNav({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const pathname = usePathname();
  const unreadCount = useUnreadChatCount();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t md:hidden supports-[backdrop-filter]:backdrop-blur-md"
      style={{
        backgroundColor: T.panel,
        borderColor: T.borderSoft,
      }}
    >
      <div className="flex items-center justify-around px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {MOBILE_NAV.map((item) => {
          const active = isItemActive(item.href, item.exact, pathname);
          const badge = item.showUnreadBadge ? unreadCount : 0;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors duration-150 tap-highlight-none active:scale-95"
              style={{
                color: active ? T.accentPrimary : T.textSecondary,
              }}
            >
              {active && (
                <motion.span
                  layoutId="mobile-nav-active"
                  aria-hidden
                  className="absolute inset-0 rounded-lg"
                  style={{ background: "var(--nav-active)" }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icon size={22} strokeWidth={active ? 2.25 : 2} className="relative z-10" />
              <span className="relative z-10 truncate text-[11px] font-semibold leading-none max-w-[56px]">
                {item.label}
              </span>
              {badge > 0 && (
                <span
                  className="absolute right-2 top-1 z-10 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                  style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </Link>
          );
        })}
        <button
          onClick={onOpenDrawer}
          className="flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-lg transition tap-highlight-none active:scale-95"
          style={{ color: T.textSecondary }}
        >
          <MoreHorizontal size={22} />
          <span className="text-[11px] font-semibold leading-none">Ще</span>
        </button>
      </div>
    </nav>
  );
}
