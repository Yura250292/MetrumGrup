"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const breadcrumbMap: Record<string, string> = {
  "/admin": "Дашборд",
  "/admin/projects": "Проєкти",
  "/admin/projects/new": "Новий проєкт",
  "/admin/clients": "Клієнти",
  "/admin/estimates": "Кошториси",
  "/admin/estimates/new": "Новий кошторис",
  "/admin/materials": "Матеріали та ціни",
  "/admin/resources/equipment": "Техніка",
  "/admin/resources/warehouse": "Склад",
  "/admin/resources/workers": "Бригади",
  "/admin/cms/portfolio": "Портфоліо",
  "/admin/cms/news": "Новини",
  "/admin/users": "Користувачі",
  "/admin/settings": "Налаштування",
};

export function AdminHeader() {
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string }[] = [];

  for (let i = 1; i <= segments.length; i++) {
    const path = "/" + segments.slice(0, i).join("/");
    const label = breadcrumbMap[path];
    if (label) {
      breadcrumbs.push({ label, href: path });
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b backdrop-blur-xl px-6 shadow-sm transition-colors admin-dark:border-white/10 admin-dark:bg-gradient-to-r admin-dark:from-gray-900/95 admin-dark:via-black/95 admin-dark:to-gray-900/95 admin-light:border-gray-200 admin-light:bg-white/95">
      <div className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.href} className="flex items-center gap-2">
            {index > 0 && <span className="admin-dark:text-gray-500 admin-light:text-gray-400">/</span>}
            {index === breadcrumbs.length - 1 ? (
              <span className="font-semibold text-[15px] admin-dark:text-white admin-light:text-gray-900">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-[15px] admin-dark:text-gray-400 admin-dark:hover:text-white admin-light:text-gray-600 admin-light:hover:text-gray-900 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      <NotificationBell variant="v1" />
    </header>
  );
}
