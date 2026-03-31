"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Building2, FileText, Users, LogOut } from "lucide-react";

const navItems = [
  { href: "/admin", label: "Головна", icon: LayoutDashboard },
  { href: "/admin/projects", label: "Проєкти", icon: Building2 },
  { href: "/admin/estimates", label: "Кошториси", icon: FileText },
  { href: "/admin/clients", label: "Клієнти", icon: Users },
];

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-white/95 backdrop-blur-xl md:hidden safe-area-pb">
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-16 h-12 rounded-lg transition-all duration-200",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Logout button */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex flex-col items-center justify-center gap-1 w-16 h-12 rounded-lg transition-all duration-200 text-muted-foreground active:bg-muted/50"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] font-medium">Вийти</span>
        </button>
      </div>
    </nav>
  );
}
