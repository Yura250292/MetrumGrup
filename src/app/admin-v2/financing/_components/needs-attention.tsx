"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  Receipt,
  FolderX,
  TrendingUp,
  Banknote,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import type { FinanceEntryDTO, FinanceSummaryDTO, FinancingFilters } from "./types";

type AttentionItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  count: number;
  severity: "danger" | "warning" | "info";
  onAction?: () => void;
};

export function NeedsAttention({
  entries,
  summary,
  onSwitchTab,
  setFilters,
}: {
  entries: FinanceEntryDTO[];
  summary: FinanceSummaryDTO;
  onSwitchTab: (tab: "overview" | "operations" | "calendar" | "archive") => void;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
}) {
  const items = useMemo(() => {
    const result: AttentionItem[] = [];
    const now = new Date();

    // 1. Overdue plan entries
    const overduePlans = entries.filter(
      (e) => e.kind === "PLAN" && new Date(e.occurredAt) < now
    );
    if (overduePlans.length > 0) {
      result.push({
        id: "overdue",
        icon: <Clock size={14} />,
        label: "Прострочені плани",
        description: `${overduePlans.length} планових записів з датою, що минула`,
        count: overduePlans.length,
        severity: "danger",
        onAction: () => {
          setFilters((p) => ({ ...p, kind: "PLAN" }));
          onSwitchTab("operations");
        },
      });
    }

    // 2. Overspending (fact expense > plan expense)
    if (summary.fact.expense.sum > summary.plan.expense.sum && summary.plan.expense.sum > 0) {
      const diff = summary.fact.expense.sum - summary.plan.expense.sum;
      result.push({
        id: "overspend",
        icon: <TrendingUp size={14} />,
        label: "Перевитрата",
        description: `Фактичні витрати перевищують план на ${formatCurrency(diff)}`,
        count: 1,
        severity: "danger",
      });
    }

    // 3. Fact expenses without attachments (receipts)
    const noReceipts = entries.filter(
      (e) => e.kind === "FACT" && e.type === "EXPENSE" && e.attachments.length === 0
    );
    if (noReceipts.length > 0) {
      result.push({
        id: "no_receipts",
        icon: <Receipt size={14} />,
        label: "Без чеків / вкладень",
        description: `${noReceipts.length} фактичних витрат без доданих файлів`,
        count: noReceipts.length,
        severity: "warning",
        onAction: () => {
          setFilters((p) => ({ ...p, kind: "FACT", type: "EXPENSE", hasAttachments: "false" }));
          onSwitchTab("operations");
        },
      });
    }

    // 4. Entries without project
    const noProject = entries.filter(
      (e) => e.kind === "FACT" && e.projectId === null
    );
    if (noProject.length > 0) {
      result.push({
        id: "no_project",
        icon: <FolderX size={14} />,
        label: "Без проєкту",
        description: `${noProject.length} фактичних операцій не прив'язані до проєкту`,
        count: noProject.length,
        severity: "info",
        onAction: () => {
          setFilters((p) => ({ ...p, projectId: "__NULL__", kind: "FACT" }));
          onSwitchTab("operations");
        },
      });
    }

    // 5. Large upcoming plan payments (next 7 days)
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingLarge = entries
      .filter(
        (e) =>
          e.kind === "PLAN" &&
          e.type === "EXPENSE" &&
          new Date(e.occurredAt) >= now &&
          new Date(e.occurredAt) <= sevenDaysAhead
      )
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    if (upcomingLarge.length > 0) {
      const totalUpcoming = upcomingLarge.reduce((s, e) => s + Number(e.amount), 0);
      result.push({
        id: "upcoming_large",
        icon: <Banknote size={14} />,
        label: "Великі витрати найближчими днями",
        description: `${upcomingLarge.length} планових витрат на ${formatCurrency(totalUpcoming)} протягом 7 днів`,
        count: upcomingLarge.length,
        severity: "warning",
        onAction: () => {
          setFilters((p) => ({ ...p, kind: "PLAN", type: "EXPENSE" }));
          onSwitchTab("operations");
        },
      });
    }

    return result;
  }, [entries, summary, onSwitchTab, setFilters]);

  if (items.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl px-5 py-4"
        style={{
          backgroundColor: T.successSoft,
          border: `1px solid ${T.success}`,
        }}
      >
        <CheckCircle2 size={18} style={{ color: T.success }} />
        <span className="text-[13px] font-semibold" style={{ color: T.success }}>
          Все добре — немає проблемних точок
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        ПОТРЕБУЄ УВАГИ
      </span>
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const borderColor =
            item.severity === "danger"
              ? T.danger
              : item.severity === "warning"
                ? T.warning
                : T.accentPrimary;
          const bgColor =
            item.severity === "danger"
              ? T.dangerSoft
              : item.severity === "warning"
                ? T.warningSoft
                : T.accentPrimarySoft;

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                backgroundColor: bgColor,
                borderLeft: `3px solid ${borderColor}`,
              }}
            >
              <span style={{ color: borderColor }}>{item.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-bold" style={{ color: T.textPrimary }}>
                  {item.label}
                </span>
                <p className="text-[11px]" style={{ color: T.textSecondary }}>
                  {item.description}
                </p>
              </div>
              <span
                className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: borderColor }}
              >
                {item.count}
              </span>
              {item.onAction && (
                <button
                  onClick={item.onAction}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition hover:brightness-110"
                  style={{
                    backgroundColor: T.panel,
                    color: borderColor,
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  Перегляд <ArrowRight size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
