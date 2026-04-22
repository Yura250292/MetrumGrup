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
import { ProjectFoldersClient } from "./_components/project-folders-client";
import { ProjectsView } from "./_components/projects-view";
import type { ProjectExtra, ProjectRow } from "./_components/projects-types";

export const dynamic = "force-dynamic";

export default async function AdminV2ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const params = await searchParams;
  const folderId = params.folderId ?? null;

  const [folders, breadcrumbs] = await Promise.all([
    listFolders("PROJECT", folderId),
    folderId ? getFolderBreadcrumbs(folderId) : Promise.resolve([]),
  ]);

  const projects = await listProjectsWithAggregations(session.user.id, { folderId });

  const extrasMap = new Map<string, ProjectExtra>();
  if (projects.length > 0) {
    const ids = projects.map((p) => p.id);
    const extras = await prisma.project.findMany({
      where: { id: { in: ids } },
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

  const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0);
  const totalPaid = projects.reduce((sum, p) => sum + p.totalPaid, 0);
  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard
          label="ВСЬОГО"
          value={String(projects.length)}
          sub="у системі"
          accent={T.sky}
          gradient="var(--kpi-sky)"
        />
        <KpiCard
          label="ЗАГАЛЬНИЙ БЮДЖЕТ"
          value={formatCurrency(totalBudget)}
          sub={`${formatCurrency(totalPaid)} сплачено`}
          accent={T.violet}
          gradient="var(--kpi-violet)"
        />
        <KpiCard
          label="ВИКОНАННЯ ОПЛАТ"
          value={`${totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0}%`}
          sub="від загальної суми"
          accent={T.emerald}
          gradient="var(--kpi-emerald)"
        />
      </section>

      <ProjectFoldersClient
        folders={JSON.parse(JSON.stringify(folders))}
        breadcrumbs={breadcrumbs}
        currentFolderId={folderId}
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
        />
      )}
    </div>
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
      className="flex flex-col gap-0.5 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 min-w-0 overflow-hidden"
      style={{
        background: gradient || T.panel,
        border: `1px solid ${accent}20`,
        boxShadow: `0 2px 8px ${accent}12`,
      }}
    >
      <span
        className="text-[8px] sm:text-[10px] font-bold tracking-wider truncate uppercase"
        style={{ color: T.textSecondary }}
      >
        {label}
      </span>
      <span
        className="text-sm sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate"
        style={{ color: accent }}
      >
        {value}
      </span>
      <span className="text-[9px] sm:text-[11px] truncate" style={{ color: T.textSecondary }}>
        {sub}
      </span>
    </div>
  );
}

