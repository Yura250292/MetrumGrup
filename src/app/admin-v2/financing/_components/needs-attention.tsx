"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Receipt,
  FolderX,
  TrendingUp,
  Banknote,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import type { FinanceEntryDTO, FinanceSummaryDTO, FinancingFilters } from "./types";

type CashGap = { from: string; depth: number };

type AttentionItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  count: number;
  severity: "danger" | "warning" | "info";
  onAction?: () => void;
};

const SEVERITY_RANK: Record<AttentionItem["severity"], number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

export function NeedsAttention({
  entries,
  summary,
  onSwitchTab,
  setFilters,
  scope,
}: {
  entries: FinanceEntryDTO[];
  summary: FinanceSummaryDTO;
  onSwitchTab: (tab: "overview" | "operations" | "calendar" | "archive") => void;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
  scope?: { id: string; title: string };
}) {
  // Async fetch of next-30d cashflow for gap detection.
  const [gaps, setGaps] = useState<CashGap[] | null>(null);
  useEffect(() => {
    let alive = true;
    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + 30);
    const params = new URLSearchParams();
    params.set("granularity", "WEEK");
    params.set("from", now.toISOString());
    params.set("to", to.toISOString());
    if (scope?.id) params.set("projectId", scope.id);
    fetch(`/api/admin/financing/cashflow?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.gaps) setGaps(j.gaps);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [scope?.id]);

  const items = useMemo(() => {
    const result: AttentionItem[] = [];
    const now = new Date();

    // Cash-gap detection from API (server-side computed, includes opening balance).
    if (gaps && gaps.length > 0) {
      const worst = gaps.reduce((acc, g) => (g.depth < acc.depth ? g : acc), gaps[0]);
      result.push({
        id: "cash_gap",
        icon: <AlertTriangle size={14} />,
        label: "Касовий розрив попереду",
        description: `${gaps.length} період${gaps.length === 1 ? "" : gaps.length < 5 ? "и" : "ів"} з негативним балансом, мін. ${formatCurrency(worst.depth)}`,
        count: gaps.length,
        severity: "danger",
        onAction: () => onSwitchTab("calendar"),
      });
    }

    // APPROVED expense entries with occurredAt < now and status != PAID
    // — рахунок підтверджений, дата минула, але все ще не оплачений.
    const overduePayments = entries.filter(
      (e) =>
        e.kind === "FACT" &&
        e.type === "EXPENSE" &&
        e.status === "APPROVED" &&
        new Date(e.occurredAt) < now,
    );
    if (overduePayments.length > 0) {
      const totalOverdue = overduePayments.reduce((s, e) => s + Number(e.amount), 0);
      result.push({
        id: "overdue_payments",
        icon: <Clock size={14} />,
        label: "Заборгованість підрядникам",
        description: `${overduePayments.length} оплат на ${formatCurrency(totalOverdue)} прострочено`,
        count: overduePayments.length,
        severity: "danger",
        onAction: () => {
          setFilters((p) => ({ ...p, kind: "FACT", type: "EXPENSE", status: "APPROVED" }));
          onSwitchTab("operations");
        },
      });
    }

    const overduePlans = entries.filter(
      (e) => e.kind === "PLAN" && new Date(e.occurredAt) < now,
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

    const noReceipts = entries.filter(
      (e) => e.kind === "FACT" && e.type === "EXPENSE" && e.attachments.length === 0,
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

    const unclassified = entries.filter(
      (e) => e.kind === "FACT" && e.projectId === null && e.folderId === null,
    );
    if (unclassified.length > 0) {
      result.push({
        id: "unclassified",
        icon: <FolderX size={14} />,
        label: "Без проєкту і папки",
        description: `${unclassified.length} фактичних операцій не прив'язані`,
        count: unclassified.length,
        severity: "info",
        onAction: () => {
          setFilters((p) => ({ ...p, kind: "FACT" }));
          onSwitchTab("operations");
        },
      });
    }

    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingLarge = entries.filter(
      (e) =>
        e.kind === "PLAN" &&
        e.type === "EXPENSE" &&
        new Date(e.occurredAt) >= now &&
        new Date(e.occurredAt) <= sevenDaysAhead,
    );

    if (upcomingLarge.length > 0) {
      const totalUpcoming = upcomingLarge.reduce((s, e) => s + Number(e.amount), 0);
      result.push({
        id: "upcoming_large",
        icon: <Banknote size={14} />,
        label: "Великі витрати найближчими днями",
        description: `${upcomingLarge.length} планових на ${formatCurrency(totalUpcoming)} протягом 7 днів`,
        count: upcomingLarge.length,
        severity: "warning",
        onAction: () => {
          setFilters((p) => ({ ...p, kind: "PLAN", type: "EXPENSE" }));
          onSwitchTab("operations");
        },
      });
    }

    return result.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }, [entries, summary, onSwitchTab, setFilters, gaps]);

  if (items.length === 0) return null;

  const primary = items.filter((i) => i.severity === "danger");
  const secondary = items.filter((i) => i.severity !== "danger");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          Потребує уваги
        </span>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          ({items.length})
        </span>
      </div>

      {/* Primary: danger items as full cards */}
      {primary.length > 0 && (
        <div className="flex flex-col gap-2">
          {primary.map((item) => (
            <PrimaryCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Secondary: warning + info as compact chips */}
      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondary.map((item) => (
            <Chip key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrimaryCard({ item }: { item: AttentionItem }) {
  return (
    <button
      onClick={item.onAction}
      disabled={!item.onAction}
      className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition group disabled:cursor-default"
      style={{
        backgroundColor: T.dangerSoft,
        borderLeft: `3px solid ${T.danger}`,
      }}
    >
      <span
        className="relative flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0"
        style={{ backgroundColor: `${T.danger}1f`, color: T.danger }}
      >
        {item.icon}
        <span
          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-pulse"
          style={{ backgroundColor: T.danger, boxShadow: `0 0 0 2px var(--t-panel)` }}
        />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-bold" style={{ color: T.textPrimary }}>
          {item.label}
        </div>
        <div className="text-[11px] truncate sm:whitespace-normal" style={{ color: T.textSecondary }}>
          {item.description}
        </div>
      </div>
      <span
        className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-bold text-white flex-shrink-0"
        style={{ backgroundColor: T.danger }}
      >
        {item.count}
      </span>
      {item.onAction && (
        <ArrowRight
          size={14}
          className="flex-shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: T.danger }}
        />
      )}
    </button>
  );
}

function Chip({ item }: { item: AttentionItem }) {
  const color = item.severity === "warning" ? T.warning : T.accentPrimary;
  const bg = item.severity === "warning" ? T.warningSoft : T.accentPrimarySoft;

  return (
    <button
      onClick={item.onAction}
      disabled={!item.onAction}
      className="flex items-center gap-2 rounded-full pl-2 pr-3 py-1.5 text-[11.5px] transition disabled:cursor-default hover:brightness-95"
      style={{ backgroundColor: bg, color }}
      title={item.description}
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ backgroundColor: color, color: "#fff" }}
      >
        {item.icon}
      </span>
      <span className="font-semibold">{item.label}</span>
      <span
        className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9.5px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {item.count}
      </span>
    </button>
  );
}
