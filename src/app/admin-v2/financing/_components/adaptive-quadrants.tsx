"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, HelpCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { QuadrantCard } from "./quadrant-card";
import type {
  FinanceEntryDTO,
  FinanceSummaryDTO,
  FinancingFilters,
  Lens,
  QuadrantPreset,
} from "./types";

/**
 * AdaptiveQuadrants — rendering layer над QuadrantCard.
 * Замість статичного 2×2 показує 1–4 картки залежно від (lens × flow).
 *
 * Дані:
 *   - `entries` уже відфільтровані хуком за lens (через financeNatures),
 *     тому quadrantEntries природно містять лише записи поточного lens.
 *   - `summary` (Phase 4.4) має shelves: budget/commitments/actualCash/unclassified.
 *     ми обираємо потрібний shelf під lens.
 *
 * Підпис карток адаптивний до lens: «Планові витрати» / «Обовʼязання» /
 * «Фактичні виплати» / «Без класифікації» — щоб користувач читав картку
 * у тій же ментальній моделі, що й LensPicker.
 */

type Flow = "ALL" | "INCOME" | "EXPENSE";

export function AdaptiveQuadrants({
  lens,
  flow,
  summary,
  quadrantEntries,
  scope,
  onAdd,
  onImport,
  onEdit,
  onArchive,
  onDelete,
  onMoveToFolder,
  onSwitchTab,
  setFilters,
}: {
  lens: Lens;
  flow: Flow;
  summary: FinanceSummaryDTO;
  quadrantEntries: Record<string, FinanceEntryDTO[]>;
  scope?: { id: string; title: string };
  onAdd: (preset: QuadrantPreset) => void;
  onImport?: (preset: QuadrantPreset) => void;
  onEdit: (e: FinanceEntryDTO) => void;
  onArchive: (e: FinanceEntryDTO) => void;
  onDelete?: (e: FinanceEntryDTO) => void;
  onMoveToFolder?: (e: FinanceEntryDTO) => void;
  onSwitchTab?: (tab: "overview" | "operations" | "calendar" | "archive") => void;
  /** Для footer-CTA «Усі N →»: фіксуємо kind+type перед switch на Операції. */
  setFilters?: React.Dispatch<React.SetStateAction<FinancingFilters>>;
}) {
  const cards = useMemo(() => buildCards(lens, flow, summary), [lens, flow, summary]);

  // UNCLASSIFIED — окрема рендер-гілка з CTA замість стандартних карток.
  if (lens === "UNCLASSIFIED") {
    const unclassEntries = [
      ...(quadrantEntries["PLAN:EXPENSE"] ?? []),
      ...(quadrantEntries["PLAN:INCOME"] ?? []),
      ...(quadrantEntries["FACT:EXPENSE"] ?? []),
      ...(quadrantEntries["FACT:INCOME"] ?? []),
    ];
    const totalSum =
      summary.unclassified.income.sum + summary.unclassified.expense.sum;
    const totalCount =
      summary.unclassified.income.count + summary.unclassified.expense.count;
    return (
      <section
        className="flex flex-col gap-3 rounded-2xl p-4 sm:p-5"
        style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <header className="flex items-center gap-3">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: `${T.warning}1f`, color: T.warning }}
          >
            <HelpCircle size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
              Без класифікації
            </h3>
            <p className="text-[12px]" style={{ color: T.textMuted }}>
              {totalCount} записів · {totalSum.toLocaleString("uk-UA")} ₴ — потребують перевірки
              та призначення фінансової природи
            </p>
          </div>
          {onSwitchTab && (
            <button
              onClick={() => onSwitchTab("operations")}
              className="rounded-lg border px-3 py-2 text-[12px] font-semibold transition hover:brightness-[0.97]"
              style={{
                borderColor: T.accentPrimary,
                color: T.accentPrimary,
                background: T.panel,
              }}
            >
              Класифікувати →
            </button>
          )}
        </header>
        {unclassEntries.length > 0 && (
          <div className="text-[12px]" style={{ color: T.textSecondary }}>
            Відкрийте «Операції» щоб призначити статтю витрат і фінансову природу.
          </div>
        )}
      </section>
    );
  }

  if (cards.length === 0) return null;

  const gridCols = cards.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2";

  // Скільки рядків залишити видимими у компактному вигляді.
  // 1 картка → можна показати більше; 2+ карток поруч → 5 на кожну.
  const visibleLimit = cards.length === 1 ? 12 : 5;

  // Default open: лише коли картка одна (focused view).
  // 2+ карток → починаємо згорнутими, щоб Огляд не був стіною списків.
  const cardsDefaultOpen = cards.length === 1;

  return (
    <div>
      <span
        className="text-[12px] font-semibold mb-3 block"
        style={{ color: T.textSecondary }}
      >
        {sectionTitleForLens(lens, flow)}
      </span>
      <div className={`grid ${gridCols} gap-4`}>
        {cards.map((c) => {
          const cardEntries = quadrantEntries[c.entriesKey] ?? [];
          const handleViewAll =
            onSwitchTab && setFilters
              ? () => {
                  // Перенесемо kind+type у фільтри і відкриємо повний список Операцій.
                  setFilters((prev) => ({
                    ...prev,
                    kind: c.preset.kind,
                    type: c.preset.type,
                  }));
                  onSwitchTab("operations");
                }
              : undefined;
          return (
            <QuadrantCard
              key={c.entriesKey}
              title={c.title}
              icon={c.icon}
              accent={c.accent}
              stats={c.stats}
              pairedSum={c.pairedSum}
              pairedLabel={c.pairedLabel}
              entries={cardEntries}
              onAdd={() => onAdd(c.preset)}
              onImport={onImport ? () => onImport(c.preset) : undefined}
              onEdit={onEdit}
              onArchive={onArchive}
              onDelete={onDelete}
              onMoveToFolder={onMoveToFolder}
              onViewAll={handleViewAll}
              visibleLimit={visibleLimit}
              defaultOpen={cardsDefaultOpen}
              showProject={!scope}
              planned={c.planned}
            />
          );
        })}
      </div>
    </div>
  );
}

// === Card builder ===

type EntriesKey = "PLAN:EXPENSE" | "PLAN:INCOME" | "FACT:EXPENSE" | "FACT:INCOME";

type CardCfg = {
  title: string;
  icon: React.ReactNode;
  accent: string;
  stats: { sum: number; count: number };
  pairedSum?: number;
  pairedLabel?: string;
  entriesKey: EntriesKey;
  preset: QuadrantPreset;
  planned?: boolean;
};

function buildCards(
  lens: Lens,
  flow: Flow,
  summary: FinanceSummaryDTO,
): CardCfg[] {
  switch (lens) {
    case "ALL":
      return buildAllLens(flow, summary);
    case "BUDGET":
      return buildBudgetLens(flow, summary);
    case "COMMITTED":
      return buildCommittedLens(flow, summary);
    case "ACTUAL":
      return buildActualLens(flow, summary);
    case "UNCLASSIFIED":
      // Render handled separately above.
      return [];
  }
}

function buildAllLens(flow: Flow, summary: FinanceSummaryDTO): CardCfg[] {
  const all: CardCfg[] = [
    {
      title: "Планові витрати",
      icon: <TrendingDown size={16} />,
      accent: T.warning,
      stats: summary.plan.expense,
      pairedSum: summary.fact.expense.sum,
      pairedLabel: "факт",
      entriesKey: "PLAN:EXPENSE",
      preset: { kind: "PLAN", type: "EXPENSE", intent: "BUDGET" },
      planned: true,
    },
    {
      title: "Планові доходи",
      icon: <TrendingUp size={16} />,
      accent: T.accentPrimary,
      stats: summary.plan.income,
      pairedSum: summary.fact.income.sum,
      pairedLabel: "факт",
      entriesKey: "PLAN:INCOME",
      preset: { kind: "PLAN", type: "INCOME", intent: "BUDGET" },
      planned: true,
    },
    {
      title: "Фактичні витрати",
      icon: <TrendingDown size={16} />,
      accent: T.danger,
      stats: summary.fact.expense,
      pairedSum: summary.plan.expense.sum,
      pairedLabel: "план",
      entriesKey: "FACT:EXPENSE",
      preset: { kind: "FACT", type: "EXPENSE", intent: "ACTUAL" },
    },
    {
      title: "Фактичні доходи",
      icon: <TrendingUp size={16} />,
      accent: T.success,
      stats: summary.fact.income,
      pairedSum: summary.plan.income.sum,
      pairedLabel: "план",
      entriesKey: "FACT:INCOME",
      preset: { kind: "FACT", type: "INCOME", intent: "ACTUAL" },
    },
  ];
  if (flow === "ALL") return all;
  return all.filter((c) =>
    flow === "INCOME" ? c.entriesKey.endsWith("INCOME") : c.entriesKey.endsWith("EXPENSE"),
  );
}

function buildBudgetLens(flow: Flow, summary: FinanceSummaryDTO): CardCfg[] {
  // BUDGET → всі записи kind=PLAN. Використовуємо summary.budget shelf.
  const expense: CardCfg = {
    title: "Планові витрати (бюджет)",
    icon: <TrendingDown size={16} />,
    accent: T.warning,
    stats: summary.budget.expense,
    pairedSum: summary.actualCash.expense.sum,
    pairedLabel: "оплачено",
    entriesKey: "PLAN:EXPENSE",
    preset: { kind: "PLAN", type: "EXPENSE", intent: "BUDGET" },
    planned: true,
  };
  const income: CardCfg = {
    title: "Планові доходи (бюджет)",
    icon: <TrendingUp size={16} />,
    accent: T.accentPrimary,
    stats: summary.budget.income,
    pairedSum: summary.actualCash.income.sum,
    pairedLabel: "надійшло",
    entriesKey: "PLAN:INCOME",
    preset: { kind: "PLAN", type: "INCOME", intent: "BUDGET" },
    planned: true,
  };
  if (flow === "ALL") return [expense, income];
  if (flow === "INCOME") return [income];
  return [expense];
}

function buildCommittedLens(flow: Flow, summary: FinanceSummaryDTO): CardCfg[] {
  // COMMITTED → kind=FACT з financeNature=COMMITTED_*. Це борги/очікувані надходження.
  const expense: CardCfg = {
    title: "Борги постачальникам",
    icon: <TrendingDown size={16} />,
    accent: T.warning,
    stats: summary.commitments.expense,
    pairedSum: summary.actualCash.expense.sum,
    pairedLabel: "оплачено",
    entriesKey: "FACT:EXPENSE",
    preset: { kind: "FACT", type: "EXPENSE", intent: "COMMITTED" },
  };
  const income: CardCfg = {
    title: "Очікувані надходження",
    icon: <TrendingUp size={16} />,
    accent: T.accentPrimary,
    stats: summary.commitments.income,
    pairedSum: summary.actualCash.income.sum,
    pairedLabel: "отримано",
    entriesKey: "FACT:INCOME",
    preset: { kind: "FACT", type: "INCOME", intent: "COMMITTED" },
  };
  if (flow === "ALL") return [expense, income];
  if (flow === "INCOME") return [income];
  return [expense];
}

function buildActualLens(flow: Flow, summary: FinanceSummaryDTO): CardCfg[] {
  // ACTUAL → kind=FACT з financeNature=ACTUAL_*. Реально оплачені.
  const expense: CardCfg = {
    title: "Реальні виплати",
    icon: <TrendingDown size={16} />,
    accent: T.danger,
    stats: summary.actualCash.expense,
    pairedSum: summary.budget.expense.sum,
    pairedLabel: "план",
    entriesKey: "FACT:EXPENSE",
    preset: { kind: "FACT", type: "EXPENSE", intent: "ACTUAL" },
  };
  const income: CardCfg = {
    title: "Реальні надходження",
    icon: <TrendingUp size={16} />,
    accent: T.success,
    stats: summary.actualCash.income,
    pairedSum: summary.budget.income.sum,
    pairedLabel: "план",
    entriesKey: "FACT:INCOME",
    preset: { kind: "FACT", type: "INCOME", intent: "ACTUAL" },
  };
  if (flow === "ALL") return [expense, income];
  if (flow === "INCOME") return [income];
  return [expense];
}

function sectionTitleForLens(lens: Lens, flow: Flow): string {
  const flowSuffix =
    flow === "INCOME" ? " — доходи" : flow === "EXPENSE" ? " — витрати" : "";
  switch (lens) {
    case "ALL":
      return `План / факт по квадрантах${flowSuffix}`;
    case "BUDGET":
      return `Бюджет${flowSuffix}`;
    case "COMMITTED":
      return `Зобовʼязання${flowSuffix}`;
    case "ACTUAL":
      return `Кеш${flowSuffix}`;
    case "UNCLASSIFIED":
      return "Без класифікації";
  }
}
