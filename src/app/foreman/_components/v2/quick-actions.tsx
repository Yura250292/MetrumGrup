"use client";

import Link from "next/link";
import { Camera, Mic, Package, ChevronRight } from "lucide-react";

interface QuickActionsProps {
  primaryHref: string;
}

export function QuickActions({ primaryHref }: QuickActionsProps) {
  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-3">
      <h2
        id="quick-actions-heading"
        className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500"
      >
        ШВИДКІ ДІЇ
      </h2>

      <Link
        href={primaryHref}
        className="group relative flex items-center gap-3 rounded-2xl bg-indigo-600 p-4 text-white shadow-[0_12px_28px_-12px_rgba(79,70,229,0.6)] active:scale-[0.99] transition-transform overflow-hidden"
      >
        <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-800">
          <Camera size={20} strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-bold">Новий звіт</div>
          <div className="text-[12px] text-indigo-100/90 truncate">
            Фото чеку → AI розпізнає
          </div>
        </div>
        <ChevronRight size={18} className="opacity-90" />
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <SecondaryTile
          href="/foreman/report/voice"
          icon={<Mic size={16} className="text-amber-600" />}
          iconBg="bg-amber-100"
          title="Голосовий"
          subtitle="звіт"
        />
        <SecondaryTile
          href="/foreman/order"
          icon={<Package size={16} className="text-emerald-600" />}
          iconBg="bg-emerald-50"
          title="Замовити"
          subtitle="матеріал"
        />
      </div>
    </section>
  );
}

interface SecondaryTileProps {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
}

function SecondaryTile({ href, icon, iconBg, title, subtitle }: SecondaryTileProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 p-3 active:scale-[0.97] transition-transform"
    >
      <span
        className={`flex items-center justify-center w-10 h-10 rounded-full ${iconBg} shrink-0`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-slate-900 leading-tight">{title}</div>
        <div className="text-[12px] text-slate-500 leading-tight">{subtitle}</div>
      </div>
    </Link>
  );
}
