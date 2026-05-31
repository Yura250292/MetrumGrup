"use client";

import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Loader2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useEstimateController } from "@/app/admin-v2/estimates/[id]/_lib/use-controller";
import { EstimateHeader } from "@/app/admin-v2/estimates/[id]/_components/header";
import { EstimateTabs } from "@/app/admin-v2/estimates/[id]/_components/tabs";
import { FinanceModal } from "@/app/admin-v2/estimates/[id]/_components/finance-modal";
import { SupplementModal } from "@/app/admin-v2/estimates/[id]/_components/supplement-modal";
import { EngineerReportModal } from "@/components/admin/EngineerReportModal";

/**
 * Inline-view одного кошторису у вкладці "Кошториси" проєкту. Замість
 * navigation на окрему сторінку /admin-v2/estimates/[id] — показуємо
 * увесь редактор тут, з back-link "← До списку кошторисів проєкту".
 *
 * Реюзаємо існуючі компоненти редактора (controller + Header + Tabs +
 * модалки). Версійність, переговори з клієнтом, заморожування —
 * усе через існуючу infrastructure (EstimateVersion, EstimateProposal).
 */
export function ProjectInlineEstimate({
  estimateId,
}: {
  estimateId: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const c = useEstimateController(estimateId);

  // Очистити ?estimateId — повертає у список кошторисів проєкту.
  const backToList = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("estimateId");
    sp.set("tab", "estimates");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  if (c.loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-16 text-sm"
        style={{
          backgroundColor: T.panel,
          color: T.textMuted,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо кошторис…
      </div>
    );
  }

  if (!c.estimate) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={backToList}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-95"
          style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
        >
          <ArrowLeft size={14} /> До списку кошторисів проєкту
        </button>
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
      {/* Власний back-link — повертає до списку кошторисів проєкту. */}
      <button
        type="button"
        onClick={backToList}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-95"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> До списку кошторисів проєкту
      </button>

      <EstimateHeader controller={c} isFinancier={isFinancier} hideBackLink />
      <EstimateTabs controller={c} />

      {/* Модалки — той самий набір що в окремій сторінці. */}
      {c.engineerReportOpen && (
        <EngineerReportModal
          open={c.engineerReportOpen}
          onClose={() => c.setEngineerReportOpen(false)}
          analysisSummary={c.estimate.analysisSummary}
          prozorroAnalysis={c.estimate.prozorroAnalysis}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          structuredReport={(c.estimate as any).structuredReport}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bidIntelligence={(c.estimate as any).bidIntelligence}
        />
      )}
      {c.financeModalOpen && <FinanceModal controller={c} />}
      {c.supplementModalOpen && <SupplementModal controller={c} />}

      {/* Підказка про версійність — щоб користувач бачив що це не просто
          форма, а workflow з переговорами/snapshot-ами. */}
      <div
        className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]"
        style={{
          backgroundColor: T.accentPrimarySoft,
          border: `1px solid ${T.accentPrimary}33`,
          color: T.accentPrimary,
        }}
      >
        <FileText size={12} className="mt-0.5 flex-shrink-0" />
        <span>
          Перед погодженням з клієнтом створюй нову версію через
          "Заморозити" — це створює immutable snapshot. Переговори з
          замовником ведуться у вкладці "Перемовини" з per-item
          approve/reject.
        </span>
      </div>
    </div>
  );
}
