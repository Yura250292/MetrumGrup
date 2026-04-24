import Link from "next/link";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";

type CategoryBreakdown = {
  category: string;
  amount: number;
};

export function FinancePulse({
  income,
  expense,
  netProfit,
  incomeDelta,
  expenseDelta,
  netDelta,
  periodLabel,
  expenseByCategory,
  // incomeByCategory deliberately not rendered in new design — kept in props for compat
  incomeByCategory: _incomeByCategory,
  overduePaymentsCount,
}: {
  income: number;
  expense: number;
  netProfit: number;
  incomeDelta?: { value: number; label: string };
  expenseDelta?: { value: number; label: string };
  netDelta?: { value: number; label: string };
  periodLabel: string;
  expenseByCategory: CategoryBreakdown[];
  incomeByCategory: CategoryBreakdown[];
  overduePaymentsCount: number;
}) {
  // Preserve original business rule
  const hasCashflowRisk = expense > income || overduePaymentsCount > 2;
  const maxExpense = expenseByCategory.length > 0 ? expenseByCategory[0].amount : 1;

  // Bar fill palette — distinct & soft
  const BAR_COLORS = [T.danger, T.amber, T.violet, T.sky, T.teal];

  return (
    <section
      className="premium-card rounded-2xl overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="section-head">
        <h2>Фінансовий пульс</h2>
        <span className="sub">{periodLabel}</span>
        <Link href="/admin-v2/finance" className="action">
          Деталі →
        </Link>
      </div>

      {/* 3 stat tiles */}
      <div className="grid grid-cols-3 gap-3 p-4 sm:p-5">
        <StatTile
          label="Дохід"
          value={income}
          delta={incomeDelta}
          color={T.success}
          icon={TrendingUp}
        />
        <StatTile
          label="Витрати"
          value={expense}
          delta={expenseDelta}
          color={T.danger}
          icon={TrendingDown}
          deltaInvert
        />
        <StatTile
          label="Чистий прибуток"
          value={netProfit}
          delta={netDelta}
          color={netProfit >= 0 ? T.accentPrimary : T.danger}
        />
      </div>

      {/* Cashflow risk panel (above breakdown) */}
      {hasCashflowRisk && (
        <div className="mx-4 sm:mx-5 mb-4">
          <div
            className="flex items-start gap-3 rounded-xl p-3.5"
            style={{
              backgroundColor: T.dangerSoft,
              border: `1px solid ${T.danger}40`,
            }}
          >
            <AlertTriangle size={16} style={{ color: T.danger, flexShrink: 0, marginTop: 2 }} />
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: T.danger }}
              >
                Cashflow ризик
              </span>
              <ul className="flex flex-col gap-0.5 text-[12px]" style={{ color: T.textSecondary }}>
                {expense > income && (
                  <li>
                    Витрати перевищують доходи на{" "}
                    <strong style={{ color: T.textPrimary }}>
                      {formatCurrencyCompact(expense - income)}
                    </strong>
                  </li>
                )}
                {overduePaymentsCount > 0 && (
                  <li>
                    <strong style={{ color: T.textPrimary }}>{overduePaymentsCount}</strong>{" "}
                    прострочених платежів
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Expense breakdown */}
      {expenseByCategory.length > 0 && (
        <div className="px-4 sm:px-5 pb-5">
          <div
            className="text-[10.5px] font-semibold uppercase mb-2"
            style={{ color: T.textMuted, letterSpacing: "0.08em" }}
          >
            Структура витрат
          </div>
          <div>
            {expenseByCategory.slice(0, 5).map((cat, idx) => {
              const pct = Math.max(6, (cat.amount / maxExpense) * 100);
              const barColor = BAR_COLORS[idx % BAR_COLORS.length];
              const label =
                FINANCE_CATEGORY_LABELS[cat.category] || cat.category;
              return (
                <div key={cat.category} className="bar-row">
                  <span className="name">{label}</span>
                  <div className="bar">
                    <div
                      className="fill"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                  <span className="amt">
                    {formatCurrencyCompact(cat.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  delta,
  color,
  icon: Icon,
  deltaInvert,
}: {
  label: string;
  value: number;
  delta?: { value: number; label: string };
  color: string;
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  /** When true, positive delta is rendered as bad (e.g. growing expenses). */
  deltaInvert?: boolean;
}) {
  const isPositive = (delta?.value ?? 0) > 0;
  const goodDelta = deltaInvert ? !isPositive : isPositive;
  const deltaColor = goodDelta ? T.success : T.danger;
  const Arrow = isPositive ? TrendingUp : TrendingDown;

  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl p-3.5"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={12} style={{ color }} />}
        <span
          className="text-[10.5px] font-semibold uppercase"
          style={{ color: T.textMuted, letterSpacing: "0.08em" }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-[20px] sm:text-[22px] font-bold tabular-nums leading-none"
        style={{ color, letterSpacing: "-0.01em" }}
      >
        {formatCurrencyCompact(value)}
      </div>
      {delta && delta.value !== 0 && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold w-fit px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: deltaColor + "14",
            color: deltaColor,
          }}
          title={delta.label}
        >
          <Arrow size={10} />
          {Math.abs(delta.value).toFixed(delta.value % 1 === 0 ? 0 : 1)}%
        </span>
      )}
    </div>
  );
}
