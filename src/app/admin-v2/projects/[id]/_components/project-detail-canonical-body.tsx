import Link from "next/link";
import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { canViewFinance } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  Building,
  MapPin,
  Calendar,
  Briefcase,
  ExternalLink,
  Pencil,
  MoreHorizontal,
  Send,
  Check,
  Clock,
  Percent,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ListChecks,
  Users,
  HardHat,
  CalendarCheck,
  Wallet,
  AlertOctagon,
  Plus,
  CircleDot,
} from "lucide-react";
import { ProjectCoverUpload } from "@/components/projects/ProjectCoverUpload";
import { ProjectHeaderActions } from "./project-header-actions";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { listActiveMembers } from "@/lib/projects/members-service";
import { canManageProjectMembers } from "@/lib/projects/access";

/**
 * Канонічне тіло сторінки деталей проєкту. `/admin-v2/projects/[id]`
 * рендерить це коли немає `?tab=` (overview). Раніше це жило в /v2/page.tsx
 * як preview; тепер це default UI. /v2 URL → redirect на канонічний /[id].
 *
 * Усі підрозділи (?tab=finances/documents/tasks/...) і далі обробляються
 * legacy ProjectTabs у parent page.tsx.
 */
export async function ProjectDetailCanonicalBody({
  id,
  session,
}: {
  id: string;
  session: Session;
}) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      clientCounterparty: { select: { id: true, name: true } },
      manager: {
        select: { id: true, name: true, email: true, phone: true, avatar: true, role: true },
      },
      stages: {
        orderBy: { sortOrder: "asc" },
        include: { responsibleUser: { select: { id: true, name: true, avatar: true } } },
      },
      _count: { select: { photoReports: true, files: true, financeEntries: true } },
    },
  });
  if (!project) notFound();
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    notFound();
  }

  const showFinance = canViewFinance(session.user.role);
  const tasksEnabled = await isTasksEnabledForProject(project.id);
  const [members, canManageMembers, recentFiles, recentPhotoImages] = await Promise.all([
    listActiveMembers(project.id),
    canManageProjectMembers(project.id, session.user.id),
    prisma.projectFile.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        url: true,
        createdAt: true,
      },
    }),
    // Останні 6 фото-зображень. Підтягуємо одне зображення на звіт,
    // через flat-mapping (без groupBy — щоб бачити lasts-N серед усіх).
    prisma.photoReportImage.findMany({
      where: { photoReport: { projectId: project.id } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        url: true,
        thumbnailUrl: true,
        caption: true,
        createdAt: true,
        photoReportId: true,
      },
    }),
  ]);

  const stages = project.stages.filter((s) => s.kind === "STAGE");
  const completedStages = stages.filter((s) => s.status === "COMPLETED").length;
  const activeStage = stages.find((s) => s.status === "IN_PROGRESS") ?? null;
  const totalStages = stages.length;
  const overallProgress =
    totalStages > 0
      ? Math.round(
          ((completedStages + (activeStage ? activeStage.progress / 100 : 0)) /
            totalStages) *
            100,
        )
      : 0;

  const now = new Date();
  const endDate = project.expectedEndDate ?? project.actualEndDate;
  const daysToDeadline = endDate
    ? Math.round((new Date(endDate).getTime() - now.getTime()) / 86_400_000)
    : null;

  const totalBudget = Number(project.totalBudget);
  const totalPaid = Number(project.totalPaid);
  const budgetUsedPct =
    totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

  const overdueStages = stages.filter(
    (s) =>
      s.endDate &&
      new Date(s.endDate) < now &&
      s.status !== "COMPLETED",
  ).length;

  return (
    <div className="flex flex-col gap-5 pb-12">
      <HeroCard project={project} tasksEnabled={tasksEnabled} />
      <SubNavTabs
        projectId={project.id}
        tasksEnabled={tasksEnabled}
        activeTab="overview"
      />
      <ProjectOverviewContent
        project={project}
        stages={stages}
        activeStage={activeStage}
        completedStages={completedStages}
        totalStages={totalStages}
        overallProgress={overallProgress}
        showFinance={showFinance}
        totalBudget={totalBudget}
        totalPaid={totalPaid}
        budgetUsedPct={budgetUsedPct}
        daysToDeadline={daysToDeadline}
        overdueStages={overdueStages}
        members={members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          userName: m.user.name ?? "—",
          userRole: m.user.role,
          userAvatar: m.user.avatar,
          roleInProject: m.roleInProject,
        }))}
        canManageMembers={canManageMembers}
        recentFiles={recentFiles.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
          url: f.url,
          createdAt: f.createdAt.toISOString(),
        }))}
        recentPhotoImages={recentPhotoImages.map((img) => ({
          id: img.id,
          url: img.url,
          thumbnailUrl: img.thumbnailUrl,
          caption: img.caption,
          photoReportId: img.photoReportId,
        }))}
      />
    </div>
  );
}

/**
 * Контент Overview-таби: KPI strip + 2-колонкова сітка
 * (Stages | Risks/Team/Files/Photos). Без hero/nav — рендериться у
 * /[id]/page.tsx нижче за стабільним Hero+SubNavTabs.
 */
type OverviewStage = {
  id: string;
  status: string;
  progress: number;
  endDate: Date | null;
  startDate: Date | null;
  customName: string | null;
  stage: string | null;
  sortOrder: number;
  notes: string | null;
  unit: string | null;
  planVolume: unknown;
  factVolume: unknown;
  responsibleUser: { id: string; name: string | null; avatar: string | null } | null;
};

export function ProjectOverviewContent({
  project,
  stages,
  activeStage,
  completedStages,
  totalStages,
  overallProgress,
  showFinance,
  totalBudget,
  totalPaid,
  budgetUsedPct,
  daysToDeadline,
  overdueStages,
  members,
  canManageMembers,
  recentFiles,
  recentPhotoImages,
}: {
  project: ProjectShape;
  stages: OverviewStage[];
  activeStage: OverviewStage | null;
  completedStages: number;
  totalStages: number;
  overallProgress: number;
  showFinance: boolean;
  totalBudget: number;
  totalPaid: number;
  budgetUsedPct: number;
  daysToDeadline: number | null;
  overdueStages: number;
  members: TeamMemberRow[];
  canManageMembers: boolean;
  recentFiles: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    url: string;
    createdAt: string;
  }>;
  recentPhotoImages: RecentPhotoImage[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <KpiStrip
        overallProgress={overallProgress}
        completedStages={completedStages}
        totalStages={totalStages}
        showFinance={showFinance}
        budgetPaid={totalPaid}
        budgetTotal={totalBudget}
        budgetUsedPct={budgetUsedPct}
        daysToDeadline={daysToDeadline}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <StagesPanel
            stages={stages}
            activeStageId={activeStage?.id ?? null}
            completedCount={completedStages}
            totalCount={totalStages}
            projectId={project.id}
          />
        </div>
        <div className="flex flex-col gap-5">
          <RisksCard
            overdueStages={overdueStages}
            daysToDeadline={daysToDeadline}
            budgetUsedPct={budgetUsedPct}
            overallProgress={overallProgress}
          />
          <TeamCard
            project={project}
            members={members}
            canManageMembers={canManageMembers}
          />
          <FilesCard
            projectId={project.id}
            totalCount={project._count.files}
            recentFiles={recentFiles}
          />
          <PhotosCard
            projectId={project.id}
            totalCount={project._count.photoReports}
            recentImages={recentPhotoImages}
          />
        </div>
      </div>
    </div>
  );
}

type ProjectShape = {
  id: string;
  title: string;
  slug: string;
  status: string;
  address: string | null;
  startDate: Date | null;
  expectedEndDate: Date | null;
  isTestProject: boolean;
  coverImageUrl: string | null;
  clientName: string | null;
  client: { id: string; name: string; email: string | null; phone: string | null } | null;
  clientCounterparty: { id: string; name: string } | null;
  manager: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    role: string;
  } | null;
  _count: { photoReports: number; files: number; financeEntries: number };
};

export function HeroCard({
  project,
  tasksEnabled,
}: {
  project: ProjectShape;
  tasksEnabled: boolean;
}) {
  const code = `PRJ-${project.slug.toUpperCase().slice(0, 12)}`;
  const clientName =
    project.clientCounterparty?.name ?? project.client?.name ?? project.clientName ?? null;
  const daysSpan =
    project.startDate && project.expectedEndDate
      ? Math.round(
          (new Date(project.expectedEndDate).getTime() -
            new Date(project.startDate).getTime()) /
            86_400_000,
        )
      : null;
  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr_auto] gap-0">
        <div className="relative aspect-[16/11] md:aspect-auto md:min-h-[200px] overflow-hidden">
          {/* Interactive cover з upload UI (наведення показує кнопку завантажити). */}
          <div className="absolute inset-0 [&>div]:!aspect-auto [&>div]:!h-full">
            <ProjectCoverUpload
              projectId={project.id}
              currentUrl={project.coverImageUrl}
            />
          </div>
          <div
            className="absolute bottom-3 left-3 right-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium pointer-events-none z-10"
            style={{ backgroundColor: "rgba(15, 23, 42, 0.7)", color: "#CBD5E1" }}
          >
            <Briefcase size={11} />
            {project._count.photoReports} фото
            <span className="opacity-50">·</span>
            {project._count.files} файлів
          </div>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4 md:py-5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider tabular-nums"
              style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
            >
              {code}
            </span>
            <StatusBadgeV2 status={project.status} />
            {project.isTestProject && (
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider"
                style={{
                  backgroundColor: T.warningSoft,
                  color: T.warning,
                  border: `1px dashed ${T.warning}`,
                }}
              >
                ТЕСТ
              </span>
            )}
          </div>
          <h1
            className="text-[22px] sm:text-[26px] font-bold leading-tight truncate"
            style={{ color: T.textPrimary }}
          >
            {project.title}
          </h1>
          {project.address && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: T.textSecondary }}>
              <MapPin size={14} style={{ color: T.textMuted }} />
              <span className="truncate">{project.address}</span>
              <Link
                href={`https://www.google.com/maps?q=${encodeURIComponent(project.address)}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-[12px] font-semibold"
                style={{ color: T.accentPrimary }}
              >
                на карті
                <ExternalLink size={11} />
              </Link>
            </div>
          )}
          {(project.startDate || project.expectedEndDate) && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: T.textSecondary }}>
              <Calendar size={14} style={{ color: T.textMuted }} />
              <span>
                {project.startDate ? formatShortDate(project.startDate) : "—"}
                {" — "}
                {project.expectedEndDate ? formatShortDate(project.expectedEndDate) : "—"}
              </span>
              {daysSpan !== null && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                  style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
                >
                  {daysSpan} дн
                </span>
              )}
            </div>
          )}
          {clientName && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: T.textSecondary }}>
              <Briefcase size={14} style={{ color: T.textMuted }} />
              <span className="font-medium" style={{ color: T.textPrimary }}>
                {clientName}
              </span>
              {project.clientCounterparty && (
                <Link
                  href={`/admin-v2/counterparties/${project.clientCounterparty.id}`}
                  className="text-[11px] font-semibold inline-flex items-center gap-0.5"
                  style={{ color: T.accentPrimary }}
                >
                  картка <ExternalLink size={10} />
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="hidden md:flex flex-col items-end gap-3 px-5 py-5">
          <ProjectHeaderActions
            projectId={project.id}
            isTestProject={project.isTestProject}
            tasksEnabled={tasksEnabled}
          />
          {project.manager?.name && (
            <div
              className="rounded-xl px-3 py-2.5 max-w-[220px]"
              style={{ backgroundColor: T.panelSoft }}
            >
              <div
                className="text-[10px] font-bold tracking-wider mb-1"
                style={{ color: T.textMuted }}
              >
                ВІДПОВІДАЛЬНИЙ
              </div>
              <div
                className="text-[12px] font-semibold truncate"
                style={{ color: T.textPrimary }}
              >
                {project.manager.name}
              </div>
              <div className="text-[10px]" style={{ color: T.textMuted }}>
                {project.manager.role === "MANAGER" ? "ПМ" : project.manager.role}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function KpiStrip({
  overallProgress,
  completedStages,
  totalStages,
  showFinance,
  budgetPaid,
  budgetTotal,
  budgetUsedPct,
  daysToDeadline,
}: {
  overallProgress: number;
  completedStages: number;
  totalStages: number;
  showFinance: boolean;
  budgetPaid: number;
  budgetTotal: number;
  budgetUsedPct: number;
  daysToDeadline: number | null;
}) {
  const cards = [
    {
      icon: TrendingUp,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ПРОГРЕС",
      value: `${overallProgress}%`,
      sub: `${completedStages} з ${totalStages} етапів`,
      barWidth: overallProgress,
      barColor: T.accentPrimary,
    },
    showFinance
      ? {
          icon: Wallet,
          iconBg: T.skySoft,
          iconColor: T.sky,
          label: "БЮДЖЕТ",
          value: formatCompact(budgetPaid),
          sub: `/ ${formatCompact(budgetTotal)} (${budgetUsedPct}%)`,
          barWidth: budgetUsedPct,
          barColor: T.sky,
        }
      : null,
    {
      icon: deadlineTier(daysToDeadline).icon,
      iconBg: deadlineTier(daysToDeadline).bg,
      iconColor: deadlineTier(daysToDeadline).fg,
      label: "ДО ДЕДЛАЙНУ",
      value:
        daysToDeadline === null
          ? "—"
          : daysToDeadline < 0
            ? `-${Math.abs(daysToDeadline)} дн`
            : `${daysToDeadline} дн`,
      sub: deadlineTier(daysToDeadline).hint,
      barWidth: 0,
      barColor: T.textMuted,
    },
  ].filter(Boolean) as Array<{
    icon: typeof TrendingUp;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    barWidth: number;
    barColor: string;
  }>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <article
          key={i}
          className="rounded-xl p-4"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="flex items-start gap-3 mb-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: c.iconBg }}
            >
              <c.icon size={16} style={{ color: c.iconColor }} />
            </div>
            <div className="min-w-0">
              <div
                className="text-[10px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                {c.label}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span
                  className="text-[22px] font-bold tabular-nums"
                  style={{ color: T.textPrimary }}
                >
                  {c.value}
                </span>
                <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>
                  {c.sub}
                </span>
              </div>
            </div>
          </div>
          {c.barWidth > 0 && (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: T.panelSoft }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, c.barWidth)}%`, backgroundColor: c.barColor }}
              />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function StagesPanel({
  stages,
  activeStageId,
  completedCount,
  totalCount,
  projectId,
}: {
  stages: Array<{
    id: string;
    customName: string | null;
    stage: string | null;
    status: string;
    progress: number;
    startDate: Date | null;
    endDate: Date | null;
    sortOrder: number;
    responsibleUser: { id: string; name: string | null } | null;
  }>;
  activeStageId: string | null;
  completedCount: number;
  totalCount: number;
  projectId: string;
}) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <ListChecks size={18} style={{ color: T.accentPrimary }} />
          <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Етапи проєкту
          </h2>
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            {completedCount} / {totalCount}
          </span>
        </div>
        <Link
          href={`/admin-v2/projects/${projectId}/stages`}
          className="inline-flex items-center gap-1 text-[12px] font-semibold"
          style={{ color: T.accentPrimary }}
        >
          Усі етапи →
        </Link>
      </header>
      <div className="px-5 pb-3" style={{ borderTop: `1px solid ${T.borderSoft}` }} />
      <ol className="flex flex-col">
        {stages.length === 0 && (
          <li className="px-5 py-8 text-center text-[13px]" style={{ color: T.textMuted }}>
            Етапів ще немає. Створи перший у розділі «Етапи».
          </li>
        )}
        {stages.map((s, i) => (
          <StageRow
            key={s.id}
            index={i + 1}
            stage={s}
            isActive={s.id === activeStageId}
          />
        ))}
      </ol>
      <div className="px-5 py-3" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
        <Link
          href={`/admin-v2/projects/${projectId}/stages`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition hover:brightness-110"
          style={{ backgroundColor: T.panelSoft, color: T.accentPrimary }}
        >
          <Plus size={14} />
          Додати етап
        </Link>
      </div>
    </section>
  );
}

function StageRow({
  index,
  stage,
  isActive,
}: {
  index: number;
  stage: {
    id: string;
    customName: string | null;
    stage: string | null;
    status: string;
    progress: number;
    startDate: Date | null;
    endDate: Date | null;
    responsibleUser: { id: string; name: string | null } | null;
  };
  isActive: boolean;
}) {
  const isDone = stage.status === "COMPLETED";
  const isPlanned = !isActive && !isDone;
  const name = stage.customName ?? stage.stage ?? `Етап ${index}`;
  const tone = isActive
    ? { dot: T.accentPrimary, bg: T.accentPrimarySoft, text: T.textPrimary, bar: T.accentPrimary }
    : isDone
      ? { dot: T.success, bg: "transparent", text: T.textPrimary, bar: T.success }
      : { dot: T.borderStrong, bg: "transparent", text: T.textSecondary, bar: T.panelSoft };

  return (
    <li
      className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-5 py-2.5"
      style={{ backgroundColor: tone.bg }}
    >
      <div
        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
        style={{
          backgroundColor: isDone || isActive ? tone.dot : T.panel,
          color: isDone || isActive ? "#FFFFFF" : T.textMuted,
          border: isPlanned ? `2px solid ${T.borderStrong}` : "none",
        }}
      >
        {isDone ? <Check size={11} /> : index}
      </div>
      <div className="min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center gap-2">
        <div className="min-w-0">
          <div
            className="text-[13px] font-semibold truncate"
            style={{ color: tone.text }}
          >
            {name}
            {isActive && (
              <span
                className="ml-2 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider align-middle"
                style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
              >
                ЗАРАЗ
              </span>
            )}
          </div>
          {stage.responsibleUser?.name && (
            <div className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
              {stage.responsibleUser.name}
            </div>
          )}
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: T.textMuted }}>
          {stage.startDate ? formatShortDate(stage.startDate) : "—"}
          {" – "}
          {stage.endDate ? formatShortDate(stage.endDate) : "—"}
        </div>
        <div className="flex items-center gap-2 min-w-[120px]">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: T.panelSoft }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, stage.progress))}%`,
                backgroundColor: tone.bar,
              }}
            />
          </div>
          <span
            className="text-[11px] font-bold tabular-nums w-9 text-right"
            style={{ color: isDone ? T.success : isActive ? T.accentPrimary : T.textMuted }}
          >
            {stage.progress}%
          </span>
        </div>
      </div>
      <CircleDot size={14} style={{ color: T.borderStrong, opacity: isActive ? 1 : 0 }} />
    </li>
  );
}

function RisksCard({
  overdueStages,
  daysToDeadline,
  budgetUsedPct,
  overallProgress,
}: {
  overdueStages: number;
  daysToDeadline: number | null;
  budgetUsedPct: number;
  overallProgress: number;
}) {
  const risks: Array<{ tone: "danger" | "warn" | "info"; title: string; sub: string }> = [];
  if (overdueStages > 0) {
    risks.push({
      tone: "danger",
      title: `${overdueStages} ${overdueStages === 1 ? "етап прострочений" : "етапів прострочено"}`,
      sub: "Терміни вже минули — потрібне рішення",
    });
  }
  if (daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= 14) {
    risks.push({
      tone: "warn",
      title: `Дедлайн через ${daysToDeadline} дн`,
      sub: "Фінальний відрізок проєкту",
    });
  }
  if (budgetUsedPct >= 90 && overallProgress < 90) {
    risks.push({
      tone: "warn",
      title: `Бюджет освоєно на ${budgetUsedPct}%, а прогрес лише ${overallProgress}%`,
      sub: "Ризик перевищити кошторис",
    });
  }
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} style={{ color: T.danger }} />
          <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            Ризики та сповіщення
          </h3>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{
            backgroundColor: risks.length > 0 ? T.dangerSoft : T.successSoft,
            color: risks.length > 0 ? T.danger : T.success,
          }}
        >
          {risks.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {risks.length === 0 && (
          <div
            className="rounded-lg px-3 py-3 text-[12px] flex items-center gap-2"
            style={{ backgroundColor: T.successSoft, color: T.success }}
          >
            <Check size={14} />
            <span className="font-semibold">Усе під контролем — ризиків не виявлено</span>
          </div>
        )}
        {risks.map((r, i) => {
          const tone =
            r.tone === "danger"
              ? { bg: T.dangerSoft, fg: T.danger, ico: AlertOctagon }
              : r.tone === "warn"
                ? { bg: T.warningSoft, fg: T.warning, ico: AlertTriangle }
                : { bg: T.skySoft, fg: T.sky, ico: CalendarCheck };
          return (
            <div
              key={i}
              className="rounded-lg px-3 py-2.5 flex items-start gap-2"
              style={{
                backgroundColor: tone.bg,
                borderLeft: `3px solid ${tone.fg}`,
              }}
            >
              <tone.ico size={14} style={{ color: tone.fg }} className="flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                  {r.title}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: tone.fg }}>
                  {r.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type TeamMemberRow = {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  userAvatar: string | null;
  roleInProject: string;
};

const PROJECT_ROLE_LABEL: Record<string, string> = {
  PROJECT_ADMIN: "Адмін",
  PROJECT_MANAGER: "ПМ",
  ENGINEER: "Інженер",
  FOREMAN: "Виконроб",
  FINANCE: "Фінанси",
  PROCUREMENT: "Закупівлі",
  VIEWER: "Спостерігач",
};

const PROJECT_ROLE_COLOR: Record<string, string> = {
  PROJECT_ADMIN: T.danger,
  PROJECT_MANAGER: T.violet,
  ENGINEER: T.accentPrimary,
  FOREMAN: T.warning,
  FINANCE: T.success,
  PROCUREMENT: T.teal,
  VIEWER: T.textMuted,
};

function TeamCard({
  project,
  members,
  canManageMembers,
}: {
  project: ProjectShape;
  members: TeamMemberRow[];
  canManageMembers: boolean;
}) {
  const clientName =
    project.clientCounterparty?.name ?? project.client?.name ?? project.clientName;

  // ПМ з User-FK (managerId) може бути серед members як PROJECT_MANAGER;
  // не показуємо двічі. Якщо ПМ не в членах — додаємо як перший рядок.
  const managerInMembers = project.manager?.id
    ? members.some((m) => m.userId === project.manager?.id)
    : false;

  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: T.accentPrimary }} />
          <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            Команда
          </h3>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
          >
            {members.length}
          </span>
        </div>
        {canManageMembers && (
          <Link
            href={`/admin-v2/projects/${project.id}?tab=team`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: T.accentPrimarySoft,
              color: T.accentPrimary,
              border: `1px solid ${T.accentPrimary}33`,
            }}
            title="Додати/видалити учасників"
          >
            <Plus size={11} />
            Управляти
          </Link>
        )}
      </header>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {/* Клієнт окремо — він не є ProjectMember (зовнішня сторона). */}
        {clientName && (
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0"
              style={{ backgroundColor: T.sky }}
            >
              <Briefcase size={14} style={{ color: "#FFFFFF" }} />
            </div>
            <div className="min-w-0">
              <div
                className="text-[10px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                ЗАМОВНИК
              </div>
              <div
                className="text-[12px] font-semibold truncate"
                style={{ color: T.textPrimary }}
              >
                {clientName}
              </div>
            </div>
          </div>
        )}

        {/* ПМ якщо не в members */}
        {project.manager?.name && !managerInMembers && (
          <div className="flex items-center gap-3">
            <Avatar
              name={project.manager.name}
              avatar={project.manager.avatar}
              color={T.violet}
            />
            <div className="min-w-0">
              <div
                className="text-[10px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                ПМ
              </div>
              <div
                className="text-[12px] font-semibold truncate"
                style={{ color: T.textPrimary }}
              >
                {project.manager.name}
              </div>
            </div>
          </div>
        )}

        {/* Список членів */}
        {members.length === 0 && !project.manager && !clientName && (
          <div className="text-[12px] text-center py-3" style={{ color: T.textMuted }}>
            {canManageMembers ? "Додай першого учасника" : "Команду ще не призначено"}
          </div>
        )}
        {members.map((m) => {
          const color = PROJECT_ROLE_COLOR[m.roleInProject] ?? T.textMuted;
          const label = PROJECT_ROLE_LABEL[m.roleInProject] ?? m.roleInProject;
          return (
            <div key={m.id} className="flex items-center gap-3">
              <Avatar name={m.userName} avatar={m.userAvatar} color={color} />
              <div className="min-w-0 flex-1">
                <div
                  className="text-[10px] font-bold tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  {label}
                </div>
                <div
                  className="text-[12px] font-semibold truncate"
                  style={{ color: T.textPrimary }}
                >
                  {m.userName}
                </div>
              </div>
            </div>
          );
        })}

        {project.manager?.phone && (
          <div className="flex gap-2 mt-1">
            <a
              href={`tel:${project.manager.phone}`}
              className="flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-center transition hover:brightness-110"
              style={{ backgroundColor: T.successSoft, color: T.success }}
            >
              Подзвонити
            </a>
            {project.manager.email && (
              <a
                href={`mailto:${project.manager.email}`}
                className="flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-center transition hover:brightness-110"
                style={{ backgroundColor: T.skySoft, color: T.sky }}
              >
                Email
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Avatar({
  name,
  avatar,
  color,
}: {
  name: string;
  avatar: string | null;
  color: string;
}) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar}
        alt={name}
        className="h-9 w-9 rounded-full object-cover flex-shrink-0"
        style={{ border: `2px solid ${color}` }}
      />
    );
  }
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0 text-[11px] font-bold"
      style={{ backgroundColor: color, color: "#FFFFFF" }}
    >
      {initials}
    </div>
  );
}

type RecentFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  createdAt: string;
};

function FilesCard({
  projectId,
  totalCount,
  recentFiles,
}: {
  projectId: string;
  totalCount: number;
  recentFiles: RecentFile[];
}) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Briefcase size={16} style={{ color: T.accentPrimary }} />
          <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            Файли
          </h3>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
          >
            {totalCount}
          </span>
        </div>
        <Link
          href={`/admin-v2/projects/${projectId}?tab=media&sub=files`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
          style={{
            backgroundColor: T.accentPrimarySoft,
            color: T.accentPrimary,
            border: `1px solid ${T.accentPrimary}33`,
          }}
          title="Усі файли та drag-and-drop вантаження"
        >
          <Plus size={11} />
          Файли
        </Link>
      </header>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {recentFiles.length === 0 ? (
          <Link
            href={`/admin-v2/projects/${projectId}?tab=media&sub=files`}
            className="rounded-xl px-3 py-4 text-[12px] text-center transition hover:brightness-95"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px dashed ${T.borderStrong}`,
              color: T.textMuted,
            }}
          >
            Перетягни сюди файли або клікни, щоб додати
          </Link>
        ) : (
          recentFiles.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:brightness-95"
              style={{ backgroundColor: T.panelSoft }}
            >
              <FileIcon mimeType={f.mimeType} />
              <div className="min-w-0 flex-1">
                <div
                  className="text-[12px] font-semibold truncate"
                  style={{ color: T.textPrimary }}
                  title={f.name}
                >
                  {f.name}
                </div>
                <div
                  className="text-[10px] tabular-nums"
                  style={{ color: T.textMuted }}
                >
                  {formatBytes(f.size)} · {formatRelativeShort(f.createdAt)}
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isText = mimeType === "text/plain";
  const Icon = isImage ? ListChecks : isPdf ? ExternalLink : isText ? Pencil : ListChecks;
  const color = isImage ? T.violet : isPdf ? T.danger : isText ? T.warning : T.textSecondary;
  return (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
      style={{ backgroundColor: T.panel }}
    >
      <Icon size={13} style={{ color }} />
    </span>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / 1024 / 1024).toFixed(1)} МБ`;
}

type RecentPhotoImage = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  photoReportId: string;
};

function PhotosCard({
  projectId,
  totalCount,
  recentImages,
}: {
  projectId: string;
  totalCount: number;
  recentImages: RecentPhotoImage[];
}) {
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Briefcase reused — uniform іконка для card-headers. */}
          <Briefcase size={16} style={{ color: T.violet }} />
          <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            Фото
          </h3>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
          >
            {totalCount} {totalCount === 1 ? "звіт" : "звітів"}
          </span>
        </div>
        <Link
          href={`/admin-v2/projects/${projectId}/photos/new`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
          style={{
            backgroundColor: T.violetSoft,
            color: T.violet,
            border: `1px solid ${T.violet}33`,
          }}
          title="Завантажити новий фото-звіт"
        >
          <Plus size={11} />
          Звіт
        </Link>
      </header>
      <div className="px-4 pb-4">
        {recentImages.length === 0 ? (
          <Link
            href={`/admin-v2/projects/${projectId}/photos/new`}
            className="block rounded-xl px-3 py-6 text-[12px] text-center transition hover:brightness-95"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px dashed ${T.borderStrong}`,
              color: T.textMuted,
            }}
          >
            Завантаж перший фото-звіт
          </Link>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {recentImages.map((img) => (
              <Link
                key={img.id}
                href={`/admin-v2/projects/${projectId}?tab=media&sub=photos`}
                className="relative aspect-square overflow-hidden rounded-md transition hover:brightness-95"
                style={{ backgroundColor: T.panelSoft }}
                title={img.caption ?? ""}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.thumbnailUrl ?? img.url}
                  alt={img.caption ?? ""}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </Link>
            ))}
          </div>
        )}
        {recentImages.length > 0 && (
          <Link
            href={`/admin-v2/projects/${projectId}?tab=media&sub=photos`}
            className="mt-2 block text-[11px] text-center font-semibold transition hover:brightness-110"
            style={{ color: T.accentPrimary }}
          >
            Усі фото →
          </Link>
        )}
      </div>
    </section>
  );
}

function formatRelativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min} хв тому`;
  const hr = Math.round(diff / 3_600_000);
  if (hr < 24) return `${hr} год тому`;
  const days = Math.round(diff / 86_400_000);
  if (days < 30) return `${days} дн тому`;
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });
}

function StatusBadgeV2({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
    DRAFT: { bg: T.warningSoft, fg: T.warning, dot: T.warning, label: "Чернетка" },
    ACTIVE: { bg: T.successSoft, fg: T.success, dot: T.success, label: "Активний" },
    ON_HOLD: { bg: T.panelSoft, fg: T.textMuted, dot: T.textMuted, label: "Призупинено" },
    COMPLETED: { bg: T.accentPrimarySoft, fg: T.accentPrimary, dot: T.accentPrimary, label: "Завершено" },
    CANCELLED: { bg: T.dangerSoft, fg: T.danger, dot: T.danger, label: "Скасовано" },
  };
  const c = map[status] ?? map.DRAFT;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: c.dot }}
      />
      {c.label}
    </span>
  );
}

function IconBtn({
  icon: Icon,
  title,
}: {
  icon: typeof Pencil;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:brightness-95"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <Icon size={15} style={{ color: T.textSecondary }} />
    </button>
  );
}

function deadlineTier(days: number | null): {
  icon: typeof Clock;
  bg: string;
  fg: string;
  hint: string;
} {
  if (days === null) {
    return { icon: Calendar, bg: T.panelSoft, fg: T.textMuted, hint: "не задано" };
  }
  if (days < 0)
    return { icon: AlertOctagon, bg: T.dangerSoft, fg: T.danger, hint: "прострочено" };
  if (days <= 14) return { icon: Clock, bg: T.dangerSoft, fg: T.danger, hint: "критично" };
  if (days <= 30) return { icon: Clock, bg: T.warningSoft, fg: T.warning, hint: "увага" };
  if (days <= 90) return { icon: CalendarCheck, bg: T.skySoft, fg: T.sky, hint: "у плані" };
  return { icon: CalendarCheck, bg: T.successSoft, fg: T.success, hint: "запас часу" };
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

function formatShortDate(d: Date | string): string {
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

/**
 * Sub-nav з лінками на існуючі legacy tabs (поки v2 detail =
 * "Overview"-tab). Кожен chip → legacy URL з відповідним ?tab=X
 * і вертає той самий проект з повним функціоналом.
 */
/**
 * Stable суб-навігація проєкту. Усі links → `?tab=X` на тому самому
 * /[id], щоб hero + nav залишались на місці, а нижче переключався контент.
 * "Етапи" окремий route /stages-v2 (повна сторінка з власним керуванням).
 */
export function SubNavTabs({
  projectId,
  tasksEnabled,
  activeTab,
}: {
  projectId: string;
  tasksEnabled: boolean;
  /** "overview" | "stages" | "tasks" | "estimates" | ... */
  activeTab: string;
}) {
  const tabs: Array<{ id: string; label: string; href: string; icon: typeof ListChecks }> = [
    {
      id: "overview",
      label: "Огляд",
      href: `/admin-v2/projects/${projectId}`,
      icon: Building,
    },
    {
      id: "stages",
      label: "Етапи",
      href: `/admin-v2/projects/${projectId}?tab=stages`,
      icon: ListChecks,
    },
    {
      id: "estimates",
      label: "Кошториси",
      href: `/admin-v2/projects/${projectId}?tab=estimates`,
      icon: Briefcase,
    },
    {
      id: "finances",
      label: "Фінанси",
      href: `/admin-v2/projects/${projectId}?tab=finances`,
      icon: Wallet,
    },
    {
      id: "documents",
      label: "Документи",
      href: `/admin-v2/projects/${projectId}?tab=documents`,
      icon: HardHat,
    },
    {
      id: "media",
      label: "Медіа",
      href: `/admin-v2/projects/${projectId}?tab=media`,
      icon: Briefcase,
    },
    {
      id: "team",
      label: "Команда",
      href: `/admin-v2/projects/${projectId}?tab=team`,
      icon: Users,
    },
    {
      id: "activity",
      label: "Активність",
      href: `/admin-v2/projects/${projectId}?tab=activity`,
      icon: Clock,
    },
  ];
  if (tasksEnabled) {
    tabs.splice(2, 0, {
      id: "tasks",
      label: "Задачі",
      href: `/admin-v2/projects/${projectId}?tab=tasks`,
      icon: Check,
    });
  }
  return (
    <nav
      className="flex flex-wrap items-center gap-1 rounded-2xl p-1.5"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
      aria-label="Розділи проєкту"
    >
      {tabs.map((t) => {
        const active = t.id === activeTab;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: active ? T.accentPrimarySoft : "transparent",
              color: active ? T.accentPrimary : T.textSecondary,
            }}
            aria-current={active ? "page" : undefined}
          >
            <t.icon size={14} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
