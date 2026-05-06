"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ClipboardList, History, FileText, ChevronRight, Sparkles } from "lucide-react";
import { resolveFirmBrand, FirmLogo } from "./firm-brand";

interface Props {
  firmId: string | null;
  userName: string;
  pending: number;
  approved: number;
}

export function ForemanHomeHero({ firmId, userName, pending, approved }: Props) {
  const brand = resolveFirmBrand(firmId);

  return (
    <div className="space-y-6 mt-2">
      {/* Hero card з firm-brand градієнтом */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-3xl overflow-hidden bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        {/* firm-specific glow */}
        <div
          className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full opacity-60 blur-3xl"
          style={{ backgroundColor: brand.glow }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 w-48 h-48 rounded-full opacity-40 blur-3xl"
          style={{ backgroundColor: brand.glow }}
          aria-hidden
        />

        <div className="relative space-y-4">
          <FirmLogo brand={brand} size="lg" />

          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-semibold">
              Робочий день
            </div>
            <h2 className="mt-1 text-3xl font-bold text-white tracking-tight">
              Доброго дня, {userName}
            </h2>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Створіть звіт по витратах AI миттєво розпізнає матеріали та роботи з тексту,
              фото або накладної.
            </p>
          </div>

          {/* mini-stats */}
          {(pending > 0 || approved > 0) && (
            <div className="flex gap-2 pt-1">
              {pending > 0 && (
                <div className="flex-1 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-semibold">
                    На перевірці
                  </div>
                  <div className="text-xl font-bold text-amber-300 tabular-nums mt-0.5">
                    {pending}
                  </div>
                </div>
              )}
              {approved > 0 && (
                <div className="flex-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-semibold">
                    Підтверджено
                  </div>
                  <div className="text-xl font-bold text-emerald-300 tabular-nums mt-0.5">
                    {approved}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Primary CTA — gigantic glowing button */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link
          href="/foreman/report/folder"
          className="group relative block rounded-3xl overflow-hidden cursor-pointer"
        >
          {/* gradient base */}
          <div className="relative bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 p-7 shadow-[0_20px_60px_-15px_rgba(16,185,129,0.6),inset_0_1px_0_rgba(255,255,255,0.25)] active:scale-[0.98] transition-transform duration-200">
            {/* radial highlight */}
            <span
              className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/15 blur-2xl"
              aria-hidden
            />
            {/* shimmer animation */}
            <motion.span
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
              animate={{ x: ["0%", "400%"] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
              aria-hidden
            />

            <div className="relative flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-white/90">
                  <ClipboardList size={20} strokeWidth={2.4} />
                  <span className="text-xs uppercase tracking-[0.2em] font-bold">Новий звіт</span>
                </div>
                <h3 className="mt-2 text-3xl font-black text-white tracking-tight leading-none">
                  Створити <br />
                  <span className="inline-flex items-center gap-1">
                    звіт
                    <Sparkles size={20} strokeWidth={2.6} className="ml-0.5" />
                  </span>
                </h3>
                <p className="mt-3 text-sm text-emerald-50/90 max-w-[200px] leading-snug">
                  Матеріали та робота з вашої текстівки, фото або Excel
                </p>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 group-active:scale-90 transition">
                <ChevronRight size={24} className="text-white" strokeWidth={2.4} />
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Secondary actions grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-1 gap-3"
      >
        <Link
          href="/foreman/history"
          className="group flex items-center gap-3 px-4 py-4 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md hover:border-white/25 active:scale-[0.99] transition-all cursor-pointer"
        >
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/[0.05] border border-white/10">
            <History size={20} className="text-zinc-300" />
          </span>
          <div className="flex-1">
            <div className="text-base font-semibold text-white">Історія звітів</div>
            <div className="text-xs text-zinc-500 mt-0.5">Усі ваші чернетки та підтверджені</div>
          </div>
          <ChevronRight size={18} className="text-zinc-500 group-hover:text-zinc-300 transition" />
        </Link>
      </motion.div>

      {/* Help / hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 shrink-0">
            <FileText size={16} className="text-zinc-400" />
          </div>
          <div className="text-xs text-zinc-400 leading-relaxed space-y-1.5">
            <div className="font-semibold text-zinc-300">Як зробити звіт</div>
            <ol className="list-decimal list-inside space-y-0.5 marker:text-zinc-600">
              <li>Натисніть «Створити звіт»</li>
              <li>Оберіть об{"’"}єкт та квартиру</li>
              <li>Опишіть витрати або сфотографуйте накладну</li>
              <li>Перевірте розпізнане та підтвердьте</li>
            </ol>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
