import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { classifyStageByName } from "@/lib/projects/classify-stage";
import { ProjectTabs } from "./_components/tabs";
import { FinanceDiagnosticsCard } from "./_components/finance-diagnostics-card";
import {
  ProjectDetailCanonicalBody,
  HeroCard,
  SubNavTabs,
} from "./_components/project-detail-canonical-body";
import { ProjectStagesBody } from "./_components/project-stages-body";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { computeStageFinanceAggregates } from "@/lib/projects/stages-helpers";

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

  // Overview = канонічний v2-дизайн (HeroCard/KpiStrip/StagesPanel/...).
  // Інші ?tab=X = legacy ProjectTabs (фінанси, документи, медіа, ...).
  // Раніше overview жив у /v2/page.tsx як preview; зараз /v2 → redirect /[id].
  if (activeTab === "overview") {
    return <ProjectDetailCanonicalBody id={id} session={session} />;
  }

  const [project, factIncome, factExpense, responsibleCandidates] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        clientCounterparty: { select: { id: true, name: true } },
        // Розширено для HeroCard: avatar + role.
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            role: true,
          },
        },
        stages: {
          orderBy: { sortOrder: "asc" },
          include: { responsibleUser: { select: { id: true, name: true } } },
        },
        payments: { orderBy: { scheduledDate: "asc" } },
        photoReports: {
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { images: { take: 1 }, createdBy: { select: { name: true } } },
        },
        completionActs: { orderBy: { createdAt: "desc" } },
        // financeEntries додано — HeroCard показує "N файлів · M операцій".
        _count: { select: { photoReports: true, files: true, financeEntries: true } },
      },
    }),
    prisma.financeEntry.aggregate({
      where: { projectId: id, type: "INCOME", kind: "FACT", isArchived: false },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: { projectId: id, type: "EXPENSE", kind: "FACT", isArchived: false },
      _sum: { amount: true },
    }),
    // Кандидати на «Відповідальний» — наш Штат (Employee), а не контрагенти.
    // Раніше тягнули User-акаунти з SUPER_ADMIN/MANAGER/ENGINEER, що показувало
    // тільки кілька адмінів. Зараз — усі активні співробітники зі Штату.
    prisma.employee
      .findMany({
        where: { isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      })
      .then((rows) => rows.map((e) => ({ id: e.id, name: e.fullName }))),
  ]);

  if (!project) notFound();
  // Studio директор не може заходити на проєкти іншої фірми навіть по прямому URL.
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    notFound();
  }

  // Convert Decimal to number once для client components у legacy ProjectTabs.
  const totalBudget = Number(project.totalBudget);
  const totalPaid = Number(project.totalPaid);

  const tasksEnabled = await isTasksEnabledForProject(project.id);

  // factIncome/factExpense aggregates наразі не використовуються у новій
  // секції (ProjectKpiStrip видалено). Залишаємо як no-op щоб не міняти
  // Promise.all сигнатуру нижче — оптимізація на наступний раунд.
  void factIncome;
  void factExpense;

  const stageAggregates = await computeStageFinanceAggregates(
    project.id,
    project.stages,
  );

  // Project shape для legacy ProjectTabs (tab content без власної nav).
  const legacyProjectShape = {
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    currentStage: project.currentStage,
    currentStageRecordId: project.currentStageRecordId,
    stageProgress: project.stageProgress,
    totalBudget,
    totalPaid,
    startDate: project.startDate,
    expectedEndDate: project.expectedEndDate,
    address: project.address,
    clientName: project.clientName,
    clientCounterparty: project.clientCounterparty,
    client: project.client,
    manager: project.manager,
    isTestProject: project.isTestProject,
    stages: project.stages.map((s) => {
      const agg = stageAggregates.get(s.id);
      return {
        id: s.id,
        parentStageId: s.parentStageId,
        stage: s.stage,
        customName: s.customName,
        isHidden: s.isHidden,
        sortOrder: s.sortOrder,
        status: s.status,
        progress: s.progress,
        startDate: s.startDate,
        endDate: s.endDate,
        notes: s.notes,
        responsibleUserId: s.responsibleUserId,
        responsibleName: s.responsibleUser?.name ?? s.responsibleName ?? null,
        allocatedBudget:
          s.allocatedBudget === null || s.allocatedBudget === undefined
            ? null
            : Number(s.allocatedBudget),
        unit: s.unit ?? null,
        factUnit: s.factUnit ?? null,
        planVolume:
          s.planVolume === null || s.planVolume === undefined
            ? null
            : Number(s.planVolume),
        factVolume:
          s.factVolume === null || s.factVolume === undefined
            ? null
            : Number(s.factVolume),
        planUnitPrice:
          s.planUnitPrice === null || s.planUnitPrice === undefined
            ? null
            : Number(s.planUnitPrice),
        factUnitPrice:
          s.factUnitPrice === null || s.factUnitPrice === undefined
            ? null
            : Number(s.factUnitPrice),
        planClientUnitPrice:
          s.planClientUnitPrice === null || s.planClientUnitPrice === undefined
            ? null
            : Number(s.planClientUnitPrice),
        factClientUnitPrice:
          s.factClientUnitPrice === null || s.factClientUnitPrice === undefined
            ? null
            : Number(s.factClientUnitPrice),
        planExpense: agg?.planExpense ?? 0,
        factExpense: agg?.factExpense ?? 0,
        planIncome: agg?.planIncome ?? 0,
        factIncome: agg?.factIncome ?? 0,
        costType:
          s.costType ??
          (() => {
            const c = classifyStageByName(s.customName ?? s.stage ?? "");
            return c === "OTHER" ? null : c;
          })(),
      };
    }),
    responsibleCandidates,
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
  };

  // Стабільний hero + sub-nav для всіх non-overview табів. Дані для
  // HeroCard беруться з того ж project load — додано avatar/role на manager
  // і financeEntries у _count для лічильника.
  return (
    <div
      className="flex flex-col gap-5"
      style={
        project.isTestProject
          ? {
              opacity: 0.55,
              outline: `2px dashed ${T.warning}`,
              outlineOffset: 8,
              borderRadius: 12,
            }
          : undefined
      }
    >
      <HeroCard
        project={{
          id: project.id,
          title: project.title,
          slug: project.slug,
          status: project.status,
          address: project.address,
          startDate: project.startDate,
          expectedEndDate: project.expectedEndDate,
          isTestProject: project.isTestProject,
          coverImageUrl: project.coverImageUrl,
          clientName: project.clientName,
          client: project.client,
          clientCounterparty: project.clientCounterparty,
          manager: project.manager,
          _count: project._count,
        }}
        tasksEnabled={tasksEnabled}
      />
      <SubNavTabs
        projectId={project.id}
        tasksEnabled={tasksEnabled}
        activeTab={activeTab}
      />

      {/* Finance diagnostics — banner з невідповідностями. Лише фінанс. розділи. */}
      {(activeTab === "finances" || activeTab === "estimates") && (
        <FinanceDiagnosticsCard projectId={project.id} />
      )}

      {/* Tab content — без власної nav-стрічки. Stages розгортається inline
          через окремий named export (раніше жив у /stages-v2/page.tsx). */}
      {activeTab === "stages" ? (
        <ProjectStagesBody id={project.id} session={session} />
      ) : (
        <ProjectTabs
          activeTab={activeTab}
          projectId={project.id}
          tasksEnabled={tasksEnabled}
          hideNav
          project={legacyProjectShape}
        />
      )}
    </div>
  );
}

