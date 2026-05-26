"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, PieChart } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

type StaticProps = {
  projectId: string;
  totalBudget: number;
  totalPaid: number;
  paidPercent: number;
  stagesCount: number;
  factIncome: number;
  factExpense: number;
  factBalance: number;
  canViewFinance: boolean;
};

/**
 * Єдиний source of truth для KPI проєкту (заміняє дві раніше окремі стопки —
 * хедерну й `FinanceKpiStrip` на табі «Огляд»).
 *
 * Пілюлі: Бюджет (+ #етапів), Виконання (% оплат + ₴), Факт-баланс (+ дельта
 * доходів/витрат) + Маржа (client-fetch, тільки для SUPER_ADMIN/finance).
 */
export function ProjectKpiStrip({
  projectId,
  totalBudget,
  totalPaid,
  paidPercent,
  stagesCount,
  factIncome,
  factExpense,
  factBalance,
  canViewFinance,
}: StaticProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTile
        label="Бюджет"
        value={formatCurrency(totalBudget)}
        sub={`${stagesCount} ${pluralizeStages(stagesCount)}`}
      />
      <KpiTile
        label="Виконання"
        value={`${paidPercent}%`}
        sub={`${formatCurrencyCompact(totalPaid)} сплачено`}
        tone={paidPercent >= 100 ? "good" : paidPercent >= 50 ? "default" : "muted"}
      />
      <KpiTile
        label="Факт · баланс"
        value={formatCurrency(factBalance)}
        sub={`+${formatCurrencyCompact(factIncome)} / −${formatCurrencyCompact(factExpense)}`}
        tone={factBalance >= 0 ? "good" : "bad"}
      />
      {canViewFinance ? (
        <MarginPillClient projectId={projectId} />
      ) : (
        <KpiTile label="Маржа" value="—" sub="доступно адміну" tone="muted" />
      )}
    </div>
  );
}

function pluralizeStages(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "етапів";
  if (last === 1) return "етап";
  if (last >= 2 && last <= 4) return "етапи";
  return "етапів";
}

type BudgetMatrix = {
  totals: {
    plan: number;
    actual: number;
    variance: number;
  };
};

type CashflowResponse = {
  openingBalance: number;
  buckets: Array<{ runningBalance: number }>;
  gaps: Array<{ from: string; depth: number }>;
};

function MarginPillClient({ projectId }: { projectId: string }) {
  const [budget, setBudget] = useState<BudgetMatrix | null>(null);
  const [cashflow, setCashflow] = useState<CashflowResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
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
          fetch(`/api/admin/projects/${projectId}/budget-vs-actual`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/financing/cashflow?${cfParams}`, { cache: "no-store" }),
        ]);
        if (alive && bvaRes.ok) setBudget(await bvaRes.json());
        if (alive && cfRes.ok) setCashflow(await cfRes.json());
      } catch {
        /* silent — пілюля просто покаже «—» */
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
        className="flex items-center justify-center rounded-xl py-4 text-[11px]"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        <Loader2 size={14} className="animate-spin" />
      </div>
    );
  }

  const plan = budget?.totals.plan ?? 0;
  const actual = budget?.totals.actual ?? 0;
  const marginPct = plan > 0 ? Math.round(((plan - actual) / plan) * 100) : null;
  const firstGap = cashflow?.gaps[0];

  return (
    <KpiTile
      label="Маржа"
      value={marginPct !== null ? `${marginPct}%` : "—"}
      sub={
        firstGap ? (
          <span className="flex items-center gap-1" style={{ color: T.danger }}>
            <AlertTriangle size={10} /> касовий розрив
          </span>
        ) : marginPct !== null && marginPct >= 0 ? (
          "розривів немає"
        ) : undefined
      }
      tone={
        marginPct === null
          ? "muted"
          : marginPct < 0
            ? "bad"
            : marginPct < 10
              ? "warn"
              : "good"
      }
      icon={<PieChart size={10} />}
    />
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
  sub?: React.ReactNode;
  tone?: "good" | "bad" | "warn" | "muted" | "default";
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
      className="flex flex-col gap-1 rounded-xl px-3 py-3 sm:px-4 min-w-0 overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span
        className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold tracking-wider truncate"
        style={{ color: T.textMuted }}
      >
        {icon}
        <span>{label.toUpperCase()}</span>
      </span>
      <div className="flex items-baseline gap-1 sm:gap-2 min-w-0">
        <span
          className="text-base sm:text-lg font-bold truncate tabular-nums"
          style={{ color }}
        >
          {value}
        </span>
      </div>
      {sub && (
        <span
          className="text-[10px] sm:text-[11px] truncate"
          style={{ color: T.textMuted }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
