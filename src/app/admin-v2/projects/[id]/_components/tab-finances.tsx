"use client";

import Link from "next/link";
import { Edit3, ArrowRight, Wallet } from "lucide-react";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { PaymentScheduleTable } from "@/components/dashboard/PaymentScheduleTable";
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
  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[13px] font-bold" style={{ color: T.textPrimary }}>
            <Wallet size={14} style={{ color: T.success }} /> Зведення
          </h2>
        </div>
        <div className="admin-dark">
          <FinancialSummary totalBudget={totalBudget} totalPaid={totalPaid} />
        </div>
      </div>

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
            className="flex items-center gap-1.5 text-xs font-semibold transition hover:brightness-125"
            style={{ color: T.accentPrimary }}
          >
            <Edit3 size={12} /> Розширені дії <ArrowRight size={12} />
          </Link>
        </div>
        <div className="admin-dark">
          <PaymentScheduleTable payments={payments as any} />
        </div>
      </div>
    </div>
  );
}
