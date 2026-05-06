"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface BigTileProps {
  href: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  count?: number;
  /** Stagger index for entrance animation. */
  index?: number;
}

export function BigTile({ href, title, subtitle, icon, count, index = 0 }: BigTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.04, 0.25),
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Link
        href={href}
        className="group relative flex flex-col justify-between min-h-[148px] p-5 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 hover:border-white/25 active:scale-[0.97] transition-all duration-200 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] select-none cursor-pointer overflow-hidden"
      >
        {/* gradient overlay on hover */}
        <span
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/[0.04] to-transparent"
          aria-hidden
        />

        <div className="relative flex items-start justify-between gap-3">
          {icon && (
            <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 text-2xl">
              {icon}
            </span>
          )}
          {typeof count === "number" && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-0.5">
              {count}
            </span>
          )}
        </div>

        <div className="relative">
          <div className="text-lg font-bold text-white leading-tight tracking-tight">{title}</div>
          {subtitle && (
            <div className="mt-1 text-xs text-zinc-400 line-clamp-2">{subtitle}</div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
