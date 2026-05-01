import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { canPublishFinance } from "@/lib/financing/rbac";
import { syncStageAutoFinanceEntries } from "@/lib/projects/stage-auto-finance";
import {
  copyDraftToPublishedForStages,
  getDirtyStagesForProject,
} from "@/lib/projects/publish-stages";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Phase 3: Publish stage tree → finance.
 *
 * Атомарно копіює draft (planVolume/...) у published* для всіх dirty-стейджів,
 * потім перераховує STAGE_AUTO FinanceEntry. Опційний коментар зберігається
 * в auditLog. Якщо нічого не dirty — повертає no-op без bump-у версії.
 *
 * Це канонічна publish-операція. Існуючий /sync-stages-finance тепер делегує
 * сюди (зворотня сумісність API для UI що ще не оновлено).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canPublishFinance(session.user.role)) return forbiddenResponse();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      firmId: true,
      isTestProject: true,
      publicationVersion: true,
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

  if (project.isTestProject) {
    return NextResponse.json(
      {
        error:
          "Це тестовий проєкт. Публікація у фінансування заборонена для тестових проєктів.",
        skipped: true,
      },
      { status: 400 },
    );
  }

  let body: { comment?: string } = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    // Тіло опційне.
  }
  const comment =
    typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : "";

  const dirty = await getDirtyStagesForProject(projectId);
  if (dirty.length === 0) {
    return NextResponse.json({
      data: { totalStages: 0, publishedStages: 0, firstTimePublished: false },
      message: "Немає змін для публікації",
    });
  }

  const dirtyIds = dirty.map((d) => d.stageId);
  const firstTimePublished = project.publicationVersion === 0;

  // Атомарне копіювання draft→published. Bump версії і фіксація автора —
  // у тій самій транзакції, щоб ніщо не побачило "наполовину опубліковано".
  await prisma.$transaction(async (tx) => {
    await copyDraftToPublishedForStages(dirtyIds, tx);
    await tx.project.update({
      where: { id: projectId },
      data: {
        lastPublishedAt: new Date(),
        lastPublishedById: session.user.id,
        publicationVersion: { increment: 1 },
      },
    });
  });

  // STAGE_AUTO sync — поза транзакцією, бо кожен виклик сам recompute-ить
  // planSource і робить кілька upsert. Якщо тут падає окремий стейдж —
  // лічимо й повертаємо partial-успіх; при наступному publish вирівняється.
  let syncedCount = 0;
  let failedCount = 0;
  for (const stageId of dirtyIds) {
    try {
      await syncStageAutoFinanceEntries(stageId, session.user.id);
      syncedCount++;
    } catch (err) {
      failedCount++;
      console.error(`[publish-stages-finance] stage ${stageId} failed:`, err);
    }
  }

  if (comment.length > 0) {
    await auditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "Project",
      entityId: projectId,
      projectId,
      newData: {
        publishStagesFinance: {
          comment,
          stagesPublished: dirtyIds.length,
          firstTimePublished,
        },
      },
    });
  }

  return NextResponse.json({
    data: {
      totalStages: dirtyIds.length,
      publishedStages: syncedCount,
      failed: failedCount,
      firstTimePublished,
    },
    message: `Опубліковано ${syncedCount} етап${syncedCount === 1 ? "" : "ів"}${
      failedCount ? `, помилок: ${failedCount}` : ""
    }`,
  });
}
