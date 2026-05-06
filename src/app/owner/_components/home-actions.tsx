"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Briefcase, Sparkles, ChevronRight } from "lucide-react";

export function OwnerHomeActions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.24 }}
      className="grid grid-cols-1 gap-3"
    >
      {/* AI assistant — premium gradient CTA */}
      <Link
        href="/owner/chat"
        className="group relative block rounded-3xl overflow-hidden cursor-pointer"
      >
        <div className="relative bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500 p-5 shadow-[0_15px_40px_-12px_rgba(168,85,247,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] active:scale-[0.99] transition-transform duration-200">
          <span
            className="pointer-events-none absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/15 blur-2xl"
            aria-hidden
          />
          <motion.span
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
            animate={{ x: ["0%", "400%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
            aria-hidden
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-white/90">
                <Sparkles size={14} strokeWidth={2.4} />
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold">AI асистент</span>
              </div>
              <h3 className="mt-1 text-xl font-black text-white tracking-tight leading-tight">
                Запитай про бізнес
              </h3>
              <p className="mt-1 text-xs text-fuchsia-50/90 leading-snug">
                «Скільки винні Михайлу?», «Витрати на цемент за місяць», прогнози
              </p>
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 group-active:scale-90 transition shrink-0">
              <ChevronRight size={20} className="text-white" strokeWidth={2.4} />
            </div>
          </div>
        </div>
      </Link>

      {/* Projects link */}
      <Link
        href="/owner/projects"
        className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md hover:border-white/25 active:scale-[0.99] transition-all cursor-pointer"
      >
        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10">
          <Briefcase size={18} className="text-zinc-300" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">Усі проекти</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">План vs факт по кожному</div>
        </div>
        <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition" />
      </Link>
    </motion.div>
  );
}
