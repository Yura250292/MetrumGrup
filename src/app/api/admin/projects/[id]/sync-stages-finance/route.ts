import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { syncStageAutoFinanceEntries } from "@/lib/projects/stage-auto-finance";
import { canPublishFinance } from "@/lib/financing/rbac";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Bulk-збереження стейджів проєкту у фінансування.
 *
 * Викликається кнопкою «Зберегти у фінансування» з overview-табу. Для кожного
 * стейджу з planVolume/planUnitPrice/planClientUnitPrice/factVolume/...
 * створюється або оновлюється STAGE_AUTO FinanceEntry (PLAN/FACT × INCOME/EXPENSE).
 * Якщо обсяг чи ціна обнулені — відповідний автозапис видаляється.
 *
 * Тестові проєкти (`isTestProject=true`) НЕ синхронізуються — щоб не
 * засмічувати реальне фінансування демо-цифрами. Endpoint повертає 400 з
 * чітким повідомленням, UI відображає disabled-кнопку з підказкою.
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
  // створені STAGE_AUTO записи, які треба прибрати при обнулених обсягах).
  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true },
  });

  let synced = 0;
  let failed = 0;
  for (const s of stages) {
    try {
      await syncStageAutoFinanceEntries(s.id, session.user.id);
      synced++;
    } catch (err) {
      failed++;
      console.error(`[sync-stages-finance] stage ${s.id} failed:`, err);
    }
  }

  return NextResponse.json({
    data: {
      total: stages.length,
      synced,
      failed,
    },
    message: `Синхронізовано ${synced} етапів${failed ? `, помилок: ${failed}` : ""}`,
  });
}
