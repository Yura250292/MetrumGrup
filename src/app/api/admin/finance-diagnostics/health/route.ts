import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { canRunFinanceDiagnostics } from "@/lib/financing/rbac";

export const runtime = "nodejs";

/**
 * Глобальний health-check фінансових інваріантів у scope активної фірми.
 * Phase 6 з improvement plan: переводимо repair-логіку у observability.
 *
 * Поля:
 *  - orphanProjectBudget — PROJECT_BUDGET без projectId (висять після видалення).
 *  - entriesMissingFirmId — кількість записів без firmId у scope (старі/imported).
 *  - entriesMissingFirmIdWithProject — гірший підмножина: projectId є, firmId NULL.
 *  - projectsWithDuplicatePlanLayers — проєкти, де одночасно є PROJECT_BUDGET і
 *    деталізований план (ESTIMATE_AUTO або STAGE_AUTO PLAN/EXPENSE). Після QW1
 *    summary їх дедуплікує, але raw-shape у БД лишається — корисний сигнал.
 *  - entriesOnTestProjects — записи на isTestProject=true (мають бути 0 після QW2).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, firmId);
  if (!canRunFinanceDiagnostics(role)) return forbiddenResponse();

  const firmScope = firmId ? { firmId } : {};

  const [
    orphanProjectBudget,
    entriesMissingFirmId,
    entriesMissingFirmIdWithProject,
    detailedPlanRows,
    projectBudgetRows,
    entriesOnTestProjects,
  ] = await Promise.all([
    prisma.financeEntry.count({
      where: { source: "PROJECT_BUDGET", projectId: null, ...firmScope },
    }),
    prisma.financeEntry.count({
      where: { firmId: null },
    }),
    prisma.financeEntry.count({
      where: { firmId: null, projectId: { not: null } },
    }),
    prisma.financeEntry.findMany({
      where: {
        source: { in: ["ESTIMATE_AUTO", "STAGE_AUTO"] },
        kind: "PLAN",
        type: "EXPENSE",
        projectId: { not: null },
        ...firmScope,
      },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
    prisma.financeEntry.findMany({
      where: {
        source: "PROJECT_BUDGET",
        projectId: { not: null },
        ...firmScope,
      },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
    prisma.financeEntry.count({
      where: {
        project: { isTestProject: true },
        ...firmScope,
      },
    }),
  ]);

  const detailedSet = new Set(
    detailedPlanRows.map((r) => r.projectId).filter((id): id is string => !!id),
  );
  const projectsWithDuplicatePlanLayers = projectBudgetRows.filter(
    (r) => r.projectId && detailedSet.has(r.projectId),
  ).length;

  const counts = {
    orphanProjectBudget,
    entriesMissingFirmId,
    entriesMissingFirmIdWithProject,
    projectsWithDuplicatePlanLayers,
    entriesOnTestProjects,
  };

  const totalIssues =
    orphanProjectBudget +
    entriesMissingFirmIdWithProject +
    projectsWithDuplicatePlanLayers +
    entriesOnTestProjects;

  return NextResponse.json({
    firmId,
    counts,
    totalIssues,
    healthy: totalIssues === 0,
  });
}
