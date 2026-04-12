"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useEstimateController } from "./_lib/use-controller";
import { EstimateHeader } from "./_components/header";
import { EstimateTabs } from "./_components/tabs";
import { FinanceModal } from "./_components/finance-modal";
import { SupplementModal } from "./_components/supplement-modal";
import { EngineerReportModal } from "@/components/admin/EngineerReportModal";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export default function AdminV2EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const c = useEstimateController(id);

  if (c.loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-16 text-sm"
        style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо кошторис…
      </div>
    );
  }

  if (!c.estimate) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/admin-v2/estimates"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
        >
          <ArrowLeft size={14} /> До списку
        </Link>
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <AlertCircle size={32} style={{ color: T.danger }} />
          <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            Кошторис не знайдено
          </span>
        </div>
      </div>
    );
  }

  const isFinancier =
    session?.user?.role === "FINANCIER" || session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <EstimateHeader controller={c} isFinancier={isFinancier} />
      <EstimateTabs controller={c} />

      {/* Modals */}
      {c.engineerReportOpen && (
        <EngineerReportModal
          open={c.engineerReportOpen}
          onClose={() => c.setEngineerReportOpen(false)}
          analysisSummary={c.estimate.analysisSummary}
          prozorroAnalysis={c.estimate.prozorroAnalysis}
          structuredReport={(c.estimate as any).structuredReport}
          bidIntelligence={(c.estimate as any).bidIntelligence}
        />
      )}
      {c.financeModalOpen && <FinanceModal controller={c} />}
      {c.supplementModalOpen && <SupplementModal controller={c} />}
    </div>
  );
}
