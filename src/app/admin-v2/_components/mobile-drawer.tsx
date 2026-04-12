"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import { LogOut, X } from "lucide-react";
import { useUnreadChatCount } from "@/hooks/useChat";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { NAV_GROUPS, isItemActive } from "../_lib/nav";

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const unreadCount = useUnreadChatCount();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col md:hidden"
            style={{
              maxHeight: "85vh",
              backgroundColor: T.panel,
              borderTop: `1px solid ${T.borderSoft}`,
              borderRadius: "20px 20px 0 0",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            {/* Drag handle + close */}
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <div
                className="mx-auto h-1 w-10 rounded-full"
                style={{ backgroundColor: T.textMuted }}
              />
              <button
                onClick={onClose}
                className="absolute right-4 top-3 rounded-lg p-2 transition active:scale-95"
                style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
              >
                <X size={18} />
              </button>
            </div>

            {/* User info */}
            <div
              className="mx-5 mb-3 flex items-center gap-3 rounded-xl p-3"
              style={{ backgroundColor: T.panelElevated }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
              >
                {session?.user?.name?.charAt(0)?.toUpperCase() || "A"}
              </div>
              <div className="flex flex-col gap-0 min-w-0">
                <p className="truncate text-[14px] font-semibold" style={{ color: T.textPrimary }}>
                  {session?.user?.name || "Користувач"}
                </p>
                <p className="text-[11px]" style={{ color: T.textMuted }}>
                  {isSuperAdmin ? "Адміністратор" : "Менеджер"}
                </p>
              </div>
            </div>

            {/* Nav groups */}
            <nav className="flex-1 overflow-y-auto px-5 pb-4">
              {NAV_GROUPS.map((group) => {
                const visible = group.items.filter((it) => !it.superAdminOnly || isSuperAdmin);
                if (visible.length === 0) return null;

                return (
                  <div key={group.label} className="mb-4">
                    <p
                      className="mb-2 text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: T.textMuted }}
                    >
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-1">
                      {visible.map((item) => {
                        const active = isItemActive(item.href, item.exact, pathname);
                        const badge = item.showUnreadBadge ? unreadCount : 0;
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="relative flex items-center gap-3 rounded-xl px-4 py-3 transition tap-highlight-none active:scale-[0.98]"
                            style={{
                              backgroundColor: active ? T.accentPrimarySoft : "transparent",
                              color: active ? T.accentPrimary : T.textSecondary,
                              border: `1px solid ${active ? T.borderAccent : "transparent"}`,
                              minHeight: 48,
                            }}
                          >
                            <Icon size={20} />
                            <span className="flex-1 text-[14px] font-medium">{item.label}</span>
                            {badge > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
                                style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
                              >
                                {badge > 99 ? "99+" : badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Sign out */}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 transition tap-highlight-none active:scale-[0.98]"
                style={{
                  color: T.danger,
                  backgroundColor: T.dangerSoft,
                  minHeight: 48,
                }}
              >
                <LogOut size={20} />
                <span className="text-[14px] font-medium">Вийти</span>
              </button>
            </nav>

            {/* Safe area spacer */}
            <div className="safe-area-pb" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
