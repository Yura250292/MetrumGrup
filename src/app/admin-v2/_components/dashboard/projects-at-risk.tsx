import Link from "next/link";
import { ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { STAGE_LABELS } from "@/lib/constants";
import { StatusBadge } from "./status-badge";
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

export function ProjectsAtRisk({ projects }: { projects: ProjectAtRisk[] }) {
  const hasRisks = projects.some(
    (p) => p.overdueTaskCount > 0 || p.overduePaymentCount > 0 || p.isStale
  );

  return (
    <div
      className="xl:col-span-2 rounded-2xl p-6"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[10px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            ЗОНИ РИЗИКУ
          </span>
          <h2
            className="text-base font-bold"
            style={{ color: T.textPrimary }}
          >
            Проєкти з ризиками
          </h2>
        </div>
        <Link
          href="/admin-v2/projects"
          className="flex items-center gap-1.5 text-xs font-semibold transition hover:brightness-[0.97]"
          style={{ color: T.accentPrimary }}
        >
          Усі проєкти <ArrowRight size={14} />
        </Link>
      </div>

      {!hasRisks ? (
        <div
          className="flex items-center gap-3 rounded-xl p-4"
          style={{ backgroundColor: T.successSoft }}
        >
          <CheckCircle2 size={18} style={{ color: T.success }} />
          <span className="text-[13px] font-semibold" style={{ color: T.success }}>
            Усі проєкти у нормі
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((project, idx) => {
            const projectColors = [
              { bg: T.accentPrimarySoft, fg: T.accentPrimary },
              { bg: T.emeraldSoft, fg: T.emerald },
              { bg: T.violetSoft, fg: T.violet },
              { bg: T.skySoft, fg: T.sky },
              { bg: T.amberSoft, fg: T.amber },
            ];
            const pc = projectColors[idx % projectColors.length];
            const hasAnyRisk =
              project.overdueTaskCount > 0 ||
              project.overduePaymentCount > 0 ||
              project.isStale;

            return (
              <Link
                key={project.id}
                href={`/admin-v2/projects/${project.id}`}
                className="flex items-center gap-3 rounded-xl p-3.5 transition hover:brightness-[0.97]"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                  style={{ backgroundColor: pc.bg, color: pc.fg }}
                >
                  {project.client?.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="truncate text-[14px] font-semibold"
                      style={{ color: T.textPrimary }}
                    >
                      {project.title}
                    </span>
                    <StatusBadge status={project.status as "ACTIVE"} />
                  </div>
                  <div
                    className="flex items-center gap-2 text-[11px] min-w-0"
                    style={{ color: T.textMuted }}
                  >
                    <span className="truncate flex-shrink min-w-0">
                      {project.client?.name}
                    </span>
                    {project.manager?.name && (
                      <>
                        <span className="flex-shrink-0">·</span>
                        <span className="truncate flex-shrink min-w-0">
                          {project.manager.name}
                        </span>
                      </>
                    )}
                    <span className="flex-shrink-0">·</span>
                    <span className="flex-shrink-0">
                      {STAGE_LABELS[project.currentStage]}
                    </span>
                  </div>
                </div>

                {/* Risk badges */}
                {hasAnyRisk && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {project.overdueTaskCount > 0 && (
                      <span
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      >
                        <AlertTriangle size={10} />
                        {project.overdueTaskCount} задач
                      </span>
                    )}
                    {project.overduePaymentCount > 0 && (
                      <span
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      >
                        {project.overduePaymentCount} оплат
                      </span>
                    )}
                    {project.isStale && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: T.warningSoft, color: T.warning }}
                      >
                        неактивний
                      </span>
                    )}
                  </div>
                )}

                <ArrowRight
                  size={16}
                  style={{ color: T.textMuted }}
                  className="flex-shrink-0"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
