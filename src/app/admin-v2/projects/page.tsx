import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProjectsWithAggregations } from "@/lib/projects/aggregations";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, STAGE_LABELS } from "@/lib/constants";
import {
  FolderKanban,
  Plus,
  MapPin,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck,
  Building2,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DeleteProjectButton } from "./_components/delete-project-button";

export const dynamic = "force-dynamic";

type ExtraInfo = {
  estimatesCount: number;
  hasApprovedEstimate: boolean;
  expectedEndDate: Date | null;
  coverImage: string | null;
};

export default async function AdminV2ProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  // 1) Reuse existing aggregations (team / status / progress / budget / address)
  const projects = await listProjectsWithAggregations(session.user.id);

  // 2) Extra fields not in aggregations: estimates count + approved flag + end date + cover photo
  const extrasMap = new Map<string, ExtraInfo>();
  if (projects.length > 0) {
    const ids = projects.map((p) => p.id);
    const extras = await prisma.project.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        expectedEndDate: true,
        coverImageUrl: true,
        estimates: {
          select: { id: true, status: true },
        },
        photoReports: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { images: { take: 1, select: { url: true } } },
        },
      },
    });
    for (const e of extras) {
      const approved = e.estimates.some(
        (es) => es.status === "APPROVED" || es.status === "FINANCE_REVIEW"
      );
      extrasMap.set(e.id, {
        estimatesCount: e.estimates.length,
        hasApprovedEstimate: approved,
        expectedEndDate: e.expectedEndDate,
        coverImage: e.coverImageUrl ?? e.photoReports[0]?.images[0]?.url ?? null,
      });
    }
  }

  const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0);
  const totalPaid = projects.reduce((sum, p) => sum + p.totalPaid, 0);
  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ВСІ ПРОЄКТИ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Проєкти
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {projects.length} {projects.length === 1 ? "проєкт" : "проєктів"} · {activeCount} активних
          </p>
        </div>
        <Link
          href="/admin-v2/projects/new"
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
          style={{
            background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
            boxShadow: `0 4px 12px ${T.accentPrimary}30`,
          }}
        >
          <Plus size={16} /> Новий проєкт
        </Link>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-3 gap-3 sm:gap-4">
        <KpiCard
          label="ВСЬОГО"
          value={String(projects.length)}
          sub="у системі"
          accent={T.sky}
          gradient="linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)"
        />
        <KpiCard
          label="ЗАГАЛЬНИЙ БЮДЖЕТ"
          value={formatCurrency(totalBudget)}
          sub={`${formatCurrency(totalPaid)} сплачено`}
          accent={T.violet}
          gradient="linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)"
        />
        <KpiCard
          label="ВИКОНАННЯ ОПЛАТ"
          value={`${totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0}%`}
          sub="від загальної суми"
          accent={T.emerald}
          gradient="linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)"
        />
      </section>

      {/* Card grid */}
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
          {projects.map((project) => {
            const extra = extrasMap.get(project.id) ?? {
              estimatesCount: 0,
              hasApprovedEstimate: false,
              expectedEndDate: null,
              coverImage: null,
            };
            return (
              <ProjectCard
                key={project.id}
                project={project}
                extra={extra}
                canDelete={isSuperAdmin}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}

/* -------------------- Card -------------------- */

function ProjectCard({
  project,
  extra,
  canDelete,
}: {
  project: Awaited<ReturnType<typeof listProjectsWithAggregations>>[number];
  extra: ExtraInfo;
  canDelete: boolean;
}) {
  const teamCount = project.team.length;
  const isActive = project.status === "ACTIVE";
  const isDraft = project.status === "DRAFT";

  return (
    <Link
      href={`/admin-v2/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl transition hover:brightness-95"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* Cover image / placeholder */}
      <div
        className="relative aspect-[16/9] flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: T.panelElevated }}
      >
        {extra.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={extra.coverImage}
            alt={project.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 size={56} style={{ color: T.borderStrong }} />
          </div>
        )}
        {/* Status pill in top-right corner */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <StatusBadge status={project.status} />
          {canDelete && (
            <DeleteProjectButton projectId={project.id} projectTitle={project.title} />
          )}
        </div>
        {/* Title overlay at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 p-4"
          style={{
            background: `linear-gradient(to top, ${T.panel}f0 0%, ${T.panel}90 50%, transparent 100%)`,
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

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Status checks row */}
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
              extra.hasApprovedEstimate
                ? "success"
                : extra.estimatesCount > 0
                  ? "warning"
                  : "muted"
            }
          />
        </div>

        {/* Address */}
        {project.address && (
          <div className="flex items-start gap-2">
            <MapPin size={14} style={{ color: T.textMuted }} className="mt-0.5 flex-shrink-0" />
            <span className="text-[12px] leading-snug line-clamp-2" style={{ color: T.textSecondary }}>
              {project.address}
            </span>
          </div>
        )}

        {/* Stage progress */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: T.textMuted }}>
              {STAGE_LABELS[project.currentStage]}
            </span>
            <span className="font-bold" style={{ color: T.accentPrimary }}>
              {project.stageProgress}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: T.panelSoft }}
          >
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

        {/* Footer: people + dates */}
        <div
          className="flex items-center justify-between gap-2 pt-2 border-t"
          style={{ borderColor: T.borderSoft }}
        >
          {/* People */}
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

          {/* Dates */}
          {(project.startDate || extra.expectedEndDate) && (
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] truncate" style={{ color: T.textMuted }}>
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

/* -------------------- Atoms -------------------- */

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
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold max-w-full"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span className="flex-shrink-0"><Icon size={11} style={{ color: c.fg }} /></span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = T.textPrimary,
  gradient,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
  gradient?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl sm:rounded-2xl p-3 sm:p-5 min-w-0 overflow-hidden"
      style={{
        background: gradient || T.panel,
        border: `1px solid ${accent}20`,
        boxShadow: `0 2px 8px ${accent}12`,
      }}
    >
      <span className="text-[9px] sm:text-[10px] font-bold tracking-wider truncate" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-[10px] sm:text-[11px] hidden sm:block truncate" style={{ color: T.textSecondary }}>
        {sub}
      </span>
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
      className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide"
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        boxShadow: `0 2px 8px rgba(0,0,0,0.12)`,
      }}
    >
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FolderKanban size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Проєктів ще немає
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Створіть перший проєкт, щоб почати роботу
      </span>
      <Link
        href="/admin-v2/projects/new"
        className="mt-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
        style={{ backgroundColor: T.accentPrimary }}
      >
        <Plus size={16} /> Створити проєкт
      </Link>
    </div>
  );
}
