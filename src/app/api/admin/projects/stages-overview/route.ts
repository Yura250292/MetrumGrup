import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  firmWhereForProject,
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { computeStageFinanceAggregates } from "@/lib/projects/stages-helpers";

/**
 * Cross-project stages overview for /admin-v2/projects/stages.
 *
 * Returns active projects of the active firm with their full stage tree
 * (`kind`, `parentStageId`, plan/fact volume×price) and pre-computed
 * plan/fact expense+income aggregates per stage (descendant rollup via
 * `computeStageFinanceAggregates`). Project-level totals are summed in code.
 *
 * Query params:
 *   ?pm=me — keep only projects where current user is manager OR responsible
 *            for at least one stage.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const pmFilter = url.searchParams.get("pm");
  const userId = session.user.id;

  try {
    const projects = await prisma.project.findMany({
      where: {
        slug: { not: { startsWith: "temp-" } },
        status: { in: ["ACTIVE", "DRAFT"] },
        ...firmWhereForProject(firmId),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        managerId: true,
        manager: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        clientCounterparty: { select: { id: true, name: true } },
        stages: {
          orderBy: [{ parentStageId: "asc" }, { sortOrder: "asc" }],
          select: {
            id: true,
            kind: true,
            stage: true,
            customName: true,
            isHidden: true,
            status: true,
            progress: true,
            startDate: true,
            endDate: true,
            sortOrder: true,
            parentStageId: true,
            unit: true,
            factUnit: true,
            planVolume: true,
            factVolume: true,
            planUnitPrice: true,
            factUnitPrice: true,
            planClientUnitPrice: true,
            factClientUnitPrice: true,
            allocatedBudget: true,
            notes: true,
            responsibleUserId: true,
            responsibleName: true,
            responsibleUser: { select: { id: true, name: true } },
          },
        },
      },
    });

    const projectsOut = await Promise.all(
      projects.map(async (p) => {
        const aggMap = await computeStageFinanceAggregates(
          p.id,
          p.stages.map((s) => ({ id: s.id, parentStageId: s.parentStageId })),
        );

        const stages = p.stages.map((s) => {
          const agg = aggMap.get(s.id) ?? {
            planExpense: 0,
            factExpense: 0,
            planIncome: 0,
            factIncome: 0,
          };
          return {
            id: s.id,
            kind: s.kind,
            stage: s.stage,
            customName: s.customName,
            isHidden: s.isHidden,
            status: s.status,
            progress: s.progress,
            startDate: s.startDate ? s.startDate.toISOString() : null,
            endDate: s.endDate ? s.endDate.toISOString() : null,
            sortOrder: s.sortOrder,
            parentStageId: s.parentStageId,
            unit: s.unit,
            factUnit: s.factUnit,
            planVolume: s.planVolume ? Number(s.planVolume) : null,
            factVolume: s.factVolume ? Number(s.factVolume) : null,
            planUnitPrice: s.planUnitPrice ? Number(s.planUnitPrice) : null,
            factUnitPrice: s.factUnitPrice ? Number(s.factUnitPrice) : null,
            planClientUnitPrice: s.planClientUnitPrice
              ? Number(s.planClientUnitPrice)
              : null,
            factClientUnitPrice: s.factClientUnitPrice
              ? Number(s.factClientUnitPrice)
              : null,
            allocatedBudget: s.allocatedBudget ? Number(s.allocatedBudget) : null,
            notes: s.notes,
            responsibleUserId: s.responsibleUserId,
            responsibleName:
              s.responsibleUser?.name ?? s.responsibleName ?? null,
            ...agg,
          };
        });

        // Project-level totals = sum of root-level (parentStageId=null) buckets.
        const rootIds = stages
          .filter((s) => s.parentStageId === null)
          .map((s) => s.id);
        const totals = rootIds.reduce(
          (acc, id) => {
            const agg = aggMap.get(id);
            if (!agg) return acc;
            return {
              planExpense: acc.planExpense + agg.planExpense,
              factExpense: acc.factExpense + agg.factExpense,
              planIncome: acc.planIncome + agg.planIncome,
              factIncome: acc.factIncome + agg.factIncome,
            };
          },
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
          managerId: p.managerId,
          managerName: p.manager?.name ?? null,
          clientName: p.client?.name ?? p.clientCounterparty?.name ?? null,
          progress: projectProgress,
          ...totals,
          stages,
        };
      }),
    );

    let filtered = projectsOut;
    if (pmFilter === "me" && userId) {
      filtered = projectsOut.filter(
        (p) =>
          p.managerId === userId ||
          p.stages.some((s) => s.responsibleUserId === userId),
      );
    }

    return NextResponse.json({ data: filtered });
  } catch (error) {
    console.error("[stages-overview] error:", error);
    return NextResponse.json(
      { error: "Помилка завантаження дерева етапів" },
      { status: 500 },
    );
  }
}
