"use client";

import Link from "next/link";
import { ChevronRight, LayoutDashboard, Ruler, Camera, Sparkles } from "lucide-react";

export function ToolsSection() {
  return (
    <section aria-labelledby="tools-heading" className="space-y-3">
      <h2 id="tools-heading" className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500">
        ІНСТРУМЕНТИ
      </h2>

      <Link
        href="/foreman/tools/estimator"
        className="group relative flex items-center gap-3 rounded-2xl bg-white border border-violet-200 p-4 active:scale-[0.99] transition-transform overflow-hidden"
      >
        <span
          className="pointer-events-none absolute -top-6 -right-6 w-24 h-24 rounded-full bg-violet-500/10 blur-2xl"
          aria-hidden
        />
        <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-100">
          <LayoutDashboard size={20} className="text-violet-600" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0 relative">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold text-slate-900">Кошторис</span>
            <Sparkles size={12} className="text-violet-500" />
          </div>
          <div className="text-[12px] text-slate-500 truncate">
            План кімнат → матеріали → ціни
          </div>
        </div>
        <ChevronRight size={16} className="text-violet-400 shrink-0 relative" />
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <ToolTile
          href="/foreman/tools/photo-log"
          icon={<Camera size={16} className="text-emerald-600" />}
          iconBg="bg-emerald-50"
          title="Фотолог"
          subtitle="Прогрес обʼєкту"
        />
        <ToolTile
          href="/foreman/tools/level"
          icon={<Ruler size={16} className="text-amber-600" />}
          iconBg="bg-amber-100"
          title="Лінійка"
          subtitle="Рівень / waterpas"
        />
      </div>
    </section>
  );
}

interface ToolTileProps {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
}

function ToolTile({ href, icon, iconBg, title, subtitle }: ToolTileProps) {
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
        <div className="text-[12px] text-slate-500 leading-tight truncate">{subtitle}</div>
      </div>
    </Link>
  );
}
