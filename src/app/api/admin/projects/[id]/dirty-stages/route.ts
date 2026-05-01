import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { getDirtyStagesForProject } from "@/lib/projects/publish-stages";

export const runtime = "nodejs";

/**
 * Phase 3: повертає список стейджів проєкту, у яких draft-поля
 * (planVolume / planUnitPrice / planClientUnitPrice / factVolume / ...)
 * відрізняються від відповідних published* — тобто є непублікована зміна.
 *
 * Використовується UI:
 *   - stage-table: рендер dot/badge "Не опубліковано" біля кожного dirty-рядка
 *   - publish dialog: попередній перегляд "old → new" перед confirm
 *
 * Auth: будь-який залогінений з доступом до фірми. Сама публікація лишається
 * за canPublishFinance — тут лише read.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
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
      dirtyCount: dirty.length,
      dirty,
    },
  });
}
