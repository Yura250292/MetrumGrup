"use client";

import { X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import type { FinancingFilters, ProjectOption, UserOption } from "./types";
import { FINANCE_STATUS_LABELS, type FinanceEntryStatus } from "./types";

const KIND_LABELS: Record<string, string> = { PLAN: "План", FACT: "Факт" };
const TYPE_LABELS: Record<string, string> = { INCOME: "Доходи", EXPENSE: "Витрати" };
const ATT_LABELS: Record<string, string> = { true: "З файлами", false: "Без файлів" };
const COST_TYPE_LABELS: Record<string, string> = {
  MATERIAL: "Матеріали",
  LABOR: "Робота",
  SUBCONTRACT: "Підряд",
  EQUIPMENT: "Техніка",
  OVERHEAD: "Накладні",
  OTHER: "Інше",
};

type Chip = { key: keyof FinancingFilters | "dateRange"; label: string; clear: () => void };

function safeFormat(d: string) {
  try {
    return format(new Date(d), "d MMM", { locale: uk });
  } catch {
    return d;
  }
}

export function ActiveFilterChips({
  filters,
  setFilters,
  resetFilters,
  projects,
  users,
  scope,
}: {
  filters: FinancingFilters;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
  resetFilters: () => void;
  projects: ProjectOption[];
  users: UserOption[];
  scope?: { id: string; title: string };
}) {
  const chips: Chip[] = [];

  if (filters.search.trim()) {
    chips.push({
      key: "search",
      label: `«${filters.search.trim()}»`,
      clear: () => setFilters((p) => ({ ...p, search: "" })),
    });
  }

  if (!scope && filters.projectId) {
    const proj = projects.find((p) => p.id === filters.projectId);
    chips.push({
      key: "projectId",
      label: `Проєкт: ${proj?.title ?? "—"}`,
      clear: () => setFilters((p) => ({ ...p, projectId: "" })),
    });
  }

  if (!scope && filters.folderId) {
    chips.push({
      key: "folderId",
      label: "Папка обрана",
      clear: () => setFilters((p) => ({ ...p, folderId: "" })),
    });
  }

  if (filters.kind) {
    chips.push({
      key: "kind",
      label: KIND_LABELS[filters.kind] ?? filters.kind,
      clear: () => setFilters((p) => ({ ...p, kind: "" })),
    });
  }

  if (filters.type) {
    chips.push({
      key: "type",
      label: TYPE_LABELS[filters.type] ?? filters.type,
      clear: () => setFilters((p) => ({ ...p, type: "" })),
    });
  }

  if (filters.status) {
    chips.push({
      key: "status",
      label:
        FINANCE_STATUS_LABELS[filters.status as FinanceEntryStatus] ?? filters.status,
      clear: () => setFilters((p) => ({ ...p, status: "" })),
    });
  }

  if (filters.category) {
    chips.push({
      key: "category",
      label: FINANCE_CATEGORY_LABELS[filters.category] ?? filters.category,
      clear: () => setFilters((p) => ({ ...p, category: "" })),
    });
  }

  if (filters.subcategory) {
    chips.push({
      key: "subcategory",
      label: `Підкат.: ${filters.subcategory}`,
      clear: () => setFilters((p) => ({ ...p, subcategory: "" })),
    });
  }

  if (filters.costCodeId) {
    chips.push({
      key: "costCodeId",
      label: "Стаття обрана",
      clear: () => setFilters((p) => ({ ...p, costCodeId: "" })),
    });
  }

  if (filters.costType) {
    chips.push({
      key: "costType",
      label: COST_TYPE_LABELS[filters.costType] ?? filters.costType,
      clear: () => setFilters((p) => ({ ...p, costType: "" })),
    });
  }

  if (filters.counterpartyId) {
    chips.push({
      key: "counterpartyId",
      label: "Контрагент обраний",
      clear: () => setFilters((p) => ({ ...p, counterpartyId: "" })),
    });
  }

  if (filters.responsibleId) {
    const u = users.find((x) => x.id === filters.responsibleId);
    chips.push({
      key: "responsibleId",
      label: `Автор: ${u?.name ?? "—"}`,
      clear: () => setFilters((p) => ({ ...p, responsibleId: "" })),
    });
  }

  if (filters.hasAttachments) {
    chips.push({
      key: "hasAttachments",
      label: ATT_LABELS[filters.hasAttachments] ?? filters.hasAttachments,
      clear: () => setFilters((p) => ({ ...p, hasAttachments: "" })),
    });
  }

  if (filters.from || filters.to) {
    const from = filters.from ? safeFormat(filters.from) : "…";
    const to = filters.to ? safeFormat(filters.to) : "…";
    chips.push({
      key: "dateRange",
      label: `${from} → ${to}`,
      clear: () => setFilters((p) => ({ ...p, from: "", to: "" })),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        Активні:
      </span>
      {chips.map((chip) => (
        <button
          key={String(chip.key) + chip.label}
          onClick={chip.clear}
          className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 text-[11.5px] font-semibold transition hover:brightness-95 group"
          style={{
            backgroundColor: T.accentPrimarySoft,
            color: T.accentPrimary,
            border: `1px solid ${T.accentPrimary}40`,
          }}
          title="Прибрати фільтр"
        >
          <span className="truncate max-w-[180px]">{chip.label}</span>
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full transition group-hover:bg-white/20"
            style={{ backgroundColor: `${T.accentPrimary}22` }}
          >
            <X size={10} />
          </span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          onClick={resetFilters}
          className="ml-1 text-[11px] font-medium underline-offset-2 hover:underline"
          style={{ color: T.textMuted }}
        >
          Скинути все
        </button>
      )}
    </div>
  );
}
