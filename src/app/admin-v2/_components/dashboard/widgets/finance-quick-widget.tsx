"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Plus, Wallet, Folder } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
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

  return (
    <WidgetShell
      icon={<Wallet size={14} />}
      title="Фінансування"
      action={{ href: "/admin-v2/financing", label: "Відкрити" }}
    >
      <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex items-center gap-4">
          <BalanceRing income={income} expense={expense} balance={balance} />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <LegendRow color={T.success} label="Надходження" value={income} />
            <LegendRow color={T.danger} label="Витрати" value={expense} />
            <LegendRow
              color={balance >= 0 ? T.success : T.danger}
              label="Баланс"
              value={balance}
              bold
            />
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
  const data = [
    { name: "Надходження", value: Math.max(income, 0) },
    { name: "Витрати", value: Math.max(expense, 0) },
  ];
  const hasData = data[0].value + data[1].value > 0;

  return (
    <div className="relative flex h-[92px] w-[92px] flex-shrink-0 items-center justify-center">
      {hasData ? (
        <PieChart width={92} height={92}>
          <Pie
            data={data}
            cx={46}
            cy={46}
            innerRadius={32}
            outerRadius={45}
            startAngle={90}
            endAngle={-270}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={T.success} />
            <Cell fill={T.danger} />
          </Pie>
        </PieChart>
      ) : (
        <div
          className="h-[78px] w-[78px] rounded-full"
          style={{ border: `8px solid ${T.borderSoft}` }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="text-[9px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          БАЛАНС
        </span>
        <span
          className="text-[12px] font-bold leading-tight"
          style={{ color: balance >= 0 ? T.success : T.danger }}
        >
          {formatCurrencyCompact(balance)}
        </span>
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
  bold,
}: {
  color: string;
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 truncate" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span
        className={bold ? "font-bold" : "font-semibold"}
        style={{ color: bold ? color : T.textPrimary }}
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
            className="h-10 rounded-lg"
            style={{ backgroundColor: T.panelElevated, opacity: 0.5 }}
          />
        ))}
      </div>
    );
  }

  if (folders.length === 0) return null;

  return (
    <div>
      <div
        className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider"
        style={{ color: T.textMuted }}
      >
        <Folder size={10} />
        ОСТАННІ ПАПКИ
      </div>
      <ul className="flex flex-col gap-1">
        {folders.slice(0, 4).map((f) => (
          <li key={f.id}>
            <Link
              href={`/admin-v2/financing?folderId=${f.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:brightness-[0.97]"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <FolderRing income={f.income} expense={f.expense} color={f.color} />
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[11.5px] font-semibold"
                  style={{ color: T.textPrimary }}
                >
                  {f.name}
                </span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span
                    className="inline-flex items-center gap-0.5"
                    style={{ color: T.success }}
                  >
                    <TrendingUp size={9} /> {formatCurrencyCompact(f.income)}
                  </span>
                  <span
                    className="inline-flex items-center gap-0.5"
                    style={{ color: T.danger }}
                  >
                    <TrendingDown size={9} /> {formatCurrencyCompact(f.expense)}
                  </span>
                </span>
              </span>
              <span
                className="flex-shrink-0 text-[11px] font-bold"
                style={{ color: f.balance >= 0 ? T.success : T.danger }}
              >
                {f.balance >= 0 ? "+" : "−"}
                {formatCurrencyCompact(Math.abs(f.balance))}
              </span>
            </Link>
          </li>
        ))}
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
  const incomeRatio = total > 0 ? (income / total) * 100 : 0;
  const ring = `conic-gradient(${T.success} 0% ${incomeRatio}%, ${T.danger} ${incomeRatio}% 100%)`;
  if (total === 0) {
    return (
      <span
        className="h-6 w-6 flex-shrink-0 rounded-full"
        style={{
          border: `2px solid ${color ?? T.borderSoft}`,
        }}
      />
    );
  }
  return (
    <span
      className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
      style={{ background: ring }}
    >
      <span
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: color ?? T.panel }}
      />
    </span>
  );
}
