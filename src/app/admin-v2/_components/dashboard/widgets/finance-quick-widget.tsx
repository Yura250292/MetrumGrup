"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Plus, Wallet, Folder } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { WidgetShell } from "./widget-shell";

type FinanceQuad = { sum: number; count: number };
type FinanceSummary = {
  plan: { income: FinanceQuad; expense: FinanceQuad };
  fact: { income: FinanceQuad; expense: FinanceQuad };
  balance: number;
};

type FolderCard = {
  id: string;
  name: string;
  color: string | null;
  updatedAt: string;
  income: number;
  expense: number;
  balance: number;
  entryCount: number;
};

export function FinanceQuickWidget() {
  const summaryQuery = useQuery({
    queryKey: ["dashboard", "finance-quick"],
    queryFn: async () => {
      const res = await fetch("/api/admin/financing");
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Не вдалося завантажити фінанси");
      return (await res.json()) as { summary: FinanceSummary };
    },
    refetchInterval: 2 * 60_000,
    retry: false,
  });

  const foldersQuery = useQuery({
    queryKey: ["dashboard", "finance-folders"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me/finance-folders");
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Не вдалося завантажити папки");
      return (await res.json()) as { data: { items: FolderCard[] } };
    },
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  if (summaryQuery.data === null) {
    return (
      <WidgetShell icon={<Wallet size={14} />} title="Фінансування">
        <div
          className="flex h-full items-center justify-center text-[12px]"
          style={{ color: T.textMuted }}
        >
          Доступ обмежений роллю
        </div>
      </WidgetShell>
    );
  }

  const income = summaryQuery.data?.summary?.fact.income.sum ?? 0;
  const expense = summaryQuery.data?.summary?.fact.expense.sum ?? 0;
  const balance = summaryQuery.data?.summary?.balance ?? 0;
  const folders = foldersQuery.data?.data?.items ?? [];
  const balanceColor = balance >= 0 ? T.success : T.danger;

  return (
    <WidgetShell
      icon={<Wallet size={14} />}
      title="Фінансування"
      subtitle={
        summaryQuery.isLoading
          ? "Завантаження..."
          : balance >= 0
            ? "Позитивний баланс"
            : "Перевитрата"
      }
      accent={balanceColor}
      action={{ href: "/admin-v2/financing", label: "Відкрити" }}
    >
      <div className="flex h-full flex-col gap-3.5 overflow-y-auto overscroll-contain pr-1">
        {/* Balance ring + legend */}
        <div className="flex items-center gap-4">
          <BalanceRing income={income} expense={expense} balance={balance} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <LegendRow
              color={T.success}
              icon={<TrendingUp size={10} />}
              label="Надходження"
              value={income}
            />
            <LegendRow
              color={T.danger}
              icon={<TrendingDown size={10} />}
              label="Витрати"
              value={expense}
            />
            <div
              className="mt-0.5 rounded-lg px-2.5 py-1.5"
              style={{
                background: `linear-gradient(90deg, ${balanceColor}10, ${balanceColor}04 90%)`,
                border: `1px solid ${balanceColor}22`,
              }}
            >
              <div
                className="text-[9px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                БАЛАНС
              </div>
              <div
                className="text-[14px] font-bold leading-tight tabular-nums"
                style={{ color: balanceColor }}
              >
                {balance >= 0 ? "+" : "−"}
                {formatCurrencyCompact(Math.abs(balance))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <Link
            href="/admin-v2/financing?new=INCOME"
            className="group/btn flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] touch-manipulation"
            style={{
              background: `linear-gradient(135deg, ${T.success}, ${T.success}DD)`,
              boxShadow: `0 1px 2px ${T.success}40, inset 0 1px 0 rgba(255,255,255,0.15)`,
            }}
          >
            <Plus
              size={13}
              className="transition-transform group-hover/btn:rotate-90"
            />
            Надходження
          </Link>
          <Link
            href="/admin-v2/financing?new=EXPENSE"
            className="group/btn flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] touch-manipulation"
            style={{
              background: `linear-gradient(135deg, ${T.danger}, ${T.danger}DD)`,
              boxShadow: `0 1px 2px ${T.danger}40, inset 0 1px 0 rgba(255,255,255,0.15)`,
            }}
          >
            <Plus
              size={13}
              className="transition-transform group-hover/btn:rotate-90"
            />
            Витрата
          </Link>
        </div>

        {/* Folders */}
        <FoldersSection folders={folders} isLoading={foldersQuery.isLoading} />
      </div>
    </WidgetShell>
  );
}

function BalanceRing({
  income,
  expense,
  balance,
}: {
  income: number;
  expense: number;
  balance: number;
}) {
  const total = income + expense;
  const expenseShare = total > 0 ? (expense / total) * 100 : 0;
  const fillColor = balance >= 0 ? T.success : T.danger;

  return (
    <div className="relative flex-shrink-0">
      {/* Outer soft halo */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full blur-md"
        style={{
          background: `radial-gradient(circle, ${fillColor}20, transparent 70%)`,
          transform: "scale(1.1)",
        }}
      />
      <RadialProgress
        value={total > 0 ? Math.max(expenseShare, 5) : 0}
        size={92}
        thickness={5}
        fillColor={fillColor}
        trackColor={T.borderSoft}
        rounded
        ariaLabel={`Баланс ${formatCurrencyCompact(balance)}`}
      >
        <div className="flex flex-col items-center justify-center">
          <span
            className="text-[15px] font-bold leading-none tracking-tight tabular-nums"
            style={{ color: T.textPrimary }}
          >
            {formatCurrencyCompact(total)}
          </span>
          <span
            className="mt-0.5 text-[8.5px] font-bold leading-none tracking-wider"
            style={{ color: T.textMuted }}
          >
            ОБОРОТ
          </span>
        </div>
      </RadialProgress>
    </div>
  );
}

function LegendRow({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
        style={{ backgroundColor: color + "18", color }}
      >
        {icon}
      </span>
      <span
        className="flex-1 truncate text-[11px] font-medium"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span
        className="text-[12px] font-bold tabular-nums"
        style={{ color: T.textPrimary }}
      >
        {formatCurrencyCompact(value)}
      </span>
    </div>
  );
}

function FoldersSection({
  folders,
  isLoading,
}: {
  folders: FolderCard[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-xl"
            style={{
              backgroundColor: T.panelElevated,
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  if (folders.length === 0) return null;

  return (
    <div>
      <div
        className="mb-2 flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.1em]"
        style={{ color: T.textMuted }}
      >
        <Folder size={10} />
        ОСТАННІ ПАПКИ
      </div>
      <ul className="flex flex-col gap-1.5">
        {folders.slice(0, 4).map((f) => {
          const balanceColor = f.balance >= 0 ? T.success : T.danger;
          return (
            <li key={f.id}>
              <Link
                href={`/admin-v2/financing?folderId=${f.id}`}
                className="group/folder flex min-h-[44px] items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-150 hover:-translate-y-px touch-manipulation"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.boxShadow = `0 2px 8px ${balanceColor}18`;
                  e.currentTarget.style.borderColor = balanceColor + "33";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.boxShadow = "";
                  e.currentTarget.style.borderColor = T.borderSoft;
                }}
              >
                <FolderRing income={f.income} expense={f.expense} color={f.color} />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[12px] font-semibold leading-tight tracking-[-0.01em]"
                    style={{ color: T.textPrimary }}
                  >
                    {f.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums">
                    <span
                      className="inline-flex items-center gap-0.5 font-semibold"
                      style={{ color: T.success }}
                    >
                      <TrendingUp size={8.5} /> {formatCurrencyCompact(f.income)}
                    </span>
                    <span style={{ color: T.borderSoft }}>•</span>
                    <span
                      className="inline-flex items-center gap-0.5 font-semibold"
                      style={{ color: T.danger }}
                    >
                      <TrendingDown size={8.5} /> {formatCurrencyCompact(f.expense)}
                    </span>
                  </span>
                </span>
                <span
                  className="flex-shrink-0 rounded-md px-1.5 py-1 text-[11px] font-bold leading-none tabular-nums"
                  style={{
                    color: balanceColor,
                    backgroundColor: balanceColor + "12",
                  }}
                >
                  {f.balance >= 0 ? "+" : "−"}
                  {formatCurrencyCompact(Math.abs(f.balance))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FolderRing({
  income,
  expense,
  color,
}: {
  income: number;
  expense: number;
  color: string | null;
}) {
  const total = income + expense;
  const balance = income - expense;
  const share = total > 0 ? (expense / total) * 100 : 0;
  const fill = total === 0 ? (color ?? T.borderSoft) : balance >= 0 ? T.success : T.danger;

  return (
    <RadialProgress
      value={total > 0 ? Math.max(share, 6) : 100}
      size={26}
      thickness={2.5}
      fillColor={fill}
      trackColor={T.borderSoft}
      animate={false}
      rounded
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color ?? fill }}
      />
    </RadialProgress>
  );
}
