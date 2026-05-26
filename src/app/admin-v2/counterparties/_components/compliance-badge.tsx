"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type CounterpartyTaxStatusLabel =
  | "ACTIVE"
  | "PROBLEM"
  | "SUSPENDED"
  | "BANKRUPT"
  | "LIQUIDATED"
  | "UNKNOWN";

const STATUS_LABELS: Record<CounterpartyTaxStatusLabel, string> = {
  ACTIVE: "Діючий",
  PROBLEM: "Проблемний",
  SUSPENDED: "Призупинено",
  BANKRUPT: "Банкрут",
  LIQUIDATED: "Ліквідовано",
  UNKNOWN: "Невідомо",
};

const STATUS_COLOR: Record<
  CounterpartyTaxStatusLabel,
  { bg: string; fg: string }
> = {
  ACTIVE: { bg: T.successSoft, fg: T.success },
  PROBLEM: { bg: T.warningSoft, fg: T.warning },
  SUSPENDED: { bg: T.warningSoft, fg: T.warning },
  BANKRUPT: { bg: T.dangerSoft, fg: T.danger },
  LIQUIDATED: { bg: T.dangerSoft, fg: T.danger },
  UNKNOWN: { bg: T.panelSoft, fg: T.textSecondary },
};

export function ComplianceBadge({
  status,
}: {
  status: CounterpartyTaxStatusLabel;
}) {
  const { bg, fg } = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: bg, color: fg }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
