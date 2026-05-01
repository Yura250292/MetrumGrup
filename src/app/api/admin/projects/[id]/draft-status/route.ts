import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { canRunFinanceDiagnostics } from "@/lib/financing/rbac";
import { getDirtyStagesForProject } from "@/lib/projects/publish-stages";

export const runtime = "nodejs";

/**
 * Phase 3: GET draft vs published статус для проєкту.
 *
 * Повертає:
 *   - dirty[]      — стейджі, де draft-поля ≠ published* з переліком імен різних полів
 *   - publicationVersion / lastPublishedAt — у якому стані останній publish
 *   - hasNeverPublished — true якщо publicationVersion === 0
 *
 * UI використовує це щоб:
 *   - показати badge «не опубліковано» біля dirty-стейджу;
 *   - підрахувати лічильник на кнопці «Опублікувати у фінансування»;
 *   - попередити «фінансовий журнал ще не оновлений» при first-time перегляді.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canRunFinanceDiagnostics(session.user.role)) return forbiddenResponse();

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      firmId: true,
      isTestProject: true,
      publicationVersion: true,
      lastPublishedAt: true,
      lastPublishedById: true,
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const dirty = await getDirtyStagesForProject(projectId);

  return NextResponse.json({
    data: {
      projectId,
      publicationVersion: project.publicationVersion,
      lastPublishedAt: project.lastPublishedAt,
      lastPublishedById: project.lastPublishedById,
      hasNeverPublished: project.publicationVersion === 0,
      dirty,
      dirtyCount: dirty.length,
    },
  });
}
