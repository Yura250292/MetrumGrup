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
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";

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

  return (
    <section
      className="rounded-xl sm:rounded-2xl relative overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
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

      {/* === DESKTOP: compact layout === */}
      <div className="hidden sm:block p-4 sm:p-5">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Left: greeting */}
          <div className="flex flex-col gap-0 min-w-0">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              {today.toUpperCase()}
            </span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
              {greeting}
            </h1>
          </div>

          {/* Right: chips */}
          <div className="flex flex-wrap gap-2 ml-auto">
            <MiniChip icon={FolderKanban} label={`${activeProjectsCount} проєктів`} color={T.accentPrimary} />
            <MiniChip icon={AlertCircle} label={`${overdueTasksCount} прострочених`} color={overdueTasksCount > 0 ? T.danger : T.success} alert={overdueTasksCount > 0} />
            <MiniChip icon={Wallet} label={`${overduePaymentsCount} платежів`} color={overduePaymentsCount > 0 ? T.danger : T.success} alert={overduePaymentsCount > 0} />
            <MiniChip icon={netProfit >= 0 ? TrendingUp : TrendingDown} label={`${formatCurrencyCompact(netProfit)}`} color={netProfit >= 0 ? T.success : T.danger} alert={netProfit < 0} />
            {isStable ? (
              <MiniChip icon={CheckCircle2} label="Стабільно" color={T.success} />
            ) : (
              <MiniChip icon={ShieldAlert} label={`${attentionZones} зони уваги`} color={attentionZones >= 2 ? T.danger : T.warning} alert />
            )}
          </div>
        </div>
      </div>
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
  return (
    <div
      className="flex items-center gap-2 rounded-lg sm:rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2"
      style={{
        backgroundColor: color + "10",
        border: `1px solid ${color}${alert ? "30" : "18"}`,
      }}
    >
      <Icon size={13} style={{ color }} />
      <span className="text-[11px] sm:text-[13px] font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
