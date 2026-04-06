"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import Link from "next/link";

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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-gradient-to-r from-gray-900/95 via-black/95 to-gray-900/95 backdrop-blur-xl px-6 shadow-lg">
      <div className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.href} className="flex items-center gap-2">
            {index > 0 && <span className="text-gray-500">/</span>}
            {index === breadcrumbs.length - 1 ? (
              <span className="font-medium text-white">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      <button className="relative rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
        <Bell className="h-5 w-5" />
      </button>
    </header>
  );
}
