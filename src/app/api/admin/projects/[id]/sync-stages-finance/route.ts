import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { syncStageAutoFinanceEntries } from "@/lib/projects/stage-auto-finance";
import { copyDraftToPublishedForStages } from "@/lib/projects/publish-stages";
import { canPublishFinance } from "@/lib/financing/rbac";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Phase 3 publish endpoint (історична назва sync-stages-finance збережена для
 * backward-compat з існуючою кнопкою «Зберегти у фінансування»).
 *
 * Атомарно копіює draft-поля стейджів у published* і потім синхронізує
 * STAGE_AUTO FinanceEntry. До цього моменту drafts вільно редагуються у stage
 * tree, фінансовий журнал лишається на попередньо опублікованому стані —
 * звіти не показують незатверджені цифри.
 *
 * Тестові проєкти (`isTestProject=true`) НЕ публікуються — щоб не
 * засмічувати реальне фінансування демо-цифрами.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  // Phase 5: вирівняно з sync-to-financing — FINANCIER теж може publishʼити
  // STAGE_AUTO у фінансування (раніше було лише SUPER_ADMIN/MANAGER, що
  // суперечило сусідньому endpoint-у).
  if (!canPublishFinance(session.user.role)) return forbiddenResponse();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true, isTestProject: true },
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
          "Це тестовий проєкт. Синхронізація з фінансуванням заборонена для тестових проєктів.",
        skipped: true,
      },
      { status: 400 },
    );
  }

  // Беремо всі стейджі (включно з прихованими, бо вони могли мати раніше
  // опубліковані STAGE_AUTO записи, які треба прибрати при обнулених обсягах).
  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true },
  });
  const stageIds = stages.map((s) => s.id);

  // Phase 3: атомарне копіювання draft → published для всіх стейджів проєкту.
  // Робиться однією транзакцією до того як починається STAGE_AUTO sync, щоб
  // не було проміжного стану коли частина стейджів опубліковано, інша ні.
  await copyDraftToPublishedForStages(stageIds);

  let synced = 0;
  let failed = 0;
  for (const stageId of stageIds) {
    try {
      await syncStageAutoFinanceEntries(stageId, session.user.id);
      synced++;
    } catch (err) {
      failed++;
      console.error(`[publish-stages-finance] stage ${stageId} failed:`, err);
    }
  }

  return NextResponse.json({
    data: {
      total: stageIds.length,
      published: synced,
      failed,
    },
    message: `Опубліковано ${synced} етапів${failed ? `, помилок: ${failed}` : ""}`,
  });
}
