import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProjectsWithAggregations } from "@/lib/projects/aggregations";
import { listFolders } from "@/lib/folders/queries";
import { getFolderBreadcrumbs } from "@/lib/folders/queries";
import { formatCurrency } from "@/lib/utils";
import { FolderKanban } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { EmptyState } from "@/components/shared/states";
import { ProjectsView } from "./_components/projects-view";
import { SectionTabs } from "../_components/section-tabs";
import { PageIntroCard } from "../_components/help/PageIntroCard";
import type { ProjectExtra, ProjectRow } from "./_components/projects-types";
import { firmWhereForProject, isHomeFirmFor } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { canViewFinance } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export default async function AdminV2ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  // FINANCIER бачить тільки проєкти, де доданий як ProjectMember (будь-яка
  // roleInProject). Без членства — порожньо.
  const restrictToMemberOfUserId =
    session.user.role === "FINANCIER" ? session.user.id : null;
  const params = await searchParams;
  const folderId = params.folderId ?? null;

  const { firmId } = await resolveFirmScopeForRequest(session);

  // Home-firm guard: тільки на своїй фірмі можна керувати проектами.
  if (!isHomeFirmFor(session, firmId)) {
    redirect("/admin-v2");
  }

  const [folders, breadcrumbs] = await Promise.all([
    listFolders("PROJECT", folderId, firmId),
    folderId ? getFolderBreadcrumbs(folderId) : Promise.resolve([]),
  ]);
  const projects = await listProjectsWithAggregations(session.user.id, {
    folderId,
    firmId,
    restrictToMemberOfUserId,
  });

  const extrasMap = new Map<string, ProjectExtra>();
  if (projects.length > 0) {
    const ids = projects.map((p) => p.id);
    const [extras, stageRecords, rfiCounts] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: ids }, ...firmWhereForProject(firmId) },
        select: {
          id: true,
          code: true,
          type: true,
          expectedEndDate: true,
          coverImageUrl: true,
          estimates: { select: { id: true, status: true } },
          photoReports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { images: { take: 1, select: { url: true } } },
          },
        },
      }),
      // Активний етап + загальна кількість на проєкт. Один query, group у JS.
      prisma.projectStageRecord.findMany({
        where: {
          projectId: { in: ids },
          kind: "STAGE",
        },
        select: {
          projectId: true,
          customName: true,
          stage: true,
          status: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      // Open RFI per project
      prisma.rFI.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: ids },
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        _count: { id: true },
      }).catch(() => [] as Array<{ projectId: string; _count: { id: number } }>),
    ]);

    // Group stages by project
    const stagesByProject = new Map<
      string,
      Array<{ customName: string | null; stage: string | null; status: string; sortOrder: number }>
    >();
    for (const s of stageRecords) {
      const list = stagesByProject.get(s.projectId) ?? [];
      list.push(s);
      stagesByProject.set(s.projectId, list);
    }
    const rfiByProject = new Map(
      rfiCounts.map((r) => [r.projectId, r._count.id]),
    );

    for (const e of extras) {
      const approved = e.estimates.some(
        (es) => es.status === "APPROVED" || es.status === "FINANCE_REVIEW",
      );
      const stages = stagesByProject.get(e.id) ?? [];
      const activeIdx = stages.findIndex((s) => s.status === "IN_PROGRESS");
      const active = activeIdx >= 0 ? stages[activeIdx] : null;
      extrasMap.set(e.id, {
        estimatesCount: e.estimates.length,
        hasApprovedEstimate: approved,
        expectedEndDate: e.expectedEndDate,
        coverImage: e.coverImageUrl ?? e.photoReports[0]?.images[0]?.url ?? null,
        activeStageName: active?.customName ?? active?.stage ?? null,
        activeStageIndex: activeIdx >= 0 ? activeIdx + 1 : null,
        totalStageCount: stages.length,
        openRfiCount: rfiByProject.get(e.id) ?? 0,
        code: e.code,
        type: e.type,
      });
    }
  }

  const rows: ProjectRow[] = projects.map((p) => ({
    ...p,
    extra: extrasMap.get(p.id) ?? {
      estimatesCount: 0,
      hasApprovedEstimate: false,
      expectedEndDate: null,
      coverImage: null,
      activeStageName: null,
      activeStageIndex: null,
      totalStageCount: 0,
      openRfiCount: 0,
      code: null,
      type: null,
    },
  }));

  const showFinance = canViewFinance(session.user.role);
  const totalBudget = showFinance
    ? projects.reduce((sum, p) => sum + p.totalBudget, 0)
    : 0;
  const totalPaid = showFinance
    ? projects.reduce((sum, p) => sum + p.totalPaid, 0)
    : 0;
  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;

  // Ризики: просрочка (expectedEndDate < сьогодні і не COMPLETED/CANCELLED) +
  // RFI на проєктах. Маржу не показуємо — даних для plannedCost vs actualCost
  // у Project немає окремо.
  const now = Date.now();
  const overdueCount = rows.filter((r) => {
    const due = r.extra.expectedEndDate;
    if (!due) return false;
    if (r.status === "COMPLETED" || r.status === "CANCELLED") return false;
    return new Date(due).getTime() < now;
  }).length;
  const totalOpenRfis = rows.reduce((sum, r) => sum + r.extra.openRfiCount, 0);
  const burnPct = showFinance && totalBudget > 0
    ? Math.round((totalPaid / totalBudget) * 100)
    : 0;

  const canSeeOverview =
    session.user.role === "SUPER_ADMIN" || session.user.role === "MANAGER";
  const projectTabs = [
    { href: "/admin-v2/projects", label: "Список", exact: true },
    ...(canSeeOverview ? [{ href: "/admin-v2/projects/dashboard", label: "Огляд" }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageIntroCard />
      {projectTabs.length > 1 && <SectionTabs tabs={projectTabs} />}
      <KpiCards
        totalCount={projects.length}
        activeCount={activeCount}
        showFinance={showFinance}
        totalBudget={totalBudget}
        totalPaid={totalPaid}
        burnPct={burnPct}
        overdueCount={overdueCount}
        openRfiCount={totalOpenRfis}
      />

      {projects.length === 0 && folders.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={24} />}
          title="Проєктів ще немає"
          description="Створіть перший проєкт, щоб почати роботу"
          action={{ label: "Створити проєкт", href: "/admin-v2/projects/new" }}
        />
      ) : (
        <ProjectsView
          projects={rows}
          canDelete={isSuperAdmin}
          currentFolderId={folderId}
          totalCount={projects.length}
          activeCount={activeCount}
          folders={JSON.parse(JSON.stringify(folders))}
          breadcrumbs={breadcrumbs}
          isSuperAdmin={isSuperAdmin}
          showFinance={showFinance}
          currentUserId={session.user.id}
        />
      )}
    </div>
  );
}

/**
 * 5 rich KPI cards за Pencil-mockup. Кожна — окрема пастельна картка з:
 * - eyebrow-label (uppercase tracking)
 * - велике число
 * - secondary рядок (контекст: з N, % освоєно, тощо)
 * Дельти vs попередній період не показуємо — даних для них немає у БД.
 */
function KpiCards({
  totalCount,
  activeCount,
  showFinance,
  totalBudget,
  totalPaid,
  burnPct,
  overdueCount,
  openRfiCount,
}: {
  totalCount: number;
  activeCount: number;
  showFinance: boolean;
  totalBudget: number;
  totalPaid: number;
  burnPct: number;
  overdueCount: number;
  openRfiCount: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Активні проєкти"
        value={String(activeCount)}
        secondary={`з ${totalCount}`}
        accent={T.emerald}
        bg={T.emeraldSoft}
      />
      {showFinance ? (
        <KpiCard
          label="Бюджет (план)"
          value={formatCurrencyCompact(totalBudget)}
          secondary={`сплачено ${formatCurrencyCompact(totalPaid)}`}
          accent={T.violet}
          bg={T.violetSoft}
        />
      ) : (
        <KpiCard
          label="Завершені"
          value={String(0)}
          secondary="з усіх проєктів"
          accent={T.accentPrimary}
          bg={T.accentPrimarySoft}
        />
      )}
      {showFinance && (
        <KpiCard
          label="Освоєно"
          value={`${burnPct}%`}
          secondary={burnPct > 80 ? "перевитрата ризик" : burnPct > 60 ? "помірно" : "у нормі"}
          accent={burnPct > 80 ? T.danger : burnPct > 60 ? T.warning : T.success}
          bg={burnPct > 80 ? T.dangerSoft : burnPct > 60 ? T.warningSoft : T.successSoft}
        />
      )}
      <KpiCard
        label="Відкриті RFI"
        value={String(openRfiCount)}
        secondary={openRfiCount === 0 ? "усі закриті" : "потребують уваги"}
        accent={T.sky}
        bg={T.skySoft}
      />
      <KpiCard
        label="Ризики"
        value={String(overdueCount)}
        secondary={overdueCount === 0 ? "без просрочок" : "просрочених дедлайнів"}
        accent={overdueCount > 0 ? T.danger : T.textMuted}
        bg={overdueCount > 0 ? T.dangerSoft : T.panelSoft}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  secondary,
  accent,
  bg,
}: {
  label: string;
  value: string;
  secondary: string;
  accent: string;
  bg: string;
}) {
  return (
    <div
      className="rounded-xl p-3.5 transition hover:shadow-sm"
      style={{
        backgroundColor: bg,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
        style={{ color: T.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-[24px] font-extrabold tabular-nums leading-none mb-1"
        style={{ color: accent }}
      >
        {value}
      </div>
      <div
        className="text-[11px] font-medium"
        style={{ color: T.textSecondary }}
      >
        {secondary}
      </div>
    </div>
  );
}

/** Компактний формат: 47 200 000 → "47.2М ₴". Для KPI cards. */
function formatCurrencyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₴`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}К ₴`;
  return `${n.toFixed(0)} ₴`;
}

// Touch import щоб не виключати з ts-bundle (тримаю формат currency для table).
void formatCurrency;

