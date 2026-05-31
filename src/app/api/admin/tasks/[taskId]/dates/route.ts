import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

/**
 * PUT /api/admin/tasks/[taskId]/dates
 *
 * Окремий ендпойнт для drag-resize на Gantt. Body:
 *   { plannedStartAt?, plannedEndAt?, startDate?, dueDate?, rebaseline?: boolean }
 *
 * Поведінка:
 *  - snap-to-day: всі дати округлюються до 00:00 UTC того ж дня.
 *  - якщо `baselineFrozenAt != null && (plannedStartAt|plannedEndAt set) && !rebaseline`
 *    — 409 з повідомленням «baseline locked».
 *  - RBAC: canEditAnyTask АБО (canEditOwnTasks і автор/assignee).
 */
function snap(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return undefined;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      createdById: true,
      baselineFrozenAt: true,
      sourceEstimateItemId: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await isTasksEnabledForProject(existing.projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }

  const ctx = await getProjectAccessContext(existing.projectId, session.user.id);
  if (!ctx?.canViewTasks)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isOwner = existing.createdById === session.user.id;
  const isAssignee =
    (await prisma.taskAssignee.count({
      where: { taskId, userId: session.user.id },
    })) > 0;
  const canEdit =
    ctx.canEditAnyTask ||
    ((ctx.member?.effective.canEditOwnTasks ?? false) && (isOwner || isAssignee));
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plannedStartAt = snap(body.plannedStartAt);
  const plannedEndAt = snap(body.plannedEndAt);
  const startDate = snap(body.startDate);
  const dueDate = snap(body.dueDate);
  const rebaseline = body.rebaseline === true;

  const touchingPlanned =
    plannedStartAt !== undefined || plannedEndAt !== undefined;
  if (existing.baselineFrozenAt && touchingPlanned && !rebaseline) {
    return NextResponse.json(
      {
        error: "Baseline locked",
        message:
          "Baseline зафіксовано. Розморозьте через /baseline/clear або передайте rebaseline=true.",
      },
      { status: 409 },
    );
  }

  const data: Record<string, Date | null> = {};
  if (plannedStartAt !== undefined) data.plannedStartAt = plannedStartAt;
  if (plannedEndAt !== undefined) data.plannedEndAt = plannedEndAt;
  if (startDate !== undefined) data.startDate = startDate;
  if (dueDate !== undefined) data.dueDate = dueDate;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No date fields provided" }, { status: 400 });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data,
    select: {
      id: true,
      startDate: true,
      dueDate: true,
      plannedStartAt: true,
      plannedEndAt: true,
      baselineFrozenAt: true,
    },
  });

  // Bi-directional sync: якщо таск згенерований з рядка кошторису і ми
  // змінили planned* дати — оновити EstimateItem.plannedStart / plannedDurationDays
  // щоб наступний sync не перетер ці зміни назад. Виконуємо best-effort:
  // помилка тут не валідує сам PUT (Gantt уже зрендерив нову позицію бару).
  if (existing.sourceEstimateItemId && touchingPlanned) {
    try {
      const effStart = data.plannedStartAt ?? updated.plannedStartAt ?? null;
      const effEnd = data.plannedEndAt ?? updated.plannedEndAt ?? null;
      const durationDays =
        effStart && effEnd
          ? Math.max(0, Math.round((effEnd.getTime() - effStart.getTime()) / 86400000))
          : null;
      await prisma.estimateItem.update({
        where: { id: existing.sourceEstimateItemId },
        data: {
          plannedStart: effStart,
          plannedEnd: effEnd,
          plannedDurationDays: durationDays,
        },
      });
    } catch (err) {
      console.warn(
        "[tasks/dates] bi-directional sync to estimate failed",
        { taskId, sourceItemId: existing.sourceEstimateItemId },
        err,
      );
    }
  }

  return NextResponse.json({ data: updated });
}
