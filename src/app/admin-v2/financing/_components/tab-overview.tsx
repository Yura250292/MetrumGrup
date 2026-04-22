"use client";

import { TrendingUp, TrendingDown, Loader2, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { QuadrantCard } from "./quadrant-card";
import { NeedsAttention } from "./needs-attention";
import { CashflowChart } from "./cashflow-chart";
import type {
  FinanceEntryDTO,
  FinanceSummaryDTO,
  QuadrantPreset,
  FinancingFilters,
} from "./types";

export function TabOverview({
  entries,
  summary,
  loading,
  error,
  quadrantEntries,
  scope,
  onAdd,
  onEdit,
  onArchive,
  onDelete,
  onMoveToFolder,
  onSwitchTab,
  setFilters,
}: {
  entries: FinanceEntryDTO[];
  summary: FinanceSummaryDTO;
  loading: boolean;
  error: string | null;
  quadrantEntries: Record<string, FinanceEntryDTO[]>;
  scope?: { id: string; title: string };
  onAdd: (preset: QuadrantPreset) => void;
  onEdit: (e: FinanceEntryDTO) => void;
  onArchive: (e: FinanceEntryDTO) => void;
  onDelete?: (e: FinanceEntryDTO) => void;
  onMoveToFolder?: (e: FinanceEntryDTO) => void;
  onSwitchTab: (tab: "overview" | "operations" | "calendar" | "archive") => void;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
}) {
  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <AlertCircle size={32} style={{ color: T.danger }} />
        <span className="text-[14px]" style={{ color: T.danger }}>
          {error}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Needs attention */}
      <NeedsAttention
        entries={entries}
        summary={summary}
        onSwitchTab={onSwitchTab}
        setFilters={setFilters}
      />

      {/* Cashflow chart */}
      <CashflowChart entries={entries} />

      {/* Quadrant grid (compact summary) */}
      <div>
        <span
          className="text-[12px] font-semibold mb-3 block"
          style={{ color: T.textSecondary }}
        >
          План / факт по квадрантах
        </span>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <QuadrantCard
            title="Планові витрати"
            icon={<TrendingDown size={16} />}
            accent={T.warning}
            stats={summary.plan.expense}
            pairedSum={summary.fact.expense.sum}
            pairedLabel="факт"
            entries={quadrantEntries["PLAN:EXPENSE"]}
            onAdd={() => onAdd({ kind: "PLAN", type: "EXPENSE" })}
            onEdit={onEdit}
            onArchive={onArchive}
            onDelete={onDelete}
            onMoveToFolder={onMoveToFolder}
            showProject={!scope}
            planned
          />
          <QuadrantCard
            title="Планові доходи"
            icon={<TrendingUp size={16} />}
            accent={T.accentPrimary}
            stats={summary.plan.income}
            pairedSum={summary.fact.income.sum}
            pairedLabel="факт"
            entries={quadrantEntries["PLAN:INCOME"]}
            onAdd={() => onAdd({ kind: "PLAN", type: "INCOME" })}
            onEdit={onEdit}
            onArchive={onArchive}
            onDelete={onDelete}
            onMoveToFolder={onMoveToFolder}
            showProject={!scope}
            planned
          />
          <QuadrantCard
            title="Фактичні витрати"
            icon={<TrendingDown size={16} />}
            accent={T.danger}
            stats={summary.fact.expense}
            pairedSum={summary.plan.expense.sum}
            pairedLabel="план"
            entries={quadrantEntries["FACT:EXPENSE"]}
            onAdd={() => onAdd({ kind: "FACT", type: "EXPENSE" })}
            onEdit={onEdit}
            onArchive={onArchive}
            onDelete={onDelete}
            onMoveToFolder={onMoveToFolder}
            showProject={!scope}
          />
          <QuadrantCard
            title="Фактичні доходи"
            icon={<TrendingUp size={16} />}
            accent={T.success}
            stats={summary.fact.income}
            pairedSum={summary.plan.income.sum}
            pairedLabel="план"
            entries={quadrantEntries["FACT:INCOME"]}
            onAdd={() => onAdd({ kind: "FACT", type: "INCOME" })}
            onEdit={onEdit}
            onArchive={onArchive}
            onDelete={onDelete}
            onMoveToFolder={onMoveToFolder}
            showProject={!scope}
          />
        </div>
      </div>
    </div>
  );
}
