import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { syncEstimateToStages } from "@/lib/projects/sync-estimate-to-stages";
import { canPublishFinance } from "@/lib/financing/rbac";

/**
 * Sync одного кошторису. Делегує у новий потік estimate→stage→STAGE_AUTO
 * FinanceEntry, замість колишнього syncEstimateToFinancing (плоскі
 * ESTIMATE_AUTO без stageRecordId). Старі ESTIMATE_AUTO записи цього кошторису
 * архівуються всередині syncEstimateToStages.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (!canPublishFinance(session.user.role)) return forbiddenResponse();

  const { id } = await params;

  const exists = await prisma.estimate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Кошторис не знайдено" }, { status: 404 });
  }

  try {
    const result = await syncEstimateToStages(id, session.user.id);
    return NextResponse.json({
      data: result,
      message: `Створено етапів: ${result.sectionsCreated}, підетапів: ${result.itemsCreated}; оновлено: ${result.sectionsUpdated + result.itemsUpdated}`,
    });
  } catch (error) {
    console.error("sync-to-financing failed:", error);
    const message = error instanceof Error ? error.message : "Помилка синхронізації";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
