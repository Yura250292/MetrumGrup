"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Package, User, Plus } from "lucide-react";

interface NavItem {
  href: string;
  icon: typeof Home;
  label: string;
  match?: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  { href: "/foreman", icon: Home, label: "Головна", match: (p) => p === "/foreman" },
  {
    href: "/foreman/history",
    icon: FileText,
    label: "Звіти",
    match: (p) => p.startsWith("/foreman/history"),
  },
  {
    href: "/foreman/tools/materials",
    icon: Package,
    label: "Склад",
    match: (p) => p.startsWith("/foreman/tools/materials") || p.startsWith("/foreman/order"),
  },
  {
    href: "/foreman/profile",
    icon: User,
    label: "Я",
    match: (p) => p.startsWith("/foreman/profile"),
  },
];

interface BottomNavProps {
  fabHref?: string;
}

export function BottomNav({ fabHref = "/foreman/report/folder" }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="mx-auto max-w-md relative pointer-events-auto">
        <nav
          className="relative bg-white border-t border-slate-200 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_-15px_rgba(15,23,42,0.18)]"
          aria-label="Нижня навігація"
        >
          <div className="grid grid-cols-5 items-end gap-1">
            {ITEMS.slice(0, 2).map((it) => (
              <NavTile key={it.href} item={it} active={!!it.match?.(pathname)} />
            ))}

            <div className="flex items-center justify-center -mt-7">
              <Link
                href={fabHref}
                aria-label="Новий звіт"
                className="relative flex items-center justify-center w-14 h-14 rounded-full bg-slate-900 text-white shadow-[0_10px_25px_-6px_rgba(15,23,42,0.45)] active:scale-95 transition-transform hover:bg-slate-800"
              >
                <Plus size={26} strokeWidth={2.5} />
              </Link>
            </div>

            {ITEMS.slice(2).map((it) => (
              <NavTile key={it.href} item={it} active={!!it.match?.(pathname)} />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavTile({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex flex-col items-center justify-center gap-1 py-1.5 active:scale-95 transition-transform"
      aria-current={active ? "page" : undefined}
    >
      <Icon
        size={20}
        strokeWidth={active ? 2.3 : 1.8}
        className={active ? "text-indigo-600" : "text-slate-400"}
      />
      <span
        className={`text-[10px] leading-none ${
          active ? "text-indigo-600 font-bold" : "text-slate-500 font-medium"
        }`}
      >
        {item.label}
      </span>
    </Link>
  );
}
