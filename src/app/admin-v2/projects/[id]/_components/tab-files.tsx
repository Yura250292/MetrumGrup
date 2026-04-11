"use client";

import { ProjectFilesSection } from "@/components/projects/ProjectFilesSection";
import { CommentThread } from "@/components/collab/CommentThread";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DARK_VARS } from "@/app/admin-v2/_lib/dark-overrides";

export function TabFiles({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <h2 className="mb-4 text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Файли проєкту
        </h2>
        <div className="admin-dark" style={DARK_VARS}>
          <ProjectFilesSection projectId={projectId} />
        </div>
      </div>

      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <h2 className="mb-4 text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Обговорення
        </h2>
        <div className="admin-dark" style={DARK_VARS}>
          <CommentThread entityType="PROJECT" entityId={projectId} />
        </div>
      </div>
    </div>
  );
}
