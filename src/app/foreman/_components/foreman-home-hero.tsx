"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ClipboardList,
  History,
  FileText,
  ChevronRight,
  Sparkles,
  Calculator,
  Package,
  Ruler,
  Camera,
} from "lucide-react";
import { resolveFirmBrand, FirmLogo } from "./firm-brand";

interface Props {
  firmId: string | null;
  userName: string;
  pending: number;
  approved: number;
}

export function ForemanHomeHero({ firmId, userName, pending, approved }: Props) {
  const brand = resolveFirmBrand(firmId);

  const hasStats = pending > 0 || approved > 0;

  return (
    <div className="space-y-4 mt-1">
      {/* Compact identity row: firm + user + tiny stats — все одним рядком */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-2xl overflow-hidden bg-white/[0.04] backdrop-blur-xl border border-white/10 px-4 py-3 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <div
          className="pointer-events-none absolute -top-16 -right-10 w-40 h-40 rounded-full opacity-50 blur-3xl"
          style={{ backgroundColor: brand.glow }}
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <FirmLogo brand={brand} size="sm" />
            <div className="mt-1 flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                aria-hidden
              >
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-white truncate">{userName}</span>
            </div>
          </div>

          {hasStats && (
            <div className="flex gap-1.5 shrink-0">
              {pending > 0 && (
                <div className="flex flex-col items-center justify-center min-w-[44px] px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <span className="text-base font-bold text-amber-300 tabular-nums leading-none">
                    {pending}
                  </span>
                  <span className="text-[8px] uppercase tracking-wider text-amber-400/80 font-bold mt-0.5">
                    очік.
                  </span>
                </div>
              )}
              {approved > 0 && (
                <div className="flex flex-col items-center justify-center min-w-[44px] px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-base font-bold text-emerald-300 tabular-nums leading-none">
                    {approved}
                  </span>
                  <span className="text-[8px] uppercase tracking-wider text-emerald-400/80 font-bold mt-0.5">
                    готово
                  </span>
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

      {/* Tools section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        aria-labelledby="foreman-tools-heading"
      >
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h3
            id="foreman-tools-heading"
            className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold"
          >
            Інструменти
          </h3>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">для роботи</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ToolTile
            href="/foreman/tools/area"
            icon={<Calculator size={20} strokeWidth={2} />}
            label="Калькулятор"
            sublabel="Площа кімнати"
            iconBg="bg-sky-500/10 text-sky-300 border-sky-500/30"
          />
          <ToolTile
            href="/foreman/tools/materials"
            icon={<Package size={20} strokeWidth={2} />}
            label="Матеріали"
            sublabel="Витрата на м²"
            iconBg="bg-violet-500/10 text-violet-300 border-violet-500/30"
          />
          <ToolTile
            href="/foreman/tools/level"
            icon={<Ruler size={20} strokeWidth={2} />}
            label="Лінійка"
            sublabel="Рівень / waterpas"
            iconBg="bg-amber-500/10 text-amber-300 border-amber-500/30"
          />
          <ToolTile
            href="/foreman/tools/photo-log"
            icon={<Camera size={20} strokeWidth={2} />}
            label="Фотолог"
            sublabel="Прогрес обʼєкту"
            iconBg="bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
          />
        </div>
      </motion.section>

      {/* Secondary actions grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
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

interface ToolTileProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  iconBg: string;
}

function ToolTile({ href, icon, label, sublabel, iconBg }: ToolTileProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-2.5 p-4 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 hover:border-white/25 active:scale-[0.97] transition-all duration-200 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] select-none cursor-pointer overflow-hidden min-h-[100px]"
    >
      <span
        className={`flex items-center justify-center w-10 h-10 rounded-xl border ${iconBg}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white tracking-tight leading-tight">{label}</div>
        <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{sublabel}</div>
      </div>
    </Link>
  );
}
