"use client";

import Link from "next/link";

interface BigTileProps {
  href: string;
  title: string;
  subtitle?: string;
  icon?: string;
  count?: number;
}

export function BigTile({ href, title, subtitle, icon, count }: BigTileProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between min-h-[140px] p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500 active:scale-[0.98] transition-all shadow-lg select-none"
    >
      <div className="flex items-start justify-between gap-3">
        {icon && <span className="text-4xl leading-none">{icon}</span>}
        {typeof count === "number" && (
          <span className="text-xs font-semibold uppercase tracking-wide bg-emerald-500/10 text-emerald-400 rounded-full px-3 py-1">
            {count}
          </span>
        )}
      </div>
      <div>
        <div className="text-xl font-bold text-white leading-tight">{title}</div>
        {subtitle && <div className="mt-1 text-sm text-zinc-400 line-clamp-2">{subtitle}</div>}
      </div>
    </Link>
  );
}
