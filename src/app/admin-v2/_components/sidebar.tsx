"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Menu, LogOut, Settings } from "lucide-react";
import { useUnreadChatCount } from "@/hooks/useChat";
import { useInboxCounts } from "@/hooks/useInboxCounts";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { NAV_GROUPS, isItemActive, isItemVisibleForRole, type NavItem } from "../_lib/nav";
import { FirmSwitcher } from "./firm-switcher";
import { getFirmBrand, getActiveRoleFromSession } from "@/lib/firm/scope";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор",
  OWNER: "Власник",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  HR: "HR",
  FOREMAN: "Виконроб",
  CLIENT: "Клієнт",
  USER: "Користувач",
};

type SidebarProps = {
  activeFirmId?: string | null;
};

const COLLAPSED_GROUPS_KEY = "admin-v2:sidebar:collapsed-groups";

function defaultCollapsedGroups(): Set<string> {
  return new Set(NAV_GROUPS.filter((g) => g.collapsedByDefault).map((g) => g.label));
}

function loadCollapsedGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
    // На першому візиті (немає запису) — згортаємо default-collapsed групи.
    if (raw === null) return defaultCollapsedGroups();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return defaultCollapsedGroups();
  }
}

function saveCollapsedGroups(set: Set<string>) {
  try {
    window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...set]));
  } catch {
    // ignore (private mode / quota)
  }
}

export function Sidebar({ activeFirmId }: SidebarProps = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const unreadCount = useUnreadChatCount();
  const inboxCounts = useInboxCounts();
  const reduceMotion = useReducedMotion();

  // Згорнуті групи — set їх labels. localStorage persisted.
  // Hydration-safe: на SSR порожній set, на client — підвантажуємо в useEffect.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups());
  }, []);

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      saveCollapsedGroups(next);
      return next;
    });
  }
  // Активна роль = роль користувача з урахуванням контексту поточної фірми.
  // shymilo93 на Metrum Group → HR; на Metrum Studio → SUPER_ADMIN.
  // Меню фільтрується за активною роллю (а не базовою).
  const role =
    getActiveRoleFromSession(session ?? null, activeFirmId ?? null) ??
    session?.user?.role;

  const brand = getFirmBrand(activeFirmId ?? null);

  const width = collapsed ? 64 : 264;

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);

  return (
    <aside
      className="fixed bottom-0 left-0 z-40 hidden md:flex flex-col"
      style={{
        width,
        top: "var(--staging-banner-h, 0px)",
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
        <FirmSwitcher collapsed={collapsed}>
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Gradient brand-mark — колір залежить від активної фірми (синій=Group, жовтий=Studio) */}
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 text-white font-bold text-[15px]"
              style={{
                background: brand.gradient,
                boxShadow:
                  "0 1px 2px rgba(15,23,42,0.15), inset 0 1px 0 rgba(255,255,255,0.18)",
                letterSpacing: "-0.02em",
              }}
              aria-hidden
            >
              M
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 leading-tight gap-0.5">
                <img
                  src="/images/metrum-logo.svg"
                  alt="Metrum"
                  className="h-4 w-auto admin-dark:brightness-0 admin-dark:invert"
                />
                <span
                  className="text-[10.5px] font-medium"
                  style={{ color: T.textMuted }}
                >
                  admin · v2
                </span>
              </div>
            )}
          </div>
        </FirmSwitcher>
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
          const hasActiveChild = visible.some((it) =>
            isItemActive(it.href, it.exact, pathname),
          );
          // Group is open by default. Closed via user click → localStorage.
          // Якщо в групі є active item — force-open щоб юзер бачив де він.
          const isOpen =
            collapsed || !collapsedGroups.has(group.label) || hasActiveChild;
          return (
            <div key={group.label} className="mb-3.5">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="w-full mb-0.5 px-3 py-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase rounded transition-colors hover:bg-[var(--t-panel-el)]"
                  style={{ color: T.textMuted, letterSpacing: "0.10em" }}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-${group.label}`}
                >
                  <motion.span
                    initial={false}
                    animate={{ rotate: isOpen ? 0 : -90 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 380, damping: 30 }
                    }
                    style={{ display: "inline-flex", originX: 0.5, originY: 0.5 }}
                  >
                    <ChevronDown size={10} style={{ color: T.textMuted }} />
                  </motion.span>
                  <span className="flex-1 text-left">{group.label}</span>
                </button>
              )}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="group-body"
                    id={`nav-group-${group.label}`}
                    initial={
                      reduceMotion
                        ? { height: "auto", opacity: 1 }
                        : { height: 0, opacity: 0 }
                    }
                    animate={{ height: "auto", opacity: 1 }}
                    exit={
                      reduceMotion
                        ? { height: 0, opacity: 0 }
                        : { height: 0, opacity: 0 }
                    }
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            height: { type: "spring", stiffness: 380, damping: 32, mass: 0.6 },
                            opacity: { duration: 0.15 },
                          }
                    }
                    style={{ overflow: "hidden" }}
                  >
                    <div className="flex flex-col gap-px px-2">
                {visible.map((item) => {
                  const active = isItemActive(item.href, item.exact, pathname);
                  const badge = item.showUnreadBadge
                    ? unreadCount
                    : item.inboxKey
                      ? inboxCounts[item.inboxKey]
                      : 0;
                  const pill = item.pillBadge;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className="relative flex items-center gap-2.5 rounded-md px-2.5 py-[6px] transition-colors duration-150 hover:bg-[var(--t-panel-el)]"
                      style={{
                        color: active ? T.accentPrimary : T.textSecondary,
                        justifyContent: collapsed ? "center" : "flex-start",
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active-indicator"
                          aria-hidden
                          className="absolute inset-0 rounded-md"
                          style={{
                            background: "var(--nav-active)",
                            boxShadow: "inset 2px 0 0 var(--nav-active-bar)",
                          }}
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      <Icon
                        size={16}
                        className="relative z-10"
                        style={{ color: active ? T.accentPrimary : T.textSecondary }}
                      />
                      {!collapsed && (
                        <span className="relative z-10 flex-1 text-[13px] truncate">
                          {item.label}
                        </span>
                      )}
                      {!collapsed && pill && (
                        <span
                          className="relative z-10 inline-flex items-center px-1.5 h-[18px] rounded-md text-[9px] font-bold tracking-wider uppercase flex-shrink-0"
                          style={{
                            backgroundColor: pillColorBg(pill.color),
                            color: pillColorFg(pill.color),
                          }}
                        >
                          {pill.text}
                        </span>
                      )}
                      {badge > 0 && (
                        <span
                          className="relative z-10 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
                          style={{
                            // Inbox-queue badges = amber (треба перевірити);
                            // chat unread = accent (нові повідомлення).
                            backgroundColor: item.inboxKey ? "#D97706" : T.accentPrimary,
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
                  </motion.div>
                )}
              </AnimatePresence>
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
                  {ROLE_LABELS[role ?? ""] || role}
                </p>
              </div>
            </Link>
          )}
          <div className="flex items-center gap-1">
            {role === "SUPER_ADMIN" && (
              <Link
                href="/admin-v2/settings"
                className="rounded-lg p-2 transition hover:brightness-[0.97]"
                style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
                title="Налаштування системи"
              >
                <Settings size={16} />
              </Link>
            )}
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

// Pill badge palette — colored bg + matching strong fg.
function pillColorBg(c: NonNullable<NavItem["pillBadge"]>["color"]): string {
  switch (c) {
    case "violet":  return "rgba(124, 92, 255, 0.14)";
    case "amber":   return "rgba(217, 119, 6, 0.14)";
    case "success": return "rgba(22, 163, 74, 0.14)";
    case "danger":  return "rgba(220, 38, 38, 0.14)";
    case "teal":    return "rgba(13, 148, 136, 0.14)";
    case "accent":  return "rgba(59, 91, 255, 0.14)";
  }
}
function pillColorFg(c: NonNullable<NavItem["pillBadge"]>["color"]): string {
  switch (c) {
    case "violet":  return "#7C3AED";
    case "amber":   return "#D97706";
    case "success": return "#16A34A";
    case "danger":  return "#DC2626";
    case "teal":    return "#0D9488";
    case "accent":  return "#3B5BFF";
  }
}
