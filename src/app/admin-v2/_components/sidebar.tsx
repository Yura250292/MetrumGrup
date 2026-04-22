"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ChevronLeft, Menu, LogOut, Settings } from "lucide-react";
import { useUnreadChatCount } from "@/hooks/useChat";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { NAV_GROUPS, isItemActive, isItemVisibleForRole } from "../_lib/nav";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  HR: "HR",
  CLIENT: "Клієнт",
  USER: "Користувач",
};

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const unreadCount = useUnreadChatCount();
  const role = session?.user?.role;

  const width = collapsed ? 64 : 264;

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col"
      style={{
        width,
        background: "var(--sidebar-bg)",
        borderRight: `1px solid ${T.borderSoft}`,
        transition: "width 0.2s ease",
      }}
    >
      {/* Brand */}
      <div
        className="flex h-16 items-center justify-between px-4"
        style={{
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        {!collapsed && (
          <img
            src="/images/metrum-logo.svg"
            alt="Metrum"
            className="h-5 w-auto flex-shrink-0 admin-dark:brightness-0 admin-dark:invert admin-light:brightness-100"
          />
        )}
        {collapsed && (
          <img
            src="/images/metrum-logo.svg"
            alt="M"
            className="h-4 w-auto flex-shrink-0 admin-dark:brightness-0 admin-dark:invert admin-light:brightness-100"
          />
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-lg p-1.5 transition hover:brightness-[0.97]"
          style={{ color: T.textMuted, backgroundColor: T.panel }}
        >
          {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter((it) => isItemVisibleForRole(it, role));
          if (visible.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              {!collapsed && (
                <p
                  className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: T.textMuted }}
                >
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5 px-2">
                {visible.map((item) => {
                  const active = isItemActive(item.href, item.exact, pathname);
                  const badge = item.showUnreadBadge ? unreadCount : 0;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className="relative flex items-center gap-3 rounded-md px-3 py-2.5 transition hover:bg-[var(--t-panel-el)]"
                      style={{
                        background: active ? "var(--nav-active)" : undefined,
                        color: active ? T.accentPrimary : T.textSecondary,
                        boxShadow: active ? "inset 2px 0 0 var(--nav-active-bar)" : undefined,
                        justifyContent: collapsed ? "center" : "flex-start",
                      }}
                    >
                      <Icon size={18} style={{ color: active ? T.accentPrimary : T.textSecondary }} />
                      {!collapsed && (
                        <span className="flex-1 text-[13px] font-medium">{item.label}</span>
                      )}
                      {badge > 0 && (
                        <span
                          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
                          style={{
                            backgroundColor: T.accentPrimary,
                            color: "#FFFFFF",
                            position: collapsed ? "absolute" : "static",
                            top: collapsed ? 2 : undefined,
                            right: collapsed ? 2 : undefined,
                          }}
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
      </nav>

      {/* User */}
      <div className="border-t p-3" style={{ borderColor: T.borderSoft }}>
        <div className="flex items-center gap-3" style={{ justifyContent: collapsed ? "center" : "flex-start" }}>
          {!collapsed && (
            <Link
              href="/admin-v2/profile"
              className="flex flex-1 items-center gap-3 min-w-0 rounded-lg p-1 -m-1 transition hover:bg-[var(--t-panel-el)]"
            >
              <UserAvatar src={session?.user?.image} name={session?.user?.name} size={36} />
              <div className="flex flex-1 flex-col gap-0 min-w-0">
                <p className="truncate text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  {session?.user?.name || "Користувач"}
                </p>
                <p className="truncate text-[11px]" style={{ color: T.textMuted }}>
                  {ROLE_LABELS[session?.user?.role ?? ""] || session?.user?.role}
                </p>
              </div>
            </Link>
          )}
          <div className="flex items-center gap-1">
            <Link
              href="/admin-v2/profile"
              className="rounded-lg p-2 transition hover:brightness-[0.97]"
              style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
              title="Мій профіль"
            >
              <Settings size={16} />
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg p-2 transition hover:brightness-[0.97]"
              style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
              title="Вийти"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
