"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Plus, Wallet } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact, formatDateShort } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

type FinanceQuad = { sum: number; count: number };
type FinanceSummary = {
  plan: { income: FinanceQuad; expense: FinanceQuad };
  fact: { income: FinanceQuad; expense: FinanceQuad };
  balance: number;
};
type FinanceEntry = {
  id: string;
  title: string;
  amount: string;
  type: "INCOME" | "EXPENSE";
  kind: "PLAN" | "FACT";
  occurredAt: string;
};

export function FinanceQuickWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "finance-quick"],
    queryFn: async () => {
      const res = await fetch("/api/admin/financing");
      if (res.status === 403) return null; // not permitted role
      if (!res.ok) throw new Error("Не вдалося завантажити фінанси");
      return (await res.json()) as { data: FinanceEntry[]; summary: FinanceSummary };
    },
    refetchInterval: 2 * 60_000,
    retry: false,
  });

  if (data === null) {
    return (
      <WidgetShell icon={<Wallet size={14} />} title="Фінансування">
        <div className="flex h-full items-center justify-center text-[12px]" style={{ color: T.textMuted }}>
          Доступ обмежений роллю
        </div>
      </WidgetShell>
    );
  }

  const income = data?.summary?.fact.income.sum ?? 0;
  const expense = data?.summary?.fact.expense.sum ?? 0;
  const balance = data?.summary?.balance ?? 0;
  const recent = (data?.data ?? []).slice(0, 3);

  return (
    <WidgetShell
      icon={<Wallet size={14} />}
      title="Фінансування"
      action={{ href: "/admin-v2/financing", label: "Відкрити" }}
    >
      {isLoading ? (
        <div className="flex h-full flex-col gap-2">
          <div className="h-14 rounded-lg" style={{ backgroundColor: T.panelElevated, opacity: 0.5 }} />
          <div className="h-6 rounded-lg" style={{ backgroundColor: T.panelElevated, opacity: 0.5 }} />
        </div>
      ) : (
        <div className="flex h-full flex-col gap-3">
          <div
            className="rounded-xl px-3 py-2"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              БАЛАНС (ФАКТ)
            </div>
            <div
              className="text-[18px] font-bold leading-tight"
              style={{ color: balance >= 0 ? T.success : T.danger }}
            >
              {formatCurrencyCompact(balance)}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1" style={{ color: T.success }}>
                <TrendingUp size={11} /> {formatCurrencyCompact(income)}
              </span>
              <span className="inline-flex items-center gap-1" style={{ color: T.danger }}>
                <TrendingDown size={11} /> {formatCurrencyCompact(expense)}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin-v2/financing?new=INCOME"
              className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.success }}
            >
              <Plus size={12} /> Надходження
            </Link>
            <Link
              href="/admin-v2/financing?new=EXPENSE"
              className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.danger }}
            >
              <Plus size={12} /> Витрата
            </Link>
          </div>

          {recent.length > 0 && (
            <ul className="flex flex-col gap-1 overflow-y-auto pr-1">
              {recent.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 text-[11.5px]"
                >
                  <span className="truncate" style={{ color: T.textPrimary }}>
                    {e.title}
                  </span>
                  <span
                    className="flex-shrink-0 font-semibold"
                    style={{ color: e.type === "INCOME" ? T.success : T.danger }}
                  >
                    {e.type === "INCOME" ? "+" : "−"}
                    {formatCurrencyCompact(Number(e.amount))}
                  </span>
                  <span
                    className="hidden flex-shrink-0 sm:inline text-[10px]"
                    style={{ color: T.textMuted }}
                  >
                    {formatDateShort(e.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
