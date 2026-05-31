"use client";

import Link from "next/link";
import { HardHat, Bell } from "lucide-react";

interface HomeHeaderProps {
  userName: string;
  pending: number;
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Доброї ночі";
  if (h < 12) return "Доброго ранку";
  if (h < 18) return "Доброго дня";
  return "Доброго вечора";
}

export function HomeHeader({ userName, pending }: HomeHeaderProps) {
  const greeting = greetingFor(new Date());

  return (
    <header className="flex items-center gap-3 py-2">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.6)]">
        <HardHat size={22} className="text-white" strokeWidth={2.2} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-slate-500 leading-tight">{greeting},</div>
        <div className="text-[20px] font-bold text-slate-900 leading-tight truncate">
          {userName}!
        </div>
      </div>

      <Link
        href="/foreman/history"
        className="relative flex items-center justify-center w-11 h-11 rounded-full bg-white border border-slate-200 active:scale-95 transition"
        aria-label={pending > 0 ? `${pending} нових нотифікацій` : "Нотифікації"}
      >
        <Bell size={18} className="text-slate-600" />
        {pending > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-bold border-2 border-white px-1 tabular-nums"
            aria-hidden
          >
            {pending > 9 ? "9+" : pending}
          </span>
        )}
      </Link>
    </header>
  );
}
