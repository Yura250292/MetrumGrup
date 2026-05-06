import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { getProjectCostBreakdown } from "@/lib/owner/queries";
import { OwnerShell } from "../../_components/owner-shell";
import { ProjectFinanceDetail } from "./_detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OwnerProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);

  const project = await prisma.project.findFirst({
    where: {
      id,
      ...(firmId ? { firmId } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      currentStage: true,
      stageProgress: true,
      firmId: true,
      address: true,
      totalBudget: true,
      totalPaid: true,
      startDate: true,
      expectedEndDate: true,
      _count: {
        select: {
          financeEntries: { where: { isArchived: false } },
          stages: true,
        },
      },
    },
  });

  if (!project) notFound();

  const breakdown = await getProjectCostBreakdown(project.id, firmId);

  // Aggregate income/expense (PLAN+FACT) for header card
  const incExpAgg = await prisma.financeEntry.groupBy({
    by: ["kind", "type"],
    where: { projectId: project.id, isArchived: false },
    _sum: { amount: true },
  });
  const totals = { planIncome: 0, planExpense: 0, factIncome: 0, factExpense: 0 };
  for (const a of incExpAgg) {
    const v = Number(a._sum.amount ?? 0);
    if (a.kind === "PLAN" && a.type === "INCOME") totals.planIncome = v;
    else if (a.kind === "PLAN" && a.type === "EXPENSE") totals.planExpense = v;
    else if (a.kind === "FACT" && a.type === "INCOME") totals.factIncome = v;
    else if (a.kind === "FACT" && a.type === "EXPENSE") totals.factExpense = v;
  }

  return (
    <OwnerShell
      title={project.title}
      subtitle={project.firmId === "metrum-studio" ? "Studio" : project.firmId === "metrum-group" ? "Group" : undefined}
      backHref="/owner/projects"
      activeFirmId={firmId}
    >
      <ProjectFinanceDetail
        project={{
          id: project.id,
          title: project.title,
          address: project.address,
          status: project.status,
        }}
        totals={totals}
        breakdown={breakdown}
      />
    </OwnerShell>
  );
}
