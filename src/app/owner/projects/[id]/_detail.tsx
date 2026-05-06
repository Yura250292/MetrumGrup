"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import type { ProjectByCostType } from "@/lib/owner/queries";

const COST_TYPE_LABELS: Record<string, string> = {
  MATERIAL: "Матеріали",
  LABOR: "Робота",
  SUBCONTRACT: "Підряд",
  EQUIPMENT: "Техніка",
  OVERHEAD: "Накладні",
  OTHER: "Інше",
};

const formatUah = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} млн`;
  }
  if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toLocaleString("uk-UA", { maximumFractionDigits: 1 })} тис`;
  }
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
};

const formatFull = (n: number): string =>
  n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });

interface Props {
  project: { id: string; title: string; address: string | null; status: string };
  totals: { planIncome: number; planExpense: number; factIncome: number; factExpense: number };
  breakdown: ProjectByCostType[];
}

export function ProjectFinanceDetail({ project, totals, breakdown }: Props) {
  const planMargin = totals.planIncome - totals.planExpense;
  const factMargin = totals.factIncome - totals.factExpense;
  const burnRate = totals.planExpense > 0 ? totals.factExpense / totals.planExpense : null;
  const overspent = burnRate !== null && burnRate > 1;
  const factPctClamp = burnRate !== null ? Math.min(burnRate, 1.5) * 100 : 0;
  const incomePct = totals.planIncome > 0 ? (totals.factIncome / totals.planIncome) * 100 : 0;

  const breakdownTotal = breakdown.reduce((s, b) => s + b.factExpense, 0);

  return (
    <div className="space-y-4">
      {project.address && (
        <div className="text-[11px] text-zinc-500 px-1">{project.address}</div>
      )}

      {/* Profit summary */}
      <div className="grid grid-cols-2 gap-2.5">
        <SummaryCard
          label="Прибуток план"
          value={formatUah(planMargin)}
          accent={planMargin >= 0 ? "emerald" : "rose"}
          icon={planMargin >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
        <SummaryCard
          label="Прибуток факт"
          value={formatUah(factMargin)}
          accent={factMargin >= 0 ? "emerald" : "rose"}
          icon={factMargin >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
      </div>

      {/* Income progress */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md p-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            Доходи
          </span>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {incomePct.toFixed(0)}% плану
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-sky-300 tabular-nums leading-none">
            {formatFull(totals.factIncome)}
          </span>
          <span className="text-xs text-zinc-500">грн</span>
          <span className="text-xs text-zinc-600 ml-2">
            з {formatFull(totals.planIncome)} плану
          </span>
        </div>
        <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-sky-500"
            style={{ width: `${Math.min(incomePct, 100)}%` }}
          />
        </div>
      </div>

      {/* Expense progress */}
      <div
        className={`rounded-2xl border backdrop-blur-md p-4 space-y-2 ${overspent ? "bg-rose-500/[0.04] border-rose-500/30" : "bg-white/[0.03] border-white/10"}`}
      >
        <div className="flex items-baseline justify-between">
          <span
            className={`text-[10px] uppercase tracking-wider font-bold ${overspent ? "text-rose-400" : "text-zinc-500"}`}
          >
            Витрати {overspent && "· перевитрата"}
          </span>
          <span
            className={`text-[11px] tabular-nums flex items-center gap-1 ${overspent ? "text-rose-300 font-bold" : "text-zinc-500"}`}
          >
            {overspent && <AlertTriangle size={10} />}
            {burnRate !== null ? `${(burnRate * 100).toFixed(0)}% плану` : "—"}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-2xl font-bold tabular-nums leading-none ${overspent ? "text-rose-300" : "text-amber-300"}`}
          >
            {formatFull(totals.factExpense)}
          </span>
          <span className="text-xs text-zinc-500">грн</span>
          <span className="text-xs text-zinc-600 ml-2">
            з {formatFull(totals.planExpense)} плану
          </span>
        </div>
        <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${overspent ? "bg-rose-500" : factPctClamp > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(factPctClamp, 100)}%` }}
          />
        </div>
      </div>

      {/* Breakdown by costType */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold mb-2 px-1">
          Структура витрат
        </h2>
        {breakdown.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 text-center text-sm text-zinc-500">
            Немає витрат у цьому проекті.
          </div>
        ) : (
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md overflow-hidden">
            <ul className="divide-y divide-white/5">
              {breakdown.map((row, idx) => {
                const label = row.costType
                  ? COST_TYPE_LABELS[row.costType] ?? row.costType
                  : "Без категорії";
                const pct =
                  breakdownTotal > 0 ? (row.factExpense / breakdownTotal) * 100 : 0;
                const overrun =
                  row.planExpense > 0 && row.factExpense > row.planExpense;
                return (
                  <motion.li
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    className="px-4 py-3"
                  >
                    <div className="flex items-baseline justify-between mb-1.5 gap-2">
                      <span className="text-sm font-semibold text-white">{label}</span>
                      <span
                        className={`text-sm tabular-nums font-bold ${overrun ? "text-rose-300" : "text-zinc-200"}`}
                      >
                        {formatFull(row.factExpense)} грн
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        {row.planExpense > 0
                          ? `Плану: ${formatFull(row.planExpense)} грн`
                          : "Без плану"}
                      </span>
                      <span className="tabular-nums">{pct.toFixed(0)}% витрат</span>
                    </div>
                    <div className="mt-1.5 relative h-1 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${overrun ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

const ACCENTS = {
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-300", label: "text-emerald-400/70" },
  rose: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300", label: "text-rose-400/70" },
} as const;

function SummaryCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: keyof typeof ACCENTS;
  icon?: React.ReactNode;
}) {
  const a = ACCENTS[accent];
  return (
    <div
      className={`rounded-2xl border ${a.border} ${a.bg} backdrop-blur-md p-3 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.4)]`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] uppercase tracking-wider font-bold ${a.label}`}>{label}</span>
        {icon && <span className={a.text}>{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold tabular-nums ${a.text} leading-none`}>{value}</span>
        <span className={`text-[10px] ${a.label}`}>грн</span>
      </div>
    </div>
  );
}
