import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { parseExcelProjectPlan } from "@/lib/parsers/excel-project-plan-parser";
import { importExcelPlanToEstimate } from "@/lib/projects/import-excel-plan";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/projects/[id]/import-excel-plan
 *
 * multipart/form-data:
 *   - file: .xlsx з листами PROJECTS / STAGES (формат «ПРОЄКТ New.xlsx»)
 *   - title (optional): override назви Estimate
 *
 * Парс + створення Estimate(DRAFT, INTERNAL) у транзакції. Подальший sync
 * (estimate → stages → tasks) користувач запускає окремо через існуючу
 * sync-кнопку — так зберігається явність дії.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "ENGINEER"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch (err) {
    if (err instanceof Error && (err as any).status === 403) {
      return forbiddenResponse();
    }
    throw err;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const titleOverride = (formData.get("title") as string | null)?.trim() || undefined;

    if (!file) {
      return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Підтримується тільки .xlsx (формат STAGES/PROJECTS)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseExcelProjectPlan(buffer);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.errors.join("; ") || "Помилка парсингу" },
        { status: 400 },
      );
    }

    const result = await importExcelPlanToEstimate({
      projectId,
      userId: session.user.id,
      parsed,
      estimateTitle: titleOverride,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[import-excel-plan] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Помилка імпорту" },
      { status: 500 },
    );
  }
}
