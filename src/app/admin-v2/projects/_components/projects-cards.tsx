"use client";

import Link from "next/link";
import {
  MapPin,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck,
  Building2,
} from "lucide-react";
import type { ProjectWithAggregations } from "@/lib/projects/aggregations";
import type { ProjectStatus } from "@prisma/client";
import { PROJECT_STATUS_LABELS, STAGE_LABELS } from "@/lib/constants";
import { formatDateShort } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DeleteProjectButton } from "./delete-project-button";
import { MoveProjectButton } from "./project-folders-client";
import type { ProjectExtra, ProjectRow } from "./projects-types";

export function ProjectsCards({
  projects,
  canDelete,
  currentFolderId,
}: {
  projects: ProjectRow[];
  canDelete: boolean;
  currentFolderId: string | null;
}) {
  return (
    <section className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          extra={p.extra}
          canDelete={canDelete}
          currentFolderId={currentFolderId}
        />
      ))}
    </section>
  );
}

function ProjectCard({
  project,
  extra,
  canDelete,
  currentFolderId,
}: {
  project: ProjectWithAggregations;
  extra: ProjectExtra;
  canDelete: boolean;
  currentFolderId: string | null;
}) {
  const teamCount = project.team.length;
  const isActive = project.status === "ACTIVE";
  const isDraft = project.status === "DRAFT";

  return (
    <Link
      href={`/admin-v2/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl transition hover:brightness-95"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="relative aspect-[16/9] flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: T.panelElevated }}
      >
        {extra.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={extra.coverImage} alt={project.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 size={56} style={{ color: T.borderStrong }} />
          </div>
        )}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1.5 sm:gap-2">
          <StatusBadge status={project.status} />
          <span className="hidden sm:inline-flex">
            <MoveProjectButton projectId={project.id} currentFolderId={currentFolderId} />
          </span>
          {canDelete && <DeleteProjectButton projectId={project.id} projectTitle={project.title} />}
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 p-4"
          style={{
            background:
              "linear-gradient(to top, var(--t-panel-94) 0%, var(--t-panel-56) 50%, transparent 100%)",
          }}
        >
          <h3
            className="text-base font-bold leading-tight line-clamp-2"
            style={{ color: T.textPrimary }}
          >
            {project.title}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 sm:gap-4 p-3 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <CheckChip
            icon={isActive ? CheckCircle2 : Clock}
            label={isActive ? "Активний" : isDraft ? "Чернетка" : PROJECT_STATUS_LABELS[project.status]}
            tone={isActive ? "success" : isDraft ? "warning" : "muted"}
          />
          <CheckChip
            icon={extra.hasApprovedEstimate ? CheckCircle2 : FileCheck}
            label={
              extra.hasApprovedEstimate
                ? "Кошторис затверджено"
                : extra.estimatesCount > 0
                  ? `${extra.estimatesCount} кошторисів`
                  : "Без кошторису"
            }
            tone={
              extra.hasApprovedEstimate ? "success" : extra.estimatesCount > 0 ? "warning" : "muted"
            }
          />
        </div>

        {project.address && (
          <div className="flex items-start gap-2">
            <MapPin size={14} style={{ color: T.textMuted }} className="mt-0.5 flex-shrink-0" />
            <span className="text-[12px] leading-snug line-clamp-2" style={{ color: T.textSecondary }}>
              {project.address}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: T.textMuted }}>{STAGE_LABELS[project.currentStage]}</span>
            <span className="font-bold" style={{ color: T.accentPrimary }}>
              {project.stageProgress}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: T.panelSoft }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${project.stageProgress}%`,
                backgroundColor:
                  project.stageProgress >= 80
                    ? T.success
                    : project.stageProgress >= 30
                      ? T.accentPrimary
                      : T.warning,
              }}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-2 pt-2 border-t"
          style={{ borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-1.5">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Users size={11} style={{ color: T.accentPrimary }} />
            </div>
            <span className="text-[11px] font-semibold truncate" style={{ color: T.textSecondary }}>
              {teamCount} {teamCount === 1 ? "учасник" : "учасн."}
            </span>
          </div>

          {(project.startDate || extra.expectedEndDate) && (
            <div
              className="flex items-center gap-1 text-[10px] sm:text-[11px] min-w-0 truncate"
              style={{ color: T.textMuted }}
            >
              <Calendar size={11} className="flex-shrink-0" />
              <span>
                {project.startDate ? formatDateShort(project.startDate) : "—"}
                {" — "}
                {extra.expectedEndDate ? formatDateShort(extra.expectedEndDate) : "—"}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function CheckChip({
  icon: Icon,
  label,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  tone: "success" | "warning" | "muted";
}) {
  const colors: Record<typeof tone, { bg: string; fg: string }> = {
    success: { bg: T.successSoft, fg: T.success },
    warning: { bg: T.warningSoft, fg: T.warning },
    muted: { bg: T.panelElevated, fg: T.textMuted },
  };
  const c = colors[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold max-w-full min-w-0"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span className="flex-shrink-0">
        <Icon size={11} style={{ color: c.fg }} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const label = PROJECT_STATUS_LABELS[status] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    ACTIVE: { bg: T.successSoft, fg: T.success },
    ON_HOLD: { bg: T.warningSoft, fg: T.warning },
    COMPLETED: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    CANCELLED: { bg: T.dangerSoft, fg: T.danger },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}
