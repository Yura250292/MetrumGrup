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
    const extras = await prisma.project.findMany({
      where: { id: { in: ids }, ...firmWhereForProject(firmId) },
      select: {
        id: true,
        expectedEndDate: true,
        coverImageUrl: true,
        estimates: { select: { id: true, status: true } },
        photoReports: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { images: { take: 1, select: { url: true } } },
        },
      },
    });
    for (const e of extras) {
      const approved = e.estimates.some(
        (es) => es.status === "APPROVED" || es.status === "FINANCE_REVIEW",
      );
      extrasMap.set(e.id, {
        estimatesCount: e.estimates.length,
        hasApprovedEstimate: approved,
        expectedEndDate: e.expectedEndDate,
        coverImage: e.coverImageUrl ?? e.photoReports[0]?.images[0]?.url ?? null,
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
      <KpiStrip
        totalCount={projects.length}
        activeCount={activeCount}
        showFinance={showFinance}
        totalBudget={totalBudget}
        totalPaid={totalPaid}
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
        />
      )}
    </div>
  );
}

function KpiStrip({
  totalCount,
  activeCount,
  showFinance,
  totalBudget,
  totalPaid,
}: {
  totalCount: number;
  activeCount: number;
  showFinance: boolean;
  totalBudget: number;
  totalPaid: number;
}) {
  const paidPct =
    showFinance && totalBudget > 0
      ? Math.round((totalPaid / totalBudget) * 100)
      : 0;
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg px-3.5 py-2 text-[12px]"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
        color: T.textSecondary,
      }}
    >
      <KpiInline label="Усього" value={String(totalCount)} accent={T.sky} />
      <Sep />
      <KpiInline
        label="Активних"
        value={String(activeCount)}
        accent={T.emerald}
      />
      {showFinance && (
        <>
          <Sep />
          <KpiInline
            label="Бюджет"
            value={formatCurrency(totalBudget)}
            accent={T.violet}
          />
          <Sep />
          <KpiInline
            label="Сплачено"
            value={`${formatCurrency(totalPaid)} (${paidPct}%)`}
            accent={T.textPrimary}
          />
        </>
      )}
    </div>
  );
}

function KpiInline({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span className="font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </span>
    </span>
  );
}

function Sep() {
  return (
    <span aria-hidden style={{ color: T.borderStrong }}>
      ·
    </span>
  );
}

