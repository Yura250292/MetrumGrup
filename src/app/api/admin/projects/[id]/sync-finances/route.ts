import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { syncProjectEstimatesToStages } from "@/lib/projects/sync-estimate-to-stages";

/**
 * Bulk-sync проєкту: всі APPROVED кошториси → дерево стейджів → STAGE_AUTO
 * FinanceEntry. Раніше викликав syncProjectEstimatesToFinancing (плоскі
 * ESTIMATE_AUTO записи без stageRecordId), тепер делегує у новий потік:
 * один canonical source-of-truth — stage tree, фінанси похідні від нього.
 *
 * ESTIMATE_AUTO записи минулих синхронізацій архівуються у syncEstimateToStages
 * (щоб не дублювалися із STAGE_AUTO у summary).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const role = session.user.role;
  if (role !== "FINANCIER" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  try {
    const result = await syncProjectEstimatesToStages(id, session.user.id);
    const totals = result.details.reduce(
      (acc, r) => ({
        sectionsCreated: acc.sectionsCreated + r.sectionsCreated,
        sectionsUpdated: acc.sectionsUpdated + r.sectionsUpdated,
        itemsCreated: acc.itemsCreated + r.itemsCreated,
        itemsUpdated: acc.itemsUpdated + r.itemsUpdated,
      }),
      { sectionsCreated: 0, sectionsUpdated: 0, itemsCreated: 0, itemsUpdated: 0 },
    );
    const msg = result.estimatesProcessed
      ? `Синхронізовано ${result.estimatesProcessed} кошторисів: розділів ${totals.sectionsCreated + totals.sectionsUpdated}, позицій ${totals.itemsCreated + totals.itemsUpdated}`
      : `У проєкті немає APPROVED кошторисів${result.estimatesSkipped ? ` (пропущено: ${result.estimatesSkipped})` : ""}`;
    return NextResponse.json({
      data: { ...result, totals },
      message: msg,
    });
  } catch (error) {
    console.error("project sync-finances failed:", error);
    const message = error instanceof Error ? error.message : "Помилка синхронізації";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
