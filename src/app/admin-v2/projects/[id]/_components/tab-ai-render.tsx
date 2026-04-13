"use client";

import { useState, useEffect } from "react";
import { Sparkles, Plus, Coins } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiRenderJobs, useAiRenderJob } from "@/hooks/useAiRender";
import { AiRenderModal } from "./ai-render-modal";
import { AiRenderResultCard } from "./ai-render-result-card";
import type { AiRenderJobDTO } from "@/lib/ai-render/types";

export function TabAiRender({ projectId }: { projectId: string }) {
  const [showModal, setShowModal] = useState(false);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useAiRenderJobs(projectId);

  // Poll active job
  const { data: polledJob } = useAiRenderJob(projectId, pollingJobId);

  // Stop polling when job finishes
  useEffect(() => {
    if (polledJob && (polledJob.status === "COMPLETED" || polledJob.status === "FAILED" || polledJob.status === "CANCELLED")) {
      setPollingJobId(null);
      refetch();
    }
  }, [polledJob, refetch]);

  const jobs = data?.jobs ?? [];
  const credits = data?.credits;

  const handleRegenerate = (job: AiRenderJobDTO) => {
    setShowModal(true);
    // Could pre-fill modal from job data, for now just open it
  };

  const handleJobCreated = (jobId: string) => {
    setPollingJobId(jobId);
    refetch();
  };

  // Merge polled job into the list for real-time updates
  const displayJobs = jobs.map((j) =>
    j.id === pollingJobId && polledJob ? polledJob : j
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[13px]" style={{ color: T.textMuted }}>
            {jobs.length} {jobs.length === 1 ? "рендер" : "рендерів"}
          </span>
          {credits && (
            <span
              className="flex items-center gap-1 text-[12px] font-medium rounded-lg px-2 py-1"
              style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
            >
              <Coins size={12} />
              {credits.remaining}/{credits.total} кредитів
            </span>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Нова візуалізація
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div
          className="flex items-center justify-center rounded-2xl py-16"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: T.accentPrimary, borderTopColor: "transparent" }} />
            <span className="text-[13px]" style={{ color: T.textMuted }}>Завантаження...</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && jobs.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <Sparkles size={32} style={{ color: T.accentPrimary }} />
          <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            AI Візуалізацій ще немає
          </span>
          <span className="text-[12px] max-w-[280px]" style={{ color: T.textMuted }}>
            Завантажте ескіз або фото об'єкта та отримайте фотореалістичний рендер за секунди
          </span>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 mt-2 text-sm font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Sparkles size={14} /> Створити візуалізацію
          </button>
        </div>
      )}

      {/* Results grid */}
      {!isLoading && displayJobs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {displayJobs.map((job) => (
            <AiRenderResultCard
              key={job.id}
              job={job}
              onRegenerate={handleRegenerate}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AiRenderModal
          projectId={projectId}
          onClose={() => setShowModal(false)}
          onJobCreated={handleJobCreated}
        />
      )}
    </div>
  );
}
