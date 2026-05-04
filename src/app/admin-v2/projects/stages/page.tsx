import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firmWhereForProject, isHomeFirmFor } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { computeStageFinanceAggregates } from "@/lib/projects/stages-helpers";
import { CrossProjectStagesView } from "./_components/cross-project-stages-view";
import type { ProjectBundle } from "./_components/types";

export const dynamic = "force-dynamic";

export default async function CrossProjectStagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "MANAGER") {
    redirect("/admin-v2/projects");
  }

  const [projects, candidates] = await Promise.all([
    prisma.project.findMany({
      where: {
        slug: { not: { startsWith: "temp-" } },
        status: { in: ["ACTIVE", "DRAFT"] },
        ...firmWhereForProject(firmId),
      },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        clientCounterparty: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        stages: {
          orderBy: { sortOrder: "asc" },
          include: { responsibleUser: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "MANAGER", "ENGINEER"] },
        isActive: true,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const bundles: ProjectBundle[] = await Promise.all(
    projects.map(async (p) => {
      const aggregates = await computeStageFinanceAggregates(p.id, p.stages);
      const stages = p.stages.map((s) => ({
        ...s,
        // Decimal → number for client.
        allocatedBudget:
          s.allocatedBudget !== null ? Number(s.allocatedBudget) : null,
        planVolume: s.planVolume !== null ? Number(s.planVolume) : null,
        factVolume: s.factVolume !== null ? Number(s.factVolume) : null,
        planUnitPrice:
          s.planUnitPrice !== null ? Number(s.planUnitPrice) : null,
        factUnitPrice:
          s.factUnitPrice !== null ? Number(s.factUnitPrice) : null,
        planClientUnitPrice:
          s.planClientUnitPrice !== null ? Number(s.planClientUnitPrice) : null,
        factClientUnitPrice:
          s.factClientUnitPrice !== null ? Number(s.factClientUnitPrice) : null,
        responsibleName:
          s.responsibleUser?.name ?? s.responsibleName ?? null,
        ...(aggregates.get(s.id) ?? {
          planExpense: 0,
          factExpense: 0,
          planIncome: 0,
          factIncome: 0,
        }),
      }));

      // Project-level totals = sum over root stages.
      const totals = stages
        .filter((s) => s.parentStageId === null)
        .reduce(
          (acc, s) => ({
            planExpense: acc.planExpense + s.planExpense,
            factExpense: acc.factExpense + s.factExpense,
            planIncome: acc.planIncome + s.planIncome,
            factIncome: acc.factIncome + s.factIncome,
          }),
          { planExpense: 0, factExpense: 0, planIncome: 0, factIncome: 0 },
        );

      const visibleProgress = stages.filter(
        (s) => s.parentStageId === null && !s.isHidden && s.kind === "STAGE",
      );
      const projectProgress =
        visibleProgress.length > 0
          ? Math.round(
              visibleProgress.reduce((a, s) => a + s.progress, 0) /
                visibleProgress.length,
            )
          : 0;

      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        managerName: p.manager?.name ?? null,
        clientName: p.client?.name ?? p.clientCounterparty?.name ?? null,
        isTestProject: p.isTestProject,
        progress: projectProgress,
        ...totals,
        stages,
      };
    }),
  );

  return (
    <CrossProjectStagesView
      bundles={bundles}
      candidates={candidates}
      currentUserId={session.user.id ?? null}
    />
  );
}
