"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Wallet, Briefcase, ClipboardCheck } from "lucide-react";

interface Kpis {
  planIncome: number;
  planExpense: number;
  factIncome: number;
  factExpense: number;
  activeProjects: number;
  pendingForemanReports: number;
}

interface Props {
  kpis: Kpis;
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

export function KpiGrid({ kpis }: Props) {
  const planMargin = kpis.planIncome - kpis.planExpense;
  const factMargin = kpis.factIncome - kpis.factExpense;
  const burnRate = kpis.planExpense > 0 ? kpis.factExpense / kpis.planExpense : null;

  return (
    <div className="space-y-3">
      {/* Top: Profit cards (most important) */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          delay={0}
          label="Прибуток план"
          value={formatUah(planMargin)}
          unit="грн"
          accent={planMargin >= 0 ? "emerald" : "rose"}
          icon={planMargin >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        />
        <KpiCard
          delay={0.04}
          label="Прибуток факт"
          value={formatUah(factMargin)}
          unit="грн"
          accent={factMargin >= 0 ? "emerald" : "rose"}
          icon={factMargin >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          subtitle={
            burnRate !== null
              ? `${(burnRate * 100).toFixed(0)}% витрат від плану`
              : undefined
          }
        />
      </div>

      {/* Income / Expense detail */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          delay={0.08}
          label="Доходи факт"
          value={formatUah(kpis.factIncome)}
          unit="грн"
          accent="sky"
          subtitle={`з ${formatUah(kpis.planIncome)} плану`}
        />
        <KpiCard
          delay={0.12}
          label="Витрати факт"
          value={formatUah(kpis.factExpense)}
          unit="грн"
          accent="amber"
          subtitle={`з ${formatUah(kpis.planExpense)} плану`}
        />
      </div>

      {/* Activity metrics */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          delay={0.16}
          label="Активні проекти"
          value={String(kpis.activeProjects)}
          accent="violet"
          icon={<Briefcase size={16} />}
        />
        <KpiCard
          delay={0.2}
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
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-300", label: "text-emerald-400/70" },
  rose: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300", label: "text-rose-400/70" },
  sky: { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-300", label: "text-sky-400/70" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300", label: "text-amber-400/70" },
  violet: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-300", label: "text-violet-400/70" },
  zinc: { bg: "bg-white/[0.04]", border: "border-white/10", text: "text-zinc-200", label: "text-zinc-500" },
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

export { Wallet }; // for any consumer needing the icon
