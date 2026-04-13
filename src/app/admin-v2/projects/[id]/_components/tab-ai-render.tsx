"use client";

import { useState, useEffect } from "react";
import { Sparkles, Plus, Coins } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiRenderJobs, useAiRenderJob, useCancelAiRender } from "@/hooks/useAiRender";
import { AiRenderModal } from "./ai-render-modal";
import { AiRenderResultCard } from "./ai-render-result-card";
import type { AiRenderJobDTO } from "@/lib/ai-render/types";

function SkeletonCard() {
  return (
    <div
      className="overflow-hidden rounded-2xl animate-pulse"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="aspect-[4/3]" style={{ backgroundColor: T.panelElevated }} />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-4 rounded-lg w-2/3" style={{ backgroundColor: T.panelElevated }} />
        <div className="h-3 rounded-lg w-1/3" style={{ backgroundColor: T.panelElevated }} />
        <div className="h-3 rounded-lg w-1/2" style={{ backgroundColor: T.panelElevated }} />
      </div>
    </div>
  );
}

export function TabAiRender({ projectId }: { projectId: string }) {
  const [showModal, setShowModal] = useState(false);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useAiRenderJobs(projectId);
  const deleteRender = useCancelAiRender(projectId);

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

  const handleRegenerate = (_job: AiRenderJobDTO) => {
    setShowModal(true);
  };

  const handleDelete = (jobId: string) => {
    deleteRender.mutate(jobId, { onSuccess: () => refetch() });
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {!isLoading && (
            <span className="text-[13px]" style={{ color: T.textMuted }}>
              {jobs.length} {jobs.length === 1 ? "рендер" : "рендерів"}
            </span>
          )}
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
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white active:scale-[0.97] transition"
          style={{ backgroundColor: T.accentPrimary, minHeight: 44 }}
        >
          <Plus size={16} /> Нова візуалізація
        </button>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && jobs.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center px-4"
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
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 mt-2 text-sm font-bold text-white active:scale-[0.97] transition"
            style={{ backgroundColor: T.accentPrimary, minHeight: 44 }}
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
              onDelete={handleDelete}
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
