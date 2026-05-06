"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { ProjectFinanceRow } from "@/lib/owner/queries";

interface Props {
  projects: ProjectFinanceRow[];
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

export function ProjectsRows({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 text-center text-zinc-500 text-sm">
        Немає проектів у цій фірмі.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((p, i) => {
        const overspent = p.burnRate !== null && p.burnRate > 1;
        const factPct = p.burnRate !== null ? Math.min(p.burnRate, 1.5) * 100 : 0;
        const planExpense = p.planExpense;
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
          >
            <Link
              href={`/owner/projects/${p.id}`}
              className="group block rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 hover:border-white/25 active:scale-[0.99] transition-all p-3 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{p.title}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-2">
                    {p.firmId === "metrum-studio" ? (
                      <span className="text-amber-400">Studio</span>
                    ) : p.firmId === "metrum-group" ? (
                      <span className="text-indigo-400">Group</span>
                    ) : null}
                    {p.firmId && <span>·</span>}
                    <span>
                      Маржа план: <span className="text-zinc-300">{formatUah(p.planMargin)} грн</span>
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-1" />
              </div>

              {/* Burn-rate bar */}
              {planExpense > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">
                      Витрачено{" "}
                      <span className={overspent ? "text-rose-300 font-bold" : "text-zinc-200"}>
                        {formatUah(p.factExpense)}
                      </span>
                      <span className="text-zinc-600"> / {formatUah(planExpense)} грн</span>
                    </span>
                    <span
                      className={`tabular-nums font-bold ${overspent ? "text-rose-300" : "text-zinc-300"} flex items-center gap-1`}
                    >
                      {overspent && <AlertTriangle size={10} />}
                      {p.burnRate !== null ? `${(p.burnRate * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${overspent ? "bg-rose-500" : factPct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(factPct, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
