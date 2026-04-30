import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { recalcCurrentStage } from "@/lib/projects/stages-helpers";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import type { StageStatus } from "@prisma/client";

const VALID_STATUSES: StageStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const { id: projectId, stageId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: { id: true, projectId: true, project: { select: { firmId: true } } },
  });
  if (!stage || stage.projectId !== projectId) {
    return NextResponse.json({ error: "Етап не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, stage.project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const body = await request.json();

  const data: Record<string, unknown> = {};
  let needsRecalc = false;
  let needsBudgetSync = false;

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Невалідний статус" }, { status: 400 });
    }
    data.status = body.status;
    needsRecalc = true;
  }
  if (body.progress !== undefined) {
    const p = Number(body.progress);
    if (!Number.isFinite(p)) {
      return NextResponse.json({ error: "Невалідний прогрес" }, { status: 400 });
    }
    data.progress = Math.max(0, Math.min(100, Math.round(p)));
    needsRecalc = true;
  }
  if (body.responsibleUserId !== undefined) {
    data.responsibleUserId = body.responsibleUserId || null;
  }
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if (body.startDate !== undefined) {
    data.startDate = body.startDate ? new Date(body.startDate) : null;
  }
  if (body.endDate !== undefined) {
    data.endDate = body.endDate ? new Date(body.endDate) : null;
  }
  if (body.allocatedBudget !== undefined) {
    if (body.allocatedBudget === null || body.allocatedBudget === "") {
      data.allocatedBudget = null;
    } else {
      const n = Number(body.allocatedBudget);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "Невалідний бюджет" }, { status: 400 });
      }
      data.allocatedBudget = n;
    }
    needsBudgetSync = true;
  }
  if (body.customName !== undefined) {
    data.customName =
      typeof body.customName === "string" && body.customName.trim()
        ? body.customName.trim()
        : null;
  }
  if (body.unit !== undefined) {
    data.unit =
      typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
  }
  for (const field of ["planVolume", "factVolume"] as const) {
    if (body[field] !== undefined) {
      const raw = body[field];
      if (raw === null || raw === "") {
        data[field] = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: `Невалідне значення поля ${field}` },
            { status: 400 },
          );
        }
        data[field] = n;
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Немає полів для оновлення" }, { status: 400 });
  }

  // Якщо переводимо в COMPLETED — автоматично виставляємо progress=100.
  if (data.status === "COMPLETED" && body.progress === undefined) {
    data.progress = 100;
  }

  const updated = await prisma.projectStageRecord.update({
    where: { id: stageId },
    data,
  });

  if (needsRecalc || needsBudgetSync) {
    await recalcCurrentStage(projectId, {
      syncBudget: needsBudgetSync,
      userId: session.user.id,
    });
  }

  await auditLog({
    userId: session.user.id,
    action: "UPDATE",
    entity: "ProjectStageRecord",
    entityId: stageId,
    projectId,
    newData: data,
  });

  return NextResponse.json({ data: updated });
}
