import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, STAGE_LABELS } from "@/lib/constants";
import {
  ArrowLeft,
  MapPin,
  User,
  Briefcase,
  MessageSquare,
  Camera,
  Edit3,
  BarChart3,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ProjectTabs } from "./_components/tabs";
import { ProjectCoverUpload } from "@/components/projects/ProjectCoverUpload";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

export const dynamic = "force-dynamic";

export default async function AdminV2ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const activeTab = sp.tab || "overview";

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
      stages: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { scheduledDate: "asc" } },
      photoReports: {
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { images: { take: 1 }, createdBy: { select: { name: true } } },
      },
      completionActs: { orderBy: { createdAt: "desc" } },
      _count: { select: { photoReports: true, files: true } },
    },
  });

  if (!project) notFound();

  // Convert Decimal to number once for client components
  const totalBudget = Number(project.totalBudget);
  const totalPaid = Number(project.totalPaid);
  const paidPercent = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

  const tasksEnabled = await isTasksEnabledForProject(project.id);

  return (
    <div className="flex flex-col gap-6">
      {/* Cover image upload */}
      <ProjectCoverUpload
        projectId={project.id}
        currentUrl={project.coverImageUrl ?? null}
      />

      {/* Sticky header */}
      <header className="flex flex-col gap-4">
        <Link
          href="/admin-v2/projects"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-125"
          style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
        >
          <ArrowLeft size={14} /> До списку проєктів
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ПРОЄКТ #{project.id.slice(0, 8).toUpperCase()}
            </span>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
              <h1
                className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight truncate max-w-full"
                style={{ color: T.textPrimary }}
              >
                {project.title}
              </h1>
              <StatusBadge status={project.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[11px] sm:text-[12px]" style={{ color: T.textMuted }}>
              <span className="flex items-center gap-1 truncate">
                <User size={12} className="flex-shrink-0" /> {project.client.name}
              </span>
              {project.manager?.name && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 truncate">
                    <Briefcase size={12} className="flex-shrink-0" /> {project.manager.name}
                  </span>
                </>
              )}
              {project.address && (
                <span className="flex items-center gap-1 truncate hidden sm:flex">
                  <MapPin size={12} className="flex-shrink-0" /> {project.address}
                </span>
              )}
              <span>·</span>
              <span className="truncate">Етап: {STAGE_LABELS[project.currentStage]}</span>
            </div>
          </div>

          <div className="flex w-full sm:w-auto gap-2 flex-shrink-0">
            <Link
              href={`/admin-v2/projects/${project.id}/photos/new`}
              className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tap-highlight-none active:scale-[0.97]"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              <Camera size={16} /> Додати фото
            </Link>
            <Link
              href={`/admin-v2/projects/${project.id}/stages`}
              className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tap-highlight-none active:scale-[0.97]"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              <Edit3 size={16} /> Етапи
            </Link>
            {tasksEnabled && (
              <Link
                href={`/admin-v2/projects/${project.id}/reports`}
                className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tap-highlight-none active:scale-[0.97]"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderStrong}`,
                }}
              >
                <BarChart3 size={16} /> Звіти
              </Link>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiPill label="Бюджет" value={formatCurrency(totalBudget)} />
          <KpiPill
            label="Сплачено"
            value={formatCurrency(totalPaid)}
            sub={`${paidPercent}%`}
            accent={T.success}
          />
          <KpiPill label="Етапів" value={String(project.stages.length)} />
          <KpiPill label="Файлів" value={String(project._count.files)} />
        </div>
      </header>

      {/* Tab nav + content (Client) */}
      <ProjectTabs
        activeTab={activeTab}
        projectId={project.id}
        tasksEnabled={tasksEnabled}
        project={{
          id: project.id,
          title: project.title,
          description: project.description,
          status: project.status,
          currentStage: project.currentStage,
          stageProgress: project.stageProgress,
          totalBudget,
          totalPaid,
          startDate: project.startDate,
          expectedEndDate: project.expectedEndDate,
          address: project.address,
          client: project.client,
          manager: project.manager,
          stages: project.stages.map((s) => ({
            id: s.id,
            stage: s.stage,
            status: s.status,
            progress: s.progress,
            startDate: s.startDate,
            endDate: s.endDate,
            notes: s.notes,
          })),
          payments: project.payments.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            method: p.method,
            status: p.status,
            scheduledDate: p.scheduledDate,
            paidDate: p.paidDate,
            notes: p.notes,
          })),
          photoReports: project.photoReports.map((pr) => ({
            id: pr.id,
            title: pr.title,
            createdAt: pr.createdAt,
            createdByName: pr.createdBy.name,
            firstImageUrl: pr.images[0]?.url ?? null,
          })),
          photoReportsCount: project._count.photoReports,
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
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
      className="rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide flex-shrink-0"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function KpiPill({
  label,
  value,
  sub,
  accent = T.textPrimary,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-3 sm:px-4 py-3 min-w-0 overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[9px] sm:text-[10px] font-bold tracking-wider truncate" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      <div className="flex items-baseline gap-1 sm:gap-2 min-w-0">
        <span className="text-base sm:text-lg font-bold truncate" style={{ color: accent }}>
          {value}
        </span>
        {sub && (
          <span className="text-[10px] sm:text-[11px] flex-shrink-0" style={{ color: T.textMuted }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
