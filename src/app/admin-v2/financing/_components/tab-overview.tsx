"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AdaptiveQuadrants } from "./adaptive-quadrants";
import { NeedsAttention } from "./needs-attention";
import { CashflowChart } from "./cashflow-chart";
import { detectLens } from "./lens-bar";
import type {
  FinanceEntryDTO,
  FinanceSummaryDTO,
  QuadrantPreset,
  FinancingFilters,
} from "./types";

const CASHFLOW_OPEN_KEY = "fin-overview-cashflow-open";

export function TabOverview({
  entries,
  summary,
  loading,
  error,
  quadrantEntries,
  scope,
  filters,
  onAdd,
  onImport,
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
  filters: FinancingFilters;
  onAdd: (preset: QuadrantPreset) => void;
  onImport?: (preset: QuadrantPreset) => void;
  onEdit: (e: FinanceEntryDTO) => void;
  onArchive: (e: FinanceEntryDTO) => void;
  onDelete?: (e: FinanceEntryDTO) => void;
  onMoveToFolder?: (e: FinanceEntryDTO) => void;
  onSwitchTab: (tab: "overview" | "operations" | "calendar" | "archive") => void;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
}) {
  // Похідні від filters: активний lens і flow для AdaptiveQuadrants.
  const lens = detectLens(filters);
  const flow: "ALL" | "INCOME" | "EXPENSE" =
    filters.type === "INCOME" ? "INCOME" : filters.type === "EXPENSE" ? "EXPENSE" : "ALL";

  // Cashflow chart — згорнутий за замовчуванням, стан у localStorage (Phase 7 plan).
  const [cashflowOpen, setCashflowOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CASHFLOW_OPEN_KEY);
    if (stored === "true") setCashflowOpen(true);
  }, []);
  const toggleCashflow = () => {
    setCashflowOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CASHFLOW_OPEN_KEY, String(next));
      }
      return next;
    });
  };

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
      {/* 1. Needs attention (дія) */}
      <NeedsAttention
        entries={entries}
        summary={summary}
        onSwitchTab={onSwitchTab}
        setFilters={setFilters}
        scope={scope}
      />

      {/* 2. Adaptive quadrants (деталі) */}
      <AdaptiveQuadrants
        lens={lens}
        flow={flow}
        summary={summary}
        quadrantEntries={quadrantEntries}
        scope={scope}
        onAdd={onAdd}
        onImport={onImport}
        onEdit={onEdit}
        onArchive={onArchive}
        onDelete={onDelete}
        onMoveToFolder={onMoveToFolder}
        onSwitchTab={onSwitchTab}
        setFilters={setFilters}
      />

      {/* 3. Collapsed cashflow (аналітика) */}
      <section
        className="rounded-2xl"
        style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <button
          type="button"
          onClick={toggleCashflow}
          aria-expanded={cashflowOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:brightness-[0.98]"
        >
          <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
            Грошовий потік
          </span>
          <span
            className="text-[11px]"
            style={{ color: T.textMuted }}
          >
            {cashflowOpen ? "приховати" : "розгорнути"}
          </span>
          <ChevronDown
            size={16}
            style={{
              color: T.textMuted,
              transition: "transform 200ms",
              transform: cashflowOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
        {cashflowOpen && (
          <div className="border-t px-4 py-4" style={{ borderColor: T.borderSoft }}>
            <CashflowChart entries={entries} />
          </div>
        )}
      </section>
    </div>
  );
}
