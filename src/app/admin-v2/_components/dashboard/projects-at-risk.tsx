import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { STAGE_LABELS } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import type { ProjectStage } from "@prisma/client";

type ProjectAtRisk = {
  id: string;
  title: string;
  currentStage: ProjectStage;
  status: string;
  updatedAt: Date;
  client: { name: string | null } | null;
  manager: { name: string | null } | null;
  overdueTaskCount: number;
  overduePaymentCount: number;
  isStale: boolean;
};

// Risk score: preserve original weighting
function riskScore(p: ProjectAtRisk): number {
  return p.overdueTaskCount * 3 + p.overduePaymentCount * 5 + (p.isStale ? 2 : 0);
}

function pillClass(score: number): string {
  if (score >= 15) return "risk-pill high";
  if (score >= 8) return "risk-pill med";
  return "risk-pill low";
}

export function ProjectsAtRisk({ projects }: { projects: ProjectAtRisk[] }) {
  const hasRisks = projects.some(
    (p) => p.overdueTaskCount > 0 || p.overduePaymentCount > 0 || p.isStale
  );

  return (
    <div
      className="premium-card xl:col-span-2 rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="section-head">
        <h2>Проєкти під ризиком</h2>
        <span className="sub">{projects.length}</span>
        <Link href="/admin-v2/projects" className="action">
          Усі проєкти →
        </Link>
      </div>

      {!hasRisks ? (
        <div className="flex items-center gap-3 p-5 m-4 rounded-xl" style={{ backgroundColor: T.successSoft }}>
          <CheckCircle2 size={18} style={{ color: T.success }} />
          <span className="text-[13px] font-semibold" style={{ color: T.success }}>
            Усі проєкти у нормі
          </span>
        </div>
      ) : (
        <div>
          {projects.map((project, i) => {
            const score = riskScore(project);
            return (
              <Link
                key={project.id}
                href={`/admin-v2/projects/${project.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--t-panel-soft)]"
                style={{
                  borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                }}
              >
                <div className={pillClass(score)}>{score}</div>

                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div
                    className="text-[13px] font-semibold truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {project.title}
                  </div>
                  <div
                    className="flex items-center gap-x-3 gap-y-0.5 text-[11.5px] min-w-0 flex-wrap"
                    style={{ color: T.textMuted }}
                  >
                    {project.client?.name && (
                      <span className="truncate max-w-[140px]">
                        {project.client.name}
                      </span>
                    )}
                    {project.manager?.name && (
                      <span className="truncate max-w-[140px]">
                        {project.manager.name}
                      </span>
                    )}
                    <span>{STAGE_LABELS[project.currentStage]}</span>
                    {project.overdueTaskCount > 0 && (
                      <span className="meta-chip danger">
                        {project.overdueTaskCount} прострочених задач
                      </span>
                    )}
                    {project.overduePaymentCount > 0 && (
                      <span className="meta-chip danger">
                        {project.overduePaymentCount} прострочених платежів
                      </span>
                    )}
                    {project.isStale && (
                      <span className="meta-chip muted">затихло</span>
                    )}
                  </div>
                </div>

                <span
                  className="text-[11px] whitespace-nowrap flex-shrink-0"
                  style={{ color: T.textMuted }}
                >
                  {formatRelativeTime(project.updatedAt)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
