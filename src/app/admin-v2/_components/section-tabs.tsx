"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type SectionTab = {
  href: string;
  label: string;
  exact?: boolean;
};

function isActive(href: string, exact: boolean | undefined, pathname: string): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  return (
    <div
      className="flex items-center gap-1 -mt-2"
      role="tablist"
      style={{ borderBottom: `1px solid ${T.borderSoft}` }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href, tab.exact, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className="relative px-3 py-2 text-[13px] font-medium transition-colors"
            style={{
              color: active ? T.accentPrimary : T.textSecondary,
            }}
          >
            {tab.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                style={{ background: T.accentPrimary }}
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
