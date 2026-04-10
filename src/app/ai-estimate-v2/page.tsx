"use client";

import { Loader2, Sparkles } from "lucide-react";
import { T } from "./_components/tokens";
import { SetupDesktop } from "./_components/setup-desktop";
import { ResultDesktop } from "./_components/result-desktop";
import { WizardModal } from "./_components/wizard";
import { PreAnalysisModal } from "./_components/pre-analysis";
import { RefinePanel } from "./_components/refine-panel";
import { SaveDialog } from "./_components/save-dialog";
import { SupplementPanel } from "./_components/supplement-panel";
import { useAiEstimateController } from "./_lib/use-controller";

export default function AiEstimateV2Page() {
  const controller = useAiEstimateController();

  const showResult = controller.estimate !== null;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: T.background }}>
      <div className="flex justify-center overflow-x-auto">
        {showResult ? <ResultDesktop controller={controller} /> : <SetupDesktop controller={controller} />}
      </div>

      {/* Generation overlay */}
      {controller.isChunkedGenerating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(7, 10, 17, 0.92)" }}
        >
          <div
            className="flex w-full max-w-[640px] flex-col gap-6 rounded-3xl p-10"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
          >
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: T.accentPrimarySoft }}
              >
                <Sparkles size={28} style={{ color: T.accentPrimary }} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
                  AI ГЕНЕРАЦІЯ
                </div>
                <div className="text-xl font-bold" style={{ color: T.textPrimary }}>
                  {controller.chunkedProgress?.message || "Працюємо над кошторисом…"}
                </div>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: T.panelSoft }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${controller.chunkedProgress?.progress ?? 5}%`,
                  backgroundColor: T.accentPrimary,
                }}
              />
            </div>
            <div className="flex flex-col gap-2 text-xs" style={{ color: T.textMuted }}>
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: T.accentPrimary }} />
                <span>
                  Етап:{" "}
                  <span style={{ color: T.textSecondary }}>
                    {controller.chunkedProgress?.phase || "ініціалізація"}
                  </span>
                </span>
              </div>
              {controller.chunkedSections.length > 0 && (
                <div>Готових секцій: {controller.chunkedSections.length}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {controller.wizardOpen && <WizardModal controller={controller} />}
      {controller.showPreAnalysis && <PreAnalysisModal controller={controller} />}
      {controller.refineModalOpen && <RefinePanel controller={controller} />}
      {controller.saveModalOpen && <SaveDialog controller={controller} />}
      {controller.supplementModalOpen && <SupplementPanel controller={controller} />}
    </div>
  );
}
