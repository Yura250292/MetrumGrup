import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, STAGE_LABELS } from "@/lib/constants";
import { classifyStageByName } from "@/lib/projects/classify-stage";
import {
  ArrowLeft,
  MapPin,
  User,
  Briefcase,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ProjectTabs } from "./_components/tabs";
import { ProjectHeaderActions } from "./_components/project-header-actions";
import { ProjectKpiStrip } from "./_components/project-kpi-strip";
import { FinanceDiagnosticsCard } from "./_components/finance-diagnostics-card";
import { ProjectHeroAnimator, ProjectHeroItem } from "./_components/project-hero-animator";
import { ProjectCoverUpload } from "@/components/projects/ProjectCoverUpload";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { canViewFinance } from "@/lib/auth-utils";
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

  const [project, factIncome, factExpense, responsibleCandidates] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        clientCounterparty: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, email: true, phone: true } },
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
        _count: { select: { photoReports: true, files: true } },
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

  // Convert Decimal to number once for client components
  const totalBudget = Number(project.totalBudget);
  const totalPaid = Number(project.totalPaid);
  const paidPercent = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;
  const factIncomeTotal = Number(factIncome._sum.amount ?? 0);
  const factExpenseTotal = Number(factExpense._sum.amount ?? 0);
  const factBalance = factIncomeTotal - factExpenseTotal;

  const tasksEnabled = await isTasksEnabledForProject(project.id);
  const showFinance = canViewFinance(session.user.role);

  const stageAggregates = await computeStageFinanceAggregates(
    project.id,
    project.stages,
  );

  return (
    <div
      className="flex flex-col gap-6"
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
      {/* Sticky header */}
      <ProjectHeroAnimator>
      <header className="flex flex-col gap-4">
        <Link
          href="/admin-v2/projects"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-[0.97]"
          style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
        >
          <ArrowLeft size={14} /> До списку проєктів
        </Link>

        {/* Cover ліворуч | Title-блок посередині | Actions праворуч.
            Це усуває пусту смугу що раніше була праворуч від «Дії» — title
            тепер заповнює centрalну зону, actions притиснуті до правого краю.
            Mobile (<sm) — вертикальний стек. */}
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="w-full sm:w-44 md:w-56 flex-shrink-0">
            <ProjectCoverUpload
              projectId={project.id}
              currentUrl={project.coverImageUrl ?? null}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-[11px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                ПРОЄКТ #{project.id.slice(0, 8).toUpperCase()}
              </span>
              <StatusBadge status={project.status} />
              {project.isTestProject && <TestBadge />}
            </div>
            <h1
              className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight leading-tight break-words"
              style={{ color: T.textPrimary }}
            >
              {project.title}
            </h1>
            <div
              className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[11px] sm:text-[12px]"
              style={{ color: T.textMuted }}
            >
              <span className="flex items-center gap-1 min-w-0">
                <User size={12} className="flex-shrink-0" />
                <span className="truncate">
                  {project.clientName ??
                    project.clientCounterparty?.name ??
                    project.client?.name ??
                    "—"}
                </span>
              </span>
              {project.manager?.name && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 min-w-0">
                    <Briefcase size={12} className="flex-shrink-0" />
                    <span className="truncate">{project.manager.name}</span>
                  </span>
                </>
              )}
              {project.address && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:flex items-center gap-1 min-w-0">
                    <MapPin size={12} className="flex-shrink-0" />
                    <span className="truncate">{project.address}</span>
                  </span>
                </>
              )}
              <span>·</span>
              <span className="truncate">
                Етап: {STAGE_LABELS[project.currentStage]}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            <ProjectHeaderActions
              projectId={project.id}
              isTestProject={project.isTestProject}
              tasksEnabled={tasksEnabled}
            />
          </div>
        </div>

        {/* Єдиний KPI-strip — заміняє дві старі стопки і `FinanceKpiStrip` */}
        <ProjectHeroItem>
          <ProjectKpiStrip
            projectId={project.id}
            totalBudget={totalBudget}
            totalPaid={totalPaid}
            paidPercent={paidPercent}
            stagesCount={project.stages.length}
            factIncome={factIncomeTotal}
            factExpense={factExpenseTotal}
            factBalance={factBalance}
            canViewFinance={showFinance}
          />
        </ProjectHeroItem>
      </header>
      </ProjectHeroAnimator>

      {/* Finance diagnostics — показується лише коли є невідповідності */}
      <FinanceDiagnosticsCard projectId={project.id} />

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
              responsibleName:
                s.responsibleUser?.name ?? s.responsibleName ?? null,
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
              // Якщо в БД ще null (legacy/до backfill) — обчислюємо евристикою
              // за назвою. Backfill-endpoint потім запише точне значення.
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
        }}
      />
    </div>
  );
}

function TestBadge() {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide flex-shrink-0"
      style={{
        backgroundColor: T.warningSoft,
        color: T.warning,
        border: `1px dashed ${T.warning}`,
      }}
      title="Тестовий проєкт — не враховується у фінансових KPI"
    >
      ТЕСТ
    </span>
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

