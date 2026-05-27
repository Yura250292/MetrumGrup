import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { classifyStageByName } from "@/lib/projects/classify-stage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backfill costType для існуючих стейджів цього проєкту, у яких
 * костТайп null. Класифікація — евристична за назвою (classifyStageByName).
 * Існуючі ненульові значення не перезаписуються.
 *
 * Безпечно: не торкає чисел, статусу, дат, материалів. Тільки costType.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
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
  } catch {
    return forbiddenResponse();
  }

  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId, costType: null },
    select: { id: true, customName: true, stage: true, kind: true },
  });

  let labor = 0;
  let material = 0;
  let skipped = 0;

  for (const s of stages) {
    // Групові категорії — не чіпаємо (лишаємо null).
    if (s.kind === "GROUP") {
      skipped++;
      continue;
    }
    const cls = classifyStageByName(s.customName ?? s.stage ?? "");
    if (cls === "OTHER") {
      skipped++;
      continue;
    }
    await prisma.projectStageRecord.update({
      where: { id: s.id },
      data: { costType: cls },
    });
    if (cls === "LABOR") labor++;
    else material++;
  }

  return NextResponse.json({
    data: {
      scanned: stages.length,
      labor,
      material,
      skipped,
    },
  });
}
