"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { recalcCurrentStage } from "@/lib/projects/stages-helpers";
import { assertCanAccessFirm } from "@/lib/firm/scope";

type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Перевіряємо доступ і повертаємо stage + projectId. Throws на доступ
 * або відсутність — викликова сторона ловить як ActionResult.
 */
async function assertStageAccess(stageId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    throw new Error("Forbidden");
  }
  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      projectId: true,
      status: true,
      progress: true,
      project: { select: { firmId: true } },
    },
  });
  if (!stage) throw new Error("Етап не знайдено");
  assertCanAccessFirm(session, stage.project.firmId);
  return { session, stage };
}

/**
 * Перемикач статусу етапу: PENDING → IN_PROGRESS → COMPLETED → PENDING.
 * Тільки один IN_PROGRESS на проєкт — recalcCurrentStage авто-вирівнює.
 */
export async function cycleStageStatusAction(
  stageId: string,
): Promise<ActionResult<{ status: string }>> {
  try {
    const { session, stage } = await assertStageAccess(stageId);

    const next =
      stage.status === "PENDING"
        ? "IN_PROGRESS"
        : stage.status === "IN_PROGRESS"
          ? "COMPLETED"
          : "PENDING";

    // COMPLETED авто-100% progress; назад у PENDING — обнуляємо.
    const data: Record<string, unknown> = { status: next };
    if (next === "COMPLETED") data.progress = 100;
    if (next === "PENDING") data.progress = 0;

    await prisma.projectStageRecord.update({
      where: { id: stageId },
      data,
    });
    await recalcCurrentStage(stage.projectId, {
      syncBudget: false,
      userId: session.user.id,
    });
    await auditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "ProjectStageRecord",
      entityId: stageId,
      projectId: stage.projectId,
      newData: data,
    });

    revalidatePath(`/admin-v2/projects/${stage.projectId}/stages-v2`);
    revalidatePath(`/admin-v2/projects/${stage.projectId}`);
    return { success: true, data: { status: next } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Помилка зміни статусу",
    };
  }
}

/**
 * Встановити прогрес 0..100. Якщо 100 — авто-COMPLETED.
 */
export async function setStageProgressAction(
  stageId: string,
  progress: number,
): Promise<ActionResult> {
  try {
    const { session, stage } = await assertStageAccess(stageId);
    const p = Math.max(0, Math.min(100, Math.round(progress)));
    const data: Record<string, unknown> = { progress: p };
    if (p === 100) data.status = "COMPLETED";
    else if (p > 0 && stage.status === "PENDING") data.status = "IN_PROGRESS";

    await prisma.projectStageRecord.update({
      where: { id: stageId },
      data,
    });
    await recalcCurrentStage(stage.projectId, {
      syncBudget: false,
      userId: session.user.id,
    });
    await auditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "ProjectStageRecord",
      entityId: stageId,
      projectId: stage.projectId,
      newData: data,
    });

    revalidatePath(`/admin-v2/projects/${stage.projectId}/stages-v2`);
    revalidatePath(`/admin-v2/projects/${stage.projectId}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Помилка оновлення прогресу",
    };
  }
}

/**
 * Оновити дати початку/завершення етапу.
 */
export async function updateStageDatesAction(
  stageId: string,
  startDate: string | null,
  endDate: string | null,
): Promise<ActionResult> {
  try {
    const { session, stage } = await assertStageAccess(stageId);

    const data: Record<string, unknown> = {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    };

    await prisma.projectStageRecord.update({
      where: { id: stageId },
      data,
    });
    await auditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "ProjectStageRecord",
      entityId: stageId,
      projectId: stage.projectId,
      newData: data,
    });

    revalidatePath(`/admin-v2/projects/${stage.projectId}/stages-v2`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Помилка оновлення дат",
    };
  }
}
