"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

interface BigTileLightProps {
  href: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  count?: number;
  index?: number;
  variant?: "card" | "row";
}

export function BigTileLight({
  href,
  title,
  subtitle,
  icon,
  count,
  index = 0,
  variant = "card",
}: BigTileLightProps) {
  if (variant === "row") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.32,
          delay: Math.min(index * 0.035, 0.2),
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <Link
          href={href}
          className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 p-3 active:scale-[0.98] transition-transform"
        >
          {icon && (
            <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 text-slate-600 shrink-0">
              {icon}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-900 truncate">{title}</div>
            {subtitle && (
              <div className="text-[12px] text-slate-500 truncate">{subtitle}</div>
            )}
          </div>
          {typeof count === "number" && (
            <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5 shrink-0 tabular-nums">
              {count}
            </span>
          )}
          <ChevronRight size={16} className="text-slate-400 shrink-0" />
        </Link>
      </motion.div>
    );
  }

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
        className="group relative flex flex-col justify-between min-h-[140px] p-4 rounded-2xl bg-white border border-slate-200 active:scale-[0.97] transition-all duration-200 cursor-pointer overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3">
          {icon && (
            <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 text-slate-600">
              {icon}
            </span>
          )}
          {typeof count === "number" && (
            <span className="text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5 tabular-nums">
              {count}
            </span>
          )}
        </div>

        <div>
          <div className="text-[15px] font-bold text-slate-900 leading-tight tracking-tight">
            {title}
          </div>
          {subtitle && (
            <div className="mt-1 text-[12px] text-slate-500 line-clamp-2">{subtitle}</div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
