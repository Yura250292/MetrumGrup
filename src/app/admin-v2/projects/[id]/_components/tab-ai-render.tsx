"use client";

import { useState, useEffect } from "react";
import { Sparkles, Plus, Coins } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiRenderJobs, useAiRenderJob, useCancelAiRender, useCreateAiRender } from "@/hooks/useAiRender";
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
  const createRender = useCreateAiRender(projectId);

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

  const handleGenerate3D = async (outputUrl: string) => {
    const views = [
      { prompt: "Transform into a close-up 3D cutaway view from the front-left corner, low camera angle at 30 degrees, walls cut at mid-height showing interior of all rooms, detailed furniture and textures visible, warm golden hour lighting through windows, photorealistic architectural visualization, 8k", w: 1024, h: 768 },
      { prompt: "Transform into a close-up 3D cutaway view from the back-right corner, low camera angle at 30 degrees, opposite side of the apartment, walls cut showing kitchen and bathroom interiors, evening ambient lighting, photorealistic architectural render, 8k", w: 1024, h: 768 },
      { prompt: "Transform into a dramatic close-up 3D isometric model of this apartment, camera very close, 45 degree angle, walls at half height, all rooms visible with furniture and decor, strong directional sunlight casting shadows, looks like a premium architectural scale model, photorealistic, ultra detailed 8k", w: 1024, h: 1024 },
    ];

    for (const view of views) {
      try {
        const job = await createRender.mutateAsync({
          mode: "TOPDOWN_TO_3D" as AiRenderJobDTO["mode"],
          inputUrl: outputUrl,
          prompt: view.prompt,
          width: view.w,
          height: view.h,
        });
        setPollingJobId(job.id);
      } catch {
        // continue with next view
      }
    }
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
              onGenerate3D={handleGenerate3D}
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
