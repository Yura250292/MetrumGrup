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
 * Phase 6.3 audit dashboard:
 *   - recent — N останніх projection-евентів (за lastProjectedAt desc).
 *   - dirty  — проєкти, у яких хоч один stage updatedAt > lastProjectedAt
 *              (canonical layer змінився, але derived проєкція ще не оновлена).
 *   - neverProjected — projects з planSource != NONE, але lastProjectedAt IS NULL.
 *
 * Test-проєкти виключені (вони все одно не materializeʼаться).
 */
export async function GET(request: NextRequest) {
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

  const [recent, allWithProjection, neverProjected] = await Promise.all([
    prisma.project.findMany({
      where: { ...baseWhere, lastProjectedAt: { not: null } },
      select: {
        id: true,
        title: true,
        planSource: true,
        lastProjectedAt: true,
        projectionVersion: true,
        lastProjectedById: true,
      },
      orderBy: { lastProjectedAt: "desc" },
      take: 25,
    }),
    // Для dirty-перевірки беремо проєкти зі стейджами; max(stage.updatedAt)
    // порівнюємо з project.lastProjectedAt у JS (Prisma не має $expr).
    prisma.project.findMany({
      where: {
        ...baseWhere,
        planSource: { in: ["ESTIMATE", "STAGE"] },
      },
      select: {
        id: true,
        title: true,
        lastProjectedAt: true,
        projectionVersion: true,
        stages: {
          select: { updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.project.count({
      where: {
        ...baseWhere,
        planSource: { in: ["ESTIMATE", "STAGE"] },
        lastProjectedAt: null,
      },
    }),
  ]);

  const dirty = allWithProjection
    .filter((p) => {
      const lastStageEdit = p.stages[0]?.updatedAt;
      if (!lastStageEdit || !p.lastProjectedAt) return false;
      return lastStageEdit > p.lastProjectedAt;
    })
    .map((p) => ({
      id: p.id,
      title: p.title,
      lastProjectedAt: p.lastProjectedAt,
      projectionVersion: p.projectionVersion,
      lastStageEditAt: p.stages[0]!.updatedAt,
    }))
    .sort((a, b) => b.lastStageEditAt.getTime() - a.lastStageEditAt.getTime())
    .slice(0, 25);

  // Resolve "last projected by" names in one batch.
  const userIds = Array.from(
    new Set(recent.map((p) => p.lastProjectedById).filter((id): id is string => !!id)),
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
      lastProjectedAt: p.lastProjectedAt,
      projectionVersion: p.projectionVersion,
      lastProjectedBy: p.lastProjectedById
        ? (userNameById.get(p.lastProjectedById) ?? null)
        : null,
    })),
    dirty,
    neverProjected,
    totalDirty: dirty.length,
  });
}
