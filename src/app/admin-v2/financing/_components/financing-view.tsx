"use client";

import { useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Search,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Filter,
  CircleDot,
  LayoutDashboard,
  List,
  CalendarDays,
  Archive,
  Plus,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { FINANCE_CATEGORIES } from "@/lib/constants";
import { EntryFormModal } from "./entry-form-modal";
import { QuadrantCard } from "./quadrant-card";
import { SummaryStat, formatPercent } from "./summary-stat";
import { FilterSelect, FilterInput } from "./filter-controls";
import { useFinancingData } from "./use-financing-data";
import { TabOverview } from "./tab-overview";
import { TabOperations } from "./tab-operations";
import { TabCalendar } from "./tab-calendar";
import { TabArchive } from "./tab-archive";
import { FilterBar } from "./filter-bar";
import type { ProjectOption, UserOption } from "./types";

export type { FinanceEntryDTO, FinanceSummaryDTO, ProjectOption } from "./types";

const TABS = [
  { key: "overview", label: "Огляд", icon: LayoutDashboard },
  { key: "operations", label: "Операції", icon: List },
  { key: "calendar", label: "Платіжний календар", icon: CalendarDays },
  { key: "archive", label: "Архів", icon: Archive },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function FinancingView({
  scope,
  projects,
  users = [],
  currentUserId,
  currentUserName,
}: {
  scope?: { id: string; title: string };
  projects: ProjectOption[];
  users?: UserOption[];
  currentUserId: string;
  currentUserName: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const data = useFinancingData({ scope });

  const {
    entries,
    summary,
    loading,
    error,
    exporting,
    filters,
    setFilters,
    resetFilters,
    handleSave,
    handleArchive,
    handleExport,
    editing,
    setEditing,
    createPreset,
    setCreatePreset,
    quadrantEntries,
  } = data;

  const planBalance = summary.plan.income.sum - summary.plan.expense.sum;
  const factBalance = summary.balance;

  const quickAddPresets = [
    { label: "+ Факт Витрата", kind: "FACT" as const, type: "EXPENSE" as const, color: T.danger },
    { label: "+ Факт Дохід", kind: "FACT" as const, type: "INCOME" as const, color: T.success },
    { label: "+ План Витрата", kind: "PLAN" as const, type: "EXPENSE" as const, color: T.warning },
    { label: "+ План Дохід", kind: "PLAN" as const, type: "INCOME" as const, color: T.accentPrimary },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      {!scope && (
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ФАКТ І ПЛАН РУХУ ГРОШЕЙ
            </span>
            <h1
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: T.textPrimary }}
            >
              Фінансування
            </h1>
            <p className="text-[13px] max-w-xl" style={{ color: T.textSecondary }}>
              Журнал планових і фактичних грошових операцій по проєктам та компанії
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickAddPresets.map((p) => (
              <button
                key={`${p.kind}:${p.type}`}
                onClick={() => setCreatePreset({ kind: p.kind, type: p.type })}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
                style={{ backgroundColor: p.color }}
              >
                <Plus size={13} />
                {p.label}
              </button>
            ))}
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Excel
            </button>
          </div>
        </section>
      )}

      {scope && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ color: T.textPrimary }}>
              Фінансування проєкту
            </h2>
            <p className="text-[13px]" style={{ color: T.textMuted }}>
              План і факт по «{scope.title}»
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickAddPresets.map((p) => (
              <button
                key={`${p.kind}:${p.type}`}
                onClick={() => setCreatePreset({ kind: p.kind, type: p.type })}
                className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-bold text-white transition hover:brightness-110"
                style={{ backgroundColor: p.color }}
              >
                <Plus size={11} />
                {p.label}
              </button>
            ))}
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold disabled:opacity-50"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Excel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <nav
        className="flex gap-1 overflow-x-auto rounded-xl p-1"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-[13px] font-semibold transition"
              style={{
                backgroundColor: active ? T.panel : "transparent",
                color: active ? T.accentPrimary : T.textMuted,
                border: active ? `1px solid ${T.borderSoft}` : "1px solid transparent",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Summary KPIs — visible on overview & operations */}
      {(activeTab === "overview" || activeTab === "operations") && (
        <section
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl p-3 sm:p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <SummaryStat
            label="ПЛАН БАЛАНС"
            value={formatCurrency(planBalance)}
            accent={planBalance >= 0 ? T.accentPrimary : T.warning}
            icon={<CircleDot size={12} />}
          />
          <SummaryStat
            label="ФАКТ БАЛАНС"
            value={formatCurrency(factBalance)}
            accent={factBalance >= 0 ? T.success : T.danger}
            icon={<Wallet size={12} />}
          />
          <SummaryStat
            label="ЗАВЕРШЕННЯ ПЛАНУ (ДОХ.)"
            value={formatPercent(summary.fact.income.sum, summary.plan.income.sum)}
            accent={T.textPrimary}
          />
          <SummaryStat
            label="ЗАВЕРШЕННЯ ПЛАНУ (ВИТР.)"
            value={formatPercent(summary.fact.expense.sum, summary.plan.expense.sum)}
            accent={T.textPrimary}
          />
        </section>
      )}

      {/* Filters — shared across overview/operations */}
      {(activeTab === "overview" || activeTab === "operations") && (
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          resetFilters={resetFilters}
          projects={projects}
          users={users}
          scope={scope}
        />
      )}

      {/* Tab content */}
      {activeTab === "overview" && (
        <TabOverview
          entries={entries}
          summary={summary}
          loading={loading}
          error={error}
          quadrantEntries={quadrantEntries}
          scope={scope}
          onAdd={(preset) => setCreatePreset(preset)}
          onEdit={(e) => setEditing(e)}
          onArchive={handleArchive}
          onSwitchTab={setActiveTab}
          setFilters={setFilters}
        />
      )}

      {activeTab === "operations" && (
        <TabOperations
          entries={entries}
          loading={loading}
          error={error}
          scope={scope}
          filters={filters}
          setFilters={setFilters}
          onEdit={(e) => setEditing(e)}
          onArchive={handleArchive}
        />
      )}

      {activeTab === "calendar" && (
        <TabCalendar entries={entries} loading={loading} />
      )}

      {activeTab === "archive" && (
        <TabArchive
          scope={scope}
          projects={projects}
          users={users}
          onEdit={(e) => setEditing(e)}
        />
      )}

      {/* Entry form modal */}
      {(createPreset || editing) && (
        <EntryFormModal
          mode={editing ? "edit" : "create"}
          initial={editing}
          preset={createPreset ?? undefined}
          projects={projects}
          scope={scope}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => {
            setCreatePreset(null);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
