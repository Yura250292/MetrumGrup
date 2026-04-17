"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { BREADCRUMB_MAP } from "../_lib/nav";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();

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
      className="sticky top-0 z-30 flex h-12 md:h-16 items-center justify-between border-b px-4 md:px-8"
      style={{
        backgroundColor: T.panel,
        borderColor: T.borderSoft,
        backdropFilter: "blur(12px)",
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
                className="font-medium transition hover:brightness-[0.97]"
                style={{ color: T.textMuted }}
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      <NotificationBell
        variant="v2"
        buttonStyle={{ color: T.textSecondary, backgroundColor: T.panelElevated }}
      />
    </header>
  );
}
