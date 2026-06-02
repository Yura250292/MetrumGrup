import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import {
  syncEstimateToStages,
  syncProjectEstimatesToStages,
} from "@/lib/projects/sync-estimate-to-stages";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET — список кошторисів проєкту з прапорцем «вже синхронізовано» (модалці).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

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

  const estimates = await prisma.estimate.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      role: true,
      financeSyncedAt: true,
      finalAmount: true,
      finalClientPrice: true,
      _count: { select: { sections: true, items: true } },
    },
  });

  return NextResponse.json({
    data: estimates.map((e) => ({
      id: e.id,
      number: e.number,
      title: e.title,
      status: e.status,
      role: e.role,
      finalAmount: Number(e.finalAmount),
      finalClientPrice: Number(e.finalClientPrice),
      sections: e._count.sections,
      items: e._count.items,
      syncedAt: e.financeSyncedAt,
    })),
  });
}

/**
 * POST — імпортувати один кошторис у дерево стейджів. Якщо `estimateId` не
 * передано, синхронізуються всі затверджені (status=APPROVED) кошториси.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

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

  const body = await request.json().catch(() => ({}));
  const estimateId =
    typeof body.estimateId === "string" && body.estimateId.trim()
      ? body.estimateId.trim()
      : null;

  try {
    if (estimateId) {
      // Перевіряємо приналежність кошторису до проєкту.
      const est = await prisma.estimate.findUnique({
        where: { id: estimateId },
        select: { id: true, projectId: true },
      });
      if (!est || est.projectId !== projectId) {
        return NextResponse.json({ error: "Кошторис не знайдено" }, { status: 404 });
      }
      const result = await syncEstimateToStages(estimateId, session.user.id);
      return NextResponse.json({ data: result });
    }

    const bulk = await syncProjectEstimatesToStages(projectId, session.user.id);
    return NextResponse.json({ data: bulk });
  } catch (err) {
    console.error("[import-estimate] failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Помилка імпорту кошторису",
      },
      { status: 500 },
    );
  }
}
