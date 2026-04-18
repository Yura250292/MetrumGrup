"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Bell } from "lucide-react";

const TITLES: Record<string, string> = {
  "/dashboard": "Головна",
  "/dashboard/projects": "Проєкти",
  "/dashboard/finance": "Фінанси",
  "/dashboard/notifications": "Сповіщення",
  "/dashboard/profile": "Профіль",
  "/dashboard/visualizer": "Візуалізація",
};

export function DashboardMobileHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Find title — match longest prefix
  const title = Object.entries(TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => pathname === path || pathname.startsWith(path + "/"))?.[1] ?? "Metrum";

  const firstName = session?.user?.name?.split(" ")[0] ?? "";
  const isHome = pathname === "/dashboard";

  return (
    <header className="md:hidden sticky top-0 z-40 admin-dark:bg-[#0F0F0F]/90 admin-light:bg-gray-50/90 backdrop-blur-lg border-b admin-dark:border-white/5 admin-light:border-gray-200/70">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/profile">
            <UserAvatar
              src={session?.user?.image}
              name={session?.user?.name}
              size={34}
              gradient="linear-gradient(135deg, #3B82F6, #10B981)"
            />
          </Link>
          <div className="min-w-0">
            {isHome ? (
              <>
                <p className="text-[13px] font-bold truncate admin-dark:text-white admin-light:text-gray-900">
                  Привіт, {firstName}
                </p>
                <p className="text-[10px] admin-dark:text-gray-500 admin-light:text-gray-500">
                  Metrum Group
                </p>
              </>
            ) : (
              <p className="text-[15px] font-bold truncate admin-dark:text-white admin-light:text-gray-900">
                {title}
              </p>
            )}
          </div>
        </div>
        <Link
          href="/dashboard/notifications"
          className="flex h-9 w-9 items-center justify-center rounded-xl admin-dark:bg-white/5 admin-light:bg-gray-100 transition active:scale-95"
        >
          <Bell className="h-[18px] w-[18px] admin-dark:text-gray-400 admin-light:text-gray-500" />
        </Link>
      </div>
    </header>
  );
}
