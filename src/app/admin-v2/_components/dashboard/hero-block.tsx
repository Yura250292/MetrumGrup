"use client";

import { useState } from "react";
import {
  FolderKanban,
  AlertCircle,
  Wallet,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  ShieldAlert,
  ChevronDown,
  CalendarClock,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { motion } from "framer-motion";
import { heroStagger, heroItem, useReducedMotionVariants } from "@/lib/motion";

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Доброго ранку, ${firstName}`;
  if (hour >= 12 && hour < 18) return `Добрий день, ${firstName}`;
  if (hour >= 18 && hour < 23) return `Добрий вечір, ${firstName}`;
  return `Доброї ночі, ${firstName}`;
}

export function HeroBlock({
  firstName,
  today,
  activeProjectsCount,
  overdueTasksCount,
  overduePaymentsCount,
  netProfit,
  role = "SUPER_ADMIN",
  dueTodayCount = 0,
}: {
  firstName: string;
  today: string;
  activeProjectsCount: number;
  overdueTasksCount: number;
  overduePaymentsCount: number;
  netProfit: number;
  role?: string;
  dueTodayCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const attentionZones = [
    overdueTasksCount > 0,
    overduePaymentsCount > 0,
    netProfit < 0,
  ].filter(Boolean).length;

  const isStable = attentionZones === 0;
  const greeting = getGreeting(firstName);
  const borderColor = isStable ? T.success : attentionZones >= 2 ? T.danger : T.warning;

  const stagger = useReducedMotionVariants(heroStagger);
  const item = useReducedMotionVariants(heroItem);

  return (
    <section
      className="premium-hero rounded-xl sm:rounded-2xl relative overflow-hidden"
      style={{
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Animated gradient bg layer */}
      <div
        aria-hidden
        className="gradient-pan-bg absolute inset-0 pointer-events-none opacity-60"
        style={{ borderRadius: "inherit" }}
      ></div>
      {/* === MOBILE: compact + expandable === */}
      <div className="sm:hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left p-3 flex items-center gap-3 tap-highlight-none active:scale-[0.995] transition"
        >
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold tracking-wider block" style={{ color: T.textMuted }}>
              {today.toUpperCase()}
            </span>
            <h1 className="text-lg font-bold tracking-tight truncate" style={{ color: T.textPrimary }}>
              {greeting}
            </h1>
            {/* Inline compact chips */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <InlineChip
                icon={FolderKanban}
                text={`${activeProjectsCount} проєктів`}
                color={T.accentPrimary}
              />
              <InlineChip
                icon={AlertCircle}
                text={`${overdueTasksCount} прострочених`}
                color={overdueTasksCount > 0 ? T.danger : T.success}
              />
              {isStable ? (
                <InlineChip icon={CheckCircle2} text="Стабільно" color={T.success} />
              ) : (
                <InlineChip
                  icon={ShieldAlert}
                  text={`${attentionZones} зони уваги`}
                  color={attentionZones >= 2 ? T.danger : T.warning}
                />
              )}
            </div>
          </div>
          <ChevronDown
            size={16}
            className="flex-shrink-0 transition-transform duration-200"
            style={{
              color: T.textMuted,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <MiniChip
                icon={FolderKanban}
                label={`${activeProjectsCount} активних проєктів`}
                color={T.accentPrimary}
              />
              <MiniChip
                icon={AlertCircle}
                label={`${overdueTasksCount} прострочених задач`}
                color={overdueTasksCount > 0 ? T.danger : T.success}
                alert={overdueTasksCount > 0}
              />
              <MiniChip
                icon={Wallet}
                label={`${overduePaymentsCount} простр. платежів`}
                color={overduePaymentsCount > 0 ? T.danger : T.success}
                alert={overduePaymentsCount > 0}
              />
              <MiniChip
                icon={netProfit >= 0 ? TrendingUp : TrendingDown}
                label={`${formatCurrencyCompact(netProfit)} чистий`}
                color={netProfit >= 0 ? T.success : T.danger}
                alert={netProfit < 0}
              />
            </div>
          </div>
        )}
      </div>

      {/* === DESKTOP: spacious layout matching mockup === */}
      <motion.div
        className="hidden sm:block p-6 sm:p-7 relative"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <div className="flex items-center gap-6 flex-wrap">
          {/* Left: greeting + subtitle */}
          <motion.div className="flex flex-col gap-1 min-w-0 flex-1" variants={item}>
            <h1
              className="text-2xl md:text-[26px] font-bold tracking-tight whitespace-nowrap"
              style={{ color: T.textPrimary, letterSpacing: "-0.02em" }}
            >
              {greeting}&nbsp;👋
            </h1>
            <span className="text-[13px]" style={{ color: T.textMuted }}>
              {today} · оновлено зараз
            </span>
          </motion.div>

          {/* Right: chips (4 pills max — match mockup) */}
          <motion.div className="flex flex-wrap gap-2.5 ml-auto" variants={item}>
            <MiniChip icon={FolderKanban} label={`${activeProjectsCount} активних`} color={T.accentPrimary} />
            <MiniChip icon={AlertCircle} label={`${overdueTasksCount} прострочених`} color={overdueTasksCount > 0 ? T.danger : T.success} alert={overdueTasksCount > 0} />
            <MiniChip icon={dueTodayCount > 0 ? CalendarClock : CheckCircle2} label={`${dueTodayCount} на сьогодні`} color={dueTodayCount > 0 ? T.warning : T.success} />
            <MiniChip icon={netProfit >= 0 ? TrendingUp : TrendingDown} label={`${formatCurrencyCompact(netProfit)} прибуток`} color={netProfit >= 0 ? T.success : T.danger} alert={netProfit < 0} />
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

function InlineChip({
  icon: Icon,
  text,
  color,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  text: string;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color }}>
      <Icon size={10} style={{ color }} />
      {text}
    </span>
  );
}

function MiniChip({
  icon: Icon,
  label,
  color,
  alert,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  color: string;
  alert?: boolean;
}) {
  // Split "12 проєктів" → value "12" + unit "проєктів"
  const m = /^(-?[\d\s.,kKmM₴+]+)(\s+.+)?$/.exec(label);
  const hasNumber = !!m;
  const value = hasNumber ? m[1].trim() : "";
  const unit = hasNumber && m[2] ? m[2].trim() : label;

  return (
    <div
      className="premium-card flex flex-col gap-1 rounded-xl px-4 py-2.5 min-w-[130px]"
      style={{
        backgroundColor: "var(--t-panel)",
        border: `1px solid ${alert ? color + "40" : "var(--t-border)"}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color }} />
        <span
          className="text-[10px] font-semibold tracking-wider uppercase"
          style={{ color: "var(--t-text-3)" }}
        >
          {unit}
        </span>
      </div>
      {hasNumber && (
        <span
          className="text-[20px] sm:text-[22px] font-bold tabular-nums tracking-tight leading-none"
          style={{ color: alert ? color : "var(--t-text-1)", letterSpacing: "-0.02em" }}
        >
          {value}
        </span>
      )}
    </div>
  );
}
