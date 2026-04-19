import Link from "next/link";
import { TrendingUp, TrendingDown, Activity, ArrowRight, AlertTriangle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import { FinanceTile } from "./finance-tile";

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
  incomeByCategory,
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
  const maxExpense = expenseByCategory.length > 0 ? expenseByCategory[0].amount : 1;
  const hasCashflowRisk = expense > income || overduePaymentsCount > 2;

  return (
    <section className="flex flex-col gap-4">
      {/* Finance tiles row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <FinanceTile
          label={`ДОХІД (${periodLabel})`}
          value={income}
          icon={TrendingUp}
          color={T.success}
          delta={incomeDelta}
        />
        <FinanceTile
          label={`ВИТРАТИ (${periodLabel})`}
          value={expense}
          icon={TrendingDown}
          color={T.danger}
          delta={expenseDelta}
        />
        <FinanceTile
          label="ЧИСТИЙ ПРИБУТОК"
          value={netProfit}
          icon={Activity}
          color={netProfit >= 0 ? T.success : T.danger}
          emphasize
          delta={netDelta}
        />
      </div>

      {/* Category breakdown + Cashflow risk */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Expense breakdown */}
        {expenseByCategory.length > 0 && (
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  СТРУКТУРА ВИТРАТ
                </span>
                <h3 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  Top категорії
                </h3>
              </div>
              <Link
                href="/admin-v2/finance"
                className="flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: T.accentPrimary }}
              >
                Детальніше <ArrowRight size={12} />
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {expenseByCategory.slice(0, 5).map((cat, idx) => {
                const pct = (cat.amount / maxExpense) * 100;
                const colors = [T.danger, T.warning, T.amber, T.rose, T.violet];
                const barColor = colors[idx % colors.length];
                const label = FINANCE_CATEGORY_LABELS[cat.category] || cat.category;
                return (
                  <div key={cat.category} className="flex items-center gap-3">
                    <span
                      className="text-[11px] font-semibold w-28 flex-shrink-0 truncate"
                      style={{ color: T.textSecondary }}
                    >
                      {label}
                    </span>
                    <div className="flex-1 h-4 rounded-md overflow-hidden" style={{ backgroundColor: barColor + "12" }}>
                      <div
                        className="h-full rounded-md flex items-center justify-end pr-2 text-[9px] font-bold"
                        style={{
                          width: `${Math.max(pct, 8)}%`,
                          background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
                          color: "#fff",
                        }}
                      >
                        {formatCurrencyCompact(cat.amount)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cashflow risk or Income breakdown */}
        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${hasCashflowRisk ? T.danger + "40" : T.borderSoft}`,
          }}
        >
          {hasCashflowRisk ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle size={16} style={{ color: T.danger }} />
                <h3 className="text-[13px] font-bold" style={{ color: T.danger }}>
                  Cashflow ризик
                </h3>
              </div>
              <div className="flex flex-col gap-2">
                {expense > income && (
                  <div
                    className="flex items-center gap-2 rounded-lg p-3"
                    style={{ backgroundColor: T.dangerSoft }}
                  >
                    <TrendingDown size={14} style={{ color: T.danger }} />
                    <span className="text-[12px] font-semibold" style={{ color: T.danger }}>
                      Витрати перевищують доходи на {formatCurrencyCompact(expense - income)}
                    </span>
                  </div>
                )}
                {overduePaymentsCount > 0 && (
                  <div
                    className="flex items-center gap-2 rounded-lg p-3"
                    style={{ backgroundColor: T.warningSoft }}
                  >
                    <AlertTriangle size={14} style={{ color: T.warning }} />
                    <span className="text-[12px] font-semibold" style={{ color: T.warning }}>
                      {overduePaymentsCount} прострочених платежів
                    </span>
                  </div>
                )}
                <Link
                  href="/admin-v2/finance"
                  className="flex items-center gap-1 text-[11px] font-semibold mt-1"
                  style={{ color: T.accentPrimary }}
                >
                  Переглянути фінанси <ArrowRight size={12} />
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-0.5">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  СТРУКТУРА ДОХОДІВ
                </span>
                <h3 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  Top категорії
                </h3>
              </div>
              {incomeByCategory.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {incomeByCategory.slice(0, 5).map((cat, idx) => {
                    const maxIncome = incomeByCategory[0].amount || 1;
                    const pct = (cat.amount / maxIncome) * 100;
                    const colors = [T.success, T.emerald, T.teal, T.sky, T.accentPrimary];
                    const barColor = colors[idx % colors.length];
                    const label = FINANCE_CATEGORY_LABELS[cat.category] || cat.category;
                    return (
                      <div key={cat.category} className="flex items-center gap-3">
                        <span className="text-[11px] font-semibold w-28 flex-shrink-0 truncate" style={{ color: T.textSecondary }}>
                          {label}
                        </span>
                        <div className="flex-1 h-4 rounded-md overflow-hidden" style={{ backgroundColor: barColor + "12" }}>
                          <div
                            className="h-full rounded-md flex items-center justify-end pr-2 text-[9px] font-bold"
                            style={{
                              width: `${Math.max(pct, 8)}%`,
                              background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
                              color: "#fff",
                            }}
                          >
                            {formatCurrencyCompact(cat.amount)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px]" style={{ color: T.textMuted }}>
                  Немає доходів за цей період
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
