"use client";

import { ProjectEstimatesSection } from "@/components/projects/ProjectEstimatesSection";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function TabEstimates({ projectId }: { projectId: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <h2 className="mb-4 text-[13px] font-bold" style={{ color: T.textPrimary }}>
        Кошториси проєкту
      </h2>
      <div className="admin-dark">
        <ProjectEstimatesSection projectId={projectId} />
      </div>
    </div>
  );
}
