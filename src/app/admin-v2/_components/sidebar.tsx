"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { Layers, ChevronLeft, Menu, LogOut, Settings } from "lucide-react";
import { useUnreadChatCount } from "@/hooks/useChat";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { NAV_GROUPS, isItemActive } from "../_lib/nav";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const unreadCount = useUnreadChatCount();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const width = collapsed ? 64 : 264;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col"
      style={{
        width,
        backgroundColor: T.panel,
        borderRight: `1px solid ${T.borderSoft}`,
        transition: "width 0.2s ease",
      }}
    >
      {/* Brand */}
      <div
        className="flex h-16 items-center justify-between px-4"
        style={{
          background: "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)",
          borderBottom: `1px solid ${T.accentPrimary}18`,
        }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})` }}
            >
              <Layers size={16} color="#FFFFFF" />
            </div>
            <div className="flex flex-col gap-0">
              <span className="text-[13px] font-bold leading-none" style={{ color: T.textPrimary }}>
                Metrum
              </span>
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.15em] mt-0.5"
                style={{ color: T.accentSecondary }}
              >
                Адмін-панель
              </span>
            </div>
          </div>
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
          const visible = group.items.filter((it) => !it.superAdminOnly || isSuperAdmin);
          if (visible.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              {!collapsed && (
                <p
                  className="mb-2 px-4 text-[10px] font-bold uppercase tracking-wider"
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
                      className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#F1F5F9]"
                      style={{
                        background: active
                          ? `linear-gradient(135deg, ${T.accentPrimarySoft}, #DBEAFE)`
                          : undefined,
                        color: active ? T.accentPrimary : T.textSecondary,
                        border: `1px solid ${active ? T.accentPrimary + "30" : "transparent"}`,
                        boxShadow: active ? `0 2px 8px ${T.accentPrimary}15` : undefined,
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
              className="flex flex-1 items-center gap-3 min-w-0 rounded-lg p-1 -m-1 transition hover:bg-[#F1F5F9]"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`, color: "#FFFFFF" }}
              >
                {session?.user?.name?.charAt(0)?.toUpperCase() || "А"}
              </div>
              <div className="flex flex-1 flex-col gap-0 min-w-0">
                <p className="truncate text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  {session?.user?.name || "Адміністратор"}
                </p>
                <p className="truncate text-[11px]" style={{ color: T.textMuted }}>
                  {isSuperAdmin ? "Адмін" : "Менеджер"}
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
