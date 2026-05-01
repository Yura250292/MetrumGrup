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
 * Phase 3 audit dashboard:
 *   - recent — N останніх publish-евентів (за lastPublishedAt desc).
 *   - dirty  — проєкти, у яких хоч один stage має draft-поле ≠ published*
 *              (є непублікована зміна).
 *   - neverProjected — projects з planSource != NONE, але lastPublishedAt IS NULL.
 *
 * Test-проєкти виключені.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, firmId);
  if (!canRunFinanceDiagnostics(role)) return forbiddenResponse();

  const firmScope = firmId ? { firmId } : {};
  const baseWhere = {
    isTestProject: false,
    ...firmScope,
  };

  // Phase 3: dirty-критерій — наявність хоч одного стейджу проєкту з draft ≠ published.
  // IS DISTINCT FROM коректно обробляє NULL (NULL IS DISTINCT FROM 5 = true,
  // NULL IS DISTINCT FROM NULL = false), на відміну від =/!=.
  const dirtyProjectIdsRaw = await prisma.$queryRaw<{ projectId: string }[]>`
    SELECT DISTINCT "projectId"
    FROM "project_stage_records"
    WHERE
         "planVolume"          IS DISTINCT FROM "publishedPlanVolume"
      OR "factVolume"          IS DISTINCT FROM "publishedFactVolume"
      OR "planUnitPrice"       IS DISTINCT FROM "publishedPlanUnitPrice"
      OR "factUnitPrice"       IS DISTINCT FROM "publishedFactUnitPrice"
      OR "planClientUnitPrice" IS DISTINCT FROM "publishedPlanClientUnitPrice"
      OR "factClientUnitPrice" IS DISTINCT FROM "publishedFactClientUnitPrice"
  `;
  const dirtyProjectIds = dirtyProjectIdsRaw.map((r) => r.projectId);

  const [recent, dirtyProjects, neverProjected] = await Promise.all([
    prisma.project.findMany({
      where: { ...baseWhere, lastPublishedAt: { not: null } },
      select: {
        id: true,
        title: true,
        planSource: true,
        lastPublishedAt: true,
        publicationVersion: true,
        lastPublishedById: true,
      },
      orderBy: { lastPublishedAt: "desc" },
      take: 25,
    }),
    dirtyProjectIds.length > 0
      ? prisma.project.findMany({
          where: { ...baseWhere, id: { in: dirtyProjectIds } },
          select: {
            id: true,
            title: true,
            lastPublishedAt: true,
            publicationVersion: true,
            // Беремо max stage.updatedAt для сортування dirty-списку — точна
            // фільтрація dirty-стейджів тут не потрібна, її робить SQL вище.
            stages: {
              select: { updatedAt: true },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
          },
        })
      : Promise.resolve([] as Array<{
          id: string;
          title: string;
          lastPublishedAt: Date | null;
          publicationVersion: number;
          stages: { updatedAt: Date }[];
        }>),
    prisma.project.count({
      where: {
        ...baseWhere,
        planSource: { in: ["ESTIMATE", "STAGE"] },
        lastPublishedAt: null,
      },
    }),
  ]);

  const dirty = dirtyProjects
    .map((p) => ({
      id: p.id,
      title: p.title,
      lastPublishedAt: p.lastPublishedAt,
      publicationVersion: p.publicationVersion,
      lastStageEditAt: p.stages[0]?.updatedAt ?? p.lastPublishedAt ?? new Date(0),
    }))
    .sort((a, b) => b.lastStageEditAt.getTime() - a.lastStageEditAt.getTime())
    .slice(0, 25);

  // Resolve "last projected by" names in one batch.
  const userIds = Array.from(
    new Set(recent.map((p) => p.lastPublishedById).filter((id): id is string => !!id)),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  return NextResponse.json({
    firmId,
    recent: recent.map((p) => ({
      id: p.id,
      title: p.title,
      planSource: p.planSource,
      lastPublishedAt: p.lastPublishedAt,
      publicationVersion: p.publicationVersion,
      lastPublishedBy: p.lastPublishedById
        ? (userNameById.get(p.lastPublishedById) ?? null)
        : null,
    })),
    dirty,
    neverProjected,
    totalDirty: dirty.length,
  });
}
