import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { canPublishFinance } from "@/lib/financing/rbac";

export const runtime = "nodejs";

/**
 * Phase 3 unpublish: скидає опубліковані поля стейджів у NULL і видаляє
 * відповідні STAGE_AUTO FinanceEntry для проєкту. Drafts (planVolume etc.)
 * НЕ зачіпаються — користувач і далі бачить свої цифри у stage tree, просто
 * фінансовий журнал їх більше не показує до наступного publish.
 *
 * Use case: AI спарсило кошторис криво, користувач натиснув publish раніше,
 * ніж побачив помилку. Тепер може «скасувати публікацію», виправити drafts,
 * і опублікувати знову.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canPublishFinance(session.user.role)) return forbiddenResponse();

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { firmId: true, isTestProject: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  // Атомарно: clear published* + remove STAGE_AUTO + reset publication metadata.
  const result = await prisma.$transaction(async (tx) => {
    const cleared = await tx.projectStageRecord.updateMany({
      where: { projectId },
      data: {
        publishedPlanVolume: null,
        publishedFactVolume: null,
        publishedPlanUnitPrice: null,
        publishedFactUnitPrice: null,
        publishedPlanClientUnitPrice: null,
        publishedFactClientUnitPrice: null,
      },
    });
    const removed = await tx.financeEntry.deleteMany({
      where: { projectId, source: "STAGE_AUTO" },
    });
    await tx.project.update({
      where: { id: projectId },
      data: {
        lastPublishedAt: null,
        lastPublishedById: null,
        publicationVersion: 0,
      },
    });
    return { stagesReset: cleared.count, financeEntriesRemoved: removed.count };
  });

  return NextResponse.json({
    data: result,
    message: `Скасовано публікацію: очищено ${result.stagesReset} стейджів, видалено ${result.financeEntriesRemoved} STAGE_AUTO записів`,
  });
}
