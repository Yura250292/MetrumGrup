"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { ChevronRight, ArrowLeft, User, LogOut, Search, Plus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { BREADCRUMB_MAP } from "../_lib/nav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AiChatButton } from "@/components/ai-assistant/AiChatButton";
import { SearchModal } from "./search-modal";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  for (let i = 1; i <= segments.length; i++) {
    const path = "/" + segments.slice(0, i).join("/");
    const label = BREADCRUMB_MAP[path];
    if (label) crumbs.push({ label, href: path });
  }
  if (crumbs.length === 0) crumbs.push({ label: "Адмін", href: pathname });

  const lastCrumb = crumbs[crumbs.length - 1];
  const canGoBack = crumbs.length > 1;

  return (
    <header
      className="glass-header sticky top-0 z-30 flex h-12 md:h-16 items-center justify-between px-4 md:px-8"
      style={{
        borderBottom: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Mobile: back button + page title */}
      <div className="flex items-center gap-2 md:hidden min-w-0">
        {canGoBack && (
          <button
            onClick={() => router.back()}
            className="flex-shrink-0 rounded-lg p-1.5 transition active:scale-95 tap-highlight-none"
            style={{ color: T.textSecondary }}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <span
          className="truncate text-[14px] font-semibold"
          style={{ color: T.textPrimary }}
        >
          {lastCrumb.label}
        </span>
      </div>

      {/* Desktop: full breadcrumbs */}
      <nav className="hidden md:flex items-center gap-2 text-sm">
        {crumbs.map((crumb, i) => (
          <div key={`${crumb.href}-${i}`} className="flex items-center gap-2">
            {i > 0 && <ChevronRight size={14} style={{ color: T.textMuted }} />}
            {i === crumbs.length - 1 ? (
              <span className="font-semibold" style={{ color: T.textPrimary }}>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="font-medium transition hover:opacity-80"
                style={{ color: T.textSecondary }}
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Desktop: search input (centered) */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden md:flex items-center gap-2 mx-auto rounded-lg px-3 py-1.5 text-[13px] transition hover:brightness-[0.97]"
        style={{
          width: 320,
          backgroundColor: T.panelElevated,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        <Search size={14} style={{ flexShrink: 0 }} />
        <span className="flex-1 text-left truncate">Пошук проєктів, клієнтів, задач…</span>
        <span
          className="font-mono text-[10.5px] px-1.5 py-px rounded"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textMuted,
          }}
        >
          ⌘K
        </span>
      </button>

      <div className="flex items-center gap-1.5 md:gap-3">
        <div className="flex items-center gap-1 md:gap-1.5">
          <AiChatButton />
          <NotificationBell
            variant="v2"
            buttonStyle={{ color: T.textSecondary, backgroundColor: T.panelElevated }}
          />
          <ThemeToggle />
        </div>
        {/* CTA: New project (desktop only) */}
        <Link
          href="/admin-v2/projects/new"
          className="hidden md:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95"
          style={{
            backgroundColor: T.accentPrimary,
            color: "#fff",
            boxShadow: `0 1px 2px ${T.accentPrimary}4d, inset 0 1px 0 rgba(255,255,255,0.18)`,
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Новий проєкт
        </Link>
        <div className="hidden md:block h-5 w-px" style={{ backgroundColor: T.borderSoft }} />

        {/* User avatar menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="transition hover:ring-2 hover:ring-offset-1 rounded-full"
            title={session?.user?.name || "Профіль"}
          >
            <UserAvatar src={session?.user?.image} name={session?.user?.name} size={32} />
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-[min(12rem,calc(100vw-24px))] rounded-xl py-1 shadow-lg z-50"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: T.borderSoft }}>
                <p className="text-[13px] font-semibold truncate" style={{ color: T.textPrimary }}>
                  {session?.user?.name || "Користувач"}
                </p>
                <p className="text-[11px] truncate" style={{ color: T.textMuted }}>
                  {session?.user?.email}
                </p>
              </div>
              <Link
                href="/admin-v2/profile"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[13px] transition hover:bg-[#F1F5F9]"
                style={{ color: T.textSecondary }}
              >
                <User size={14} />
                Мій профіль
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-3 py-2 text-[13px] transition hover:bg-[#F1F5F9]"
                style={{ color: T.danger }}
              >
                <LogOut size={14} />
                Вийти
              </button>
            </div>
          )}
        </div>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
