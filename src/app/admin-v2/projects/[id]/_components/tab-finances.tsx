"use client";

import Link from "next/link";
import {
  Edit3,
  ArrowRight,
  Wallet,
  TrendingUp,
  Clock,
  AlertCircle,
} from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  scheduledDate: Date;
  paidDate: Date | null;
  notes: string | null;
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: T.warningSoft, fg: T.warning },
  PARTIAL: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  PAID: { bg: T.successSoft, fg: T.success },
  OVERDUE: { bg: T.dangerSoft, fg: T.danger },
};

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Банк",
  CASH: "Готівка",
  CARD: "Картка",
};

export function TabFinances({
  projectId,
  totalBudget,
  totalPaid,
  payments,
}: {
  projectId: string;
  totalBudget: number;
  totalPaid: number;
  payments: Payment[];
}) {
  const remaining = totalBudget - totalPaid;
  const percentage = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary card — native v2 */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="mb-4 flex items-center gap-2">
          <Wallet size={14} style={{ color: T.success }} />
          <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Зведення
          </h2>
        </div>

        {/* Progress overview */}
        <div
          className="flex flex-col gap-3 rounded-xl p-5 mb-4"
          style={{ backgroundColor: T.panelElevated }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: T.textSecondary }}>
              Оплата проєкту
            </span>
            <span className="text-2xl font-bold" style={{ color: T.accentPrimary }}>
              {percentage}%
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: T.panelSoft }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${percentage}%`,
                background: `linear-gradient(to right, ${T.accentPrimary}, ${T.accentSecondary})`,
              }}
            />
          </div>
          <div className="flex justify-between text-[11px]" style={{ color: T.textMuted }}>
            <span>Сплачено: {formatCurrency(totalPaid)}</span>
            <span>Всього: {formatCurrency(totalBudget)}</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard
            icon={Wallet}
            label="Бюджет"
            value={formatCurrency(totalBudget)}
            accent={T.accentPrimary}
          />
          <StatCard
            icon={TrendingUp}
            label="Сплачено"
            value={formatCurrency(totalPaid)}
            accent={T.success}
          />
          <StatCard
            icon={Clock}
            label="Залишок"
            value={formatCurrency(remaining)}
            accent={remaining > 0 ? T.warning : T.success}
          />
        </div>
      </div>

      {/* Payment schedule — native v2 */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Графік платежів
          </h2>
          <Link
            href={`/admin-v2/projects/${projectId}/finances`}
            className="flex items-center gap-1.5 text-xs font-semibold transition hover:brightness-[0.97]"
            style={{ color: T.accentPrimary }}
          >
            <Edit3 size={12} /> Розширені дії <ArrowRight size={12} />
          </Link>
        </div>

        {payments.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-xl py-10 text-center"
            style={{ backgroundColor: T.panelElevated }}
          >
            <AlertCircle size={24} style={{ color: T.textMuted }} />
            <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
              Немає платежів
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              Перейдіть у «Розширені дії», щоб додати перший
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr style={{ backgroundColor: T.panelSoft }}>
                  <Th>ДАТА</Th>
                  <Th align="right">СУМА</Th>
                  <Th>МЕТОД</Th>
                  <Th>СТАТУС</Th>
                  <Th>ПРИМІТКА</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  const colors = STATUS_COLORS[p.status] || STATUS_COLORS.PENDING;
                  return (
                    <tr
                      key={p.id}
                      style={{
                        backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                        borderTop: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <td
                        className="px-3 py-3 text-[12px]"
                        style={{ color: T.textSecondary }}
                      >
                        {formatDateShort(p.scheduledDate)}
                      </td>
                      <td
                        className="px-3 py-3 text-right text-[13px] font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {formatCurrency(Number(p.amount))}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px]"
                        style={{ color: T.textMuted }}
                      >
                        {METHOD_LABELS[p.method] || p.method}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: colors.bg, color: colors.fg }}
                        >
                          {PAYMENT_STATUS_LABELS[
                            p.status as keyof typeof PAYMENT_STATUS_LABELS
                          ] || p.status}
                        </span>
                      </td>
                      <td
                        className="px-3 py-3 text-[11px]"
                        style={{ color: T.textMuted }}
                      >
                        {p.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="flex items-center gap-2 sm:gap-3 rounded-xl p-3 sm:p-4"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-lg sm:rounded-xl"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div className="flex flex-col gap-0 min-w-0">
        <span
          className="text-[10px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          {label.toUpperCase()}
        </span>
        <span
          className="text-[14px] font-bold truncate"
          style={{ color: accent }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-3 py-2.5 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
  );
}
