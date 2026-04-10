"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { useUnreadChatCount } from "@/hooks/useChat";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MOBILE_NAV, isItemActive } from "../_lib/nav";

export function MobileNav() {
  const pathname = usePathname();
  const unreadCount = useUnreadChatCount();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t px-2 md:hidden safe-area-pb"
      style={{
        backgroundColor: T.panel,
        borderColor: T.borderSoft,
        backdropFilter: "blur(12px)",
      }}
    >
      {MOBILE_NAV.map((item) => {
        const active = isItemActive(item.href, item.exact, pathname);
        const badge = item.showUnreadBadge ? unreadCount : 0;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex flex-col items-center justify-center gap-1 w-16 h-12 rounded-lg transition"
            style={{
              backgroundColor: active ? T.accentPrimarySoft : "transparent",
              color: active ? T.accentPrimary : T.textSecondary,
            }}
          >
            <Icon size={20} />
            <span className="text-[11px] font-semibold">{item.label}</span>
            {badge > 0 && (
              <span
                className="absolute top-0 right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold"
                style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
              >
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Link>
        );
      })}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex flex-col items-center justify-center gap-1 w-16 h-12 rounded-lg transition active:scale-95"
        style={{ color: T.textSecondary }}
      >
        <LogOut size={20} />
        <span className="text-[11px] font-semibold">Вийти</span>
      </button>
    </nav>
  );
}
