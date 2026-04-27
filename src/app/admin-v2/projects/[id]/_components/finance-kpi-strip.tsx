"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  PieChart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";

type BudgetMatrix = {
  totals: {
    plan: number;
    revised: number;
    committed: number;
    actual: number;
    forecast: number;
    variance: number;
  };
  meta: {
    estimatesIncluded: number;
    unclassifiedActual: number;
    unclassifiedPlan: number;
  };
};

type CashflowResponse = {
  openingBalance: number;
  buckets: Array<{
    key: string;
    from: string;
    runningBalance: number;
    hasGap: boolean;
  }>;
  totals: { incoming: number; outgoing: number; net: number };
  gaps: { from: string; to: string; depth: number }[];
};

/**
 * Compact strip of finance KPIs for the project Overview tab.
 * Pulls from /budget-vs-actual and /financing/cashflow concurrently.
 */
export function FinanceKpiStrip({ projectId }: { projectId: string }) {
  const [budget, setBudget] = useState<BudgetMatrix | null>(null);
  const [cashflow, setCashflow] = useState<CashflowResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        // Cashflow window: today → today + 30d
        const now = new Date();
        const to = new Date(now);
        to.setDate(to.getDate() + 30);
        const from = new Date(now);
        from.setHours(0, 0, 0, 0);

        const cfParams = new URLSearchParams();
        cfParams.set("granularity", "WEEK");
        cfParams.set("projectId", projectId);
        cfParams.set("from", from.toISOString());
        cfParams.set("to", to.toISOString());

        const [bvaRes, cfRes] = await Promise.all([
          fetch(`/api/admin/projects/${projectId}/budget-vs-actual`, { cache: "no-store" }),
          fetch(`/api/admin/financing/cashflow?${cfParams}`, { cache: "no-store" }),
        ]);
        if (alive && bvaRes.ok) setBudget(await bvaRes.json());
        if (alive && cfRes.ok) setCashflow(await cfRes.json());
      } catch {
        /* silent */
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-6 text-[12px]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={14} className="animate-spin" /> Завантажуємо фінансові KPI…
      </div>
    );
  }

  // Margin = (revised - actual) / revised — projected margin if everything stays planned.
  const plan = budget?.totals.plan ?? 0;
  const actual = budget?.totals.actual ?? 0;
  const variance = budget?.totals.variance ?? 0;
  const marginPct = plan > 0 ? Math.round(((plan - actual) / plan) * 100) : null;
  const completionPct = plan > 0 ? Math.round((actual / plan) * 100) : null;

  // Worst running balance over the next 30d.
  const minBalance =
    cashflow && cashflow.buckets.length > 0
      ? Math.min(cashflow.openingBalance, ...cashflow.buckets.map((b) => b.runningBalance))
      : null;
  const firstGap = cashflow?.gaps[0];

  const hasAnyData =
    (budget?.meta.estimatesIncluded ?? 0) > 0 ||
    plan > 0 ||
    actual > 0 ||
    (cashflow && cashflow.buckets.some((b) => b.runningBalance !== 0));

  if (!hasAnyData) {
    return (
      <div
        className="rounded-2xl px-4 py-3 text-[12px] flex items-center gap-2"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <PieChart size={14} />
        <span>
          Фінансові KPI з'являться після підтвердження кошторису та призначення статей витрат на операції.
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiTile
        label="План"
        value={formatCurrencyCompact(plan)}
        sub={budget && budget.meta.estimatesIncluded > 0 ? `${budget.meta.estimatesIncluded} кошторис${budget.meta.estimatesIncluded === 1 ? "" : "и"}` : undefined}
        icon={<Wallet size={12} />}
      />
      <KpiTile
        label="Факт"
        value={formatCurrencyCompact(actual)}
        sub={completionPct !== null ? `${completionPct}% від плану` : undefined}
        tone={
          completionPct === null
            ? "muted"
            : completionPct > 100
            ? "bad"
            : completionPct >= 80
            ? "warn"
            : "good"
        }
        icon={completionPct !== null && completionPct > 100 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      />
      <KpiTile
        label="Маржа"
        value={marginPct !== null ? `${marginPct}%` : "—"}
        sub={variance !== 0 ? `залишок ${formatCurrencyCompact(variance)}` : undefined}
        tone={
          marginPct === null ? "muted" : marginPct < 0 ? "bad" : marginPct < 10 ? "warn" : "good"
        }
        icon={<PieChart size={12} />}
      />
      <KpiTile
        label="Касовий розрив 30д"
        value={
          firstGap
            ? formatCurrencyCompact(firstGap.depth)
            : minBalance !== null
            ? formatCurrencyCompact(minBalance)
            : "—"
        }
        sub={
          firstGap
            ? `від ${format(new Date(firstGap.from), "d MMM", { locale: uk })}`
            : minBalance !== null && minBalance >= 0
            ? "розривів не очікується"
            : undefined
        }
        tone={firstGap ? "bad" : minBalance !== null && minBalance >= 0 ? "good" : "muted"}
        icon={firstGap ? <AlertTriangle size={12} /> : undefined}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn" | "muted";
  icon?: React.ReactNode;
}) {
  const color =
    tone === "good"
      ? T.success
      : tone === "bad"
      ? T.danger
      : tone === "warn"
      ? T.warning
      : tone === "muted"
      ? T.textSecondary
      : T.textPrimary;
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-base font-bold tabular-nums sm:text-lg" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px]" style={{ color: T.textMuted }}>
          {sub}
        </div>
      )}
    </div>
  );
}
