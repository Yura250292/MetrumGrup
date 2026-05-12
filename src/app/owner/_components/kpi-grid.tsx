"use client";

import { motion } from "framer-motion";
import { Briefcase, ClipboardCheck, Wallet } from "lucide-react";

interface Kpis {
  planIncome: number;
  planExpense: number;
  factIncome: number;
  factExpense: number;
  totalDebt: number;
  debtorCount: number;
  activeProjects: number;
  pendingForemanReports: number;
  budgetIncome: number;
  budgetExpense: number;
  committedIncome: number;
  committedExpense: number;
  actualCashIncome: number;
  actualCashExpense: number;
}

interface Props {
  kpis: Kpis;
  /** Click on debt card → expand suppliers list. */
  onOpenDebt?: () => void;
  debtExpanded?: boolean;
}

const formatUah = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} млн`;
  }
  if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toLocaleString("uk-UA", { maximumFractionDigits: 1 })} тис`;
  }
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
};

export function KpiGrid({ kpis, onOpenDebt, debtExpanded }: Props) {
  return (
    <div className="space-y-3">
      {/* Phase 4.4 v2: Бюджет (узгоджений план) | Каса (реальні гроші).
          Семантично точніше за стару пару PLAN/FACT, яка змішувала layers. */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          delay={0}
          label="Бюджет дохід"
          value={formatUah(kpis.budgetIncome)}
          unit="грн"
          accent="incomePlan"
          subtitle={
            kpis.committedIncome > 0
              ? `+ підписано: ${formatUah(kpis.committedIncome)}`
              : undefined
          }
        />
        <KpiCard
          delay={0.04}
          label="Каса надходжень"
          value={formatUah(kpis.actualCashIncome)}
          unit="грн"
          accent="incomeFact"
          subtitle={
            kpis.budgetIncome > 0
              ? `${((kpis.actualCashIncome / kpis.budgetIncome) * 100).toFixed(0)}% від бюджету`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          delay={0.08}
          label="Бюджет витрат"
          value={formatUah(kpis.budgetExpense)}
          unit="грн"
          accent="expensePlan"
          subtitle={
            kpis.committedExpense > 0
              ? `+ обовʼязання: ${formatUah(kpis.committedExpense)}`
              : undefined
          }
        />
        <KpiCard
          delay={0.12}
          label="Каса виплат"
          value={formatUah(kpis.actualCashExpense)}
          unit="грн"
          accent="expenseFact"
          subtitle={
            kpis.budgetExpense > 0
              ? `${((kpis.actualCashExpense / kpis.budgetExpense) * 100).toFixed(0)}% від бюджету`
              : undefined
          }
        />
      </div>

      {/* Заборгованість — оранжевий, full-width, клікабельний */}
      <motion.button
        type="button"
        onClick={onOpenDebt}
        disabled={!onOpenDebt || kpis.totalDebt === 0}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full text-left rounded-2xl border ${
          kpis.totalDebt > 0
            ? "border-orange-500/40 bg-gradient-to-br from-orange-500/15 to-orange-600/5"
            : "border-white/10 bg-white/[0.04]"
        } backdrop-blur-md p-4 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] ${
          onOpenDebt && kpis.totalDebt > 0
            ? "cursor-pointer hover:border-orange-400 active:scale-[0.99]"
            : "cursor-default"
        } transition-all`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-orange-300">
            <Wallet size={12} />
            Заборгованість постачальникам
          </span>
          {onOpenDebt && kpis.totalDebt > 0 && (
            <motion.span
              animate={{ rotate: debtExpanded ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              className="text-orange-400/70 text-xs"
            >
              ▼
            </motion.span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-3xl font-black tabular-nums leading-none ${
              kpis.totalDebt > 0 ? "text-orange-300" : "text-emerald-400"
            }`}
          >
            {formatUah(kpis.totalDebt)}
          </span>
          <span className="text-xs text-orange-400/60 font-medium">грн</span>
        </div>
        {kpis.debtorCount > 0 ? (
          <div className="mt-1.5 text-[11px] text-orange-400/70">
            {kpis.debtorCount}{" "}
            {kpis.debtorCount === 1
              ? "постачальник"
              : kpis.debtorCount < 5
                ? "постачальники"
                : "постачальників"}{" "}
            · натисніть щоб {debtExpanded ? "згорнути" : "переглянути"}
          </div>
        ) : (
          <div className="mt-1.5 text-[11px] text-emerald-400/70">✓ Усі рахунки оплачені</div>
        )}
      </motion.button>

      {/* Activity metrics */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          delay={0.2}
          label="Активні проекти"
          value={String(kpis.activeProjects)}
          accent="violet"
          icon={<Briefcase size={16} />}
        />
        <KpiCard
          delay={0.24}
          label="Звіти на перевірку"
          value={String(kpis.pendingForemanReports)}
          accent={kpis.pendingForemanReports > 0 ? "amber" : "zinc"}
          icon={<ClipboardCheck size={16} />}
        />
      </div>
    </div>
  );
}

const ACCENTS = {
  incomePlan: {
    bg: "bg-emerald-500/[0.06]",
    border: "border-emerald-500/20",
    text: "text-emerald-200",
    label: "text-emerald-400/60",
  },
  incomeFact: {
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/40",
    text: "text-emerald-300",
    label: "text-emerald-400/80",
  },
  expensePlan: {
    bg: "bg-rose-500/[0.06]",
    border: "border-rose-500/20",
    text: "text-rose-200",
    label: "text-rose-400/60",
  },
  expenseFact: {
    bg: "bg-rose-500/15",
    border: "border-rose-500/40",
    text: "text-rose-300",
    label: "text-rose-400/80",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-300",
    label: "text-amber-400/70",
  },
  violet: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-300",
    label: "text-violet-400/70",
  },
  zinc: {
    bg: "bg-white/[0.04]",
    border: "border-white/10",
    text: "text-zinc-200",
    label: "text-zinc-500",
  },
} as const;

function KpiCard({
  label,
  value,
  unit,
  subtitle,
  accent,
  icon,
  delay = 0,
}: {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
  accent: keyof typeof ACCENTS;
  icon?: React.ReactNode;
  delay?: number;
}) {
  const a = ACCENTS[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl border ${a.border} ${a.bg} backdrop-blur-md p-4 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] uppercase tracking-wider font-bold ${a.label}`}>{label}</span>
        {icon && <span className={a.text}>{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums ${a.text} leading-none`}>{value}</span>
        {unit && <span className={`text-xs ${a.label} font-medium`}>{unit}</span>}
      </div>
      {subtitle && <div className={`mt-1.5 text-[11px] ${a.label} truncate`}>{subtitle}</div>}
    </motion.div>
  );
}
