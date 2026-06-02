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
    if (data.responsibleUserId) data.responsibleName = null;
  }
  if (body.responsibleName !== undefined) {
    const v =
      typeof body.responsibleName === "string" && body.responsibleName.trim()
        ? body.responsibleName.trim()
        : null;
    if (!v) {
      data.responsibleName = null;
      // Не чіпаємо responsibleUserId якщо його не передали окремо.
    } else {
      // Спробуємо знайти існуючого юзера з таким імʼям (case-insensitive) —
      // тоді FK має пріоритет і ми не дублюємо.
      const matched = await prisma.user.findFirst({
        where: { name: { equals: v, mode: "insensitive" }, isActive: true },
        select: { id: true },
      });
      if (matched) {
        data.responsibleUserId = matched.id;
        data.responsibleName = null;
      } else {
        data.responsibleUserId = null;
        data.responsibleName = v;
      }
    }
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
  if (body.costType !== undefined) {
    if (body.costType !== null && body.costType !== "LABOR" && body.costType !== "MATERIAL") {
      return NextResponse.json({ error: "Невалідний тип позиції" }, { status: 400 });
    }
    data.costType = body.costType;
  }
  // Календарне планування (графік).
  if (body.plannedDurationDays !== undefined) {
    if (body.plannedDurationDays === null || body.plannedDurationDays === "") {
      data.plannedDurationDays = null;
    } else {
      const n = Number(body.plannedDurationDays);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "Невалідна тривалість" }, { status: 400 });
      }
      data.plannedDurationDays = Math.round(n);
    }
  }
  if (body.predecessorStageId !== undefined) {
    if (body.predecessorStageId && body.predecessorStageId !== stageId) {
      const pred = await prisma.projectStageRecord.findFirst({
        where: { id: body.predecessorStageId, projectId },
        select: { id: true },
      });
      if (!pred) {
        return NextResponse.json({ error: "Попередник не знайдений у проєкті" }, { status: 400 });
      }
      data.predecessorStageId = body.predecessorStageId;
    } else {
      data.predecessorStageId = null;
    }
  }
  if (body.dependencyType !== undefined) {
    const allowed = ["FS", "SS", "FF", "SF"];
    if (body.dependencyType !== null && !allowed.includes(body.dependencyType)) {
      return NextResponse.json({ error: "Невалідний тип звʼязку" }, { status: 400 });
    }
    data.dependencyType = body.dependencyType;
  }
  if (body.dependencyLagDays !== undefined) {
    const n = Number(body.dependencyLagDays);
    data.dependencyLagDays = Number.isFinite(n) ? Math.round(n) : 0;
  }
  // Поля редагуються миттєво у самому стейджі, але STAGE_AUTO у фінансування
  // НЕ синхронізуємо тут — це робить окремий endpoint /sync-stages-finance,
  // що викликається явно кнопкою «Зберегти у фінансування».
  for (const field of ["unit", "factUnit"] as const) {
    if (body[field] !== undefined) {
      const v = body[field];
      data[field] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
  }
  for (const field of [
    "planVolume",
    "factVolume",
    "planUnitPrice",
    "factUnitPrice",
    "planClientUnitPrice",
    "factClientUnitPrice",
  ] as const) {
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

  // STAGE_AUTO sync у фінансування винесено в окремий endpoint
  // /sync-stages-finance, що викликається кнопкою «Зберегти у фінансування».
  // Це дає користувачу контроль і дозволяє чорновики (volume/price) поза
  // фінансуванням до моменту коли він підтвердить готовність.

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

/**
 * Видалити один етап (cascade на дочірні через onDelete: Cascade на FK).
 * FinanceEntry-записи лишаються (FK SetNull) — щоб не втратити фінансову історію.
 */
export async function DELETE(
  _request: NextRequest,
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
    select: {
      id: true,
      projectId: true,
      customName: true,
      stage: true,
      parentStageId: true,
      project: { select: { firmId: true } },
    },
  });
  if (!stage || stage.projectId !== projectId) {
    return NextResponse.json({ error: "Етап не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, stage.project.firmId);
  } catch {
    return forbiddenResponse();
  }

  // Прибираємо авто-фінанси (STAGE_AUTO) етапу та його піддерева, інакше
  // осиротілі (FK SetNull) PLAN/FACT-записи й далі сумуються у Факт·Баланс
  // проєкту. MANUAL/FOREMAN_REPORT та інші реальні записи лишаються.
  const projectStages = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true, parentStageId: true },
  });
  const childrenOf = new Map<string, string[]>();
  for (const s of projectStages) {
    if (s.parentStageId) {
      const arr = childrenOf.get(s.parentStageId) ?? [];
      arr.push(s.id);
      childrenOf.set(s.parentStageId, arr);
    }
  }
  const subtree: string[] = [];
  const stack = [stageId];
  while (stack.length) {
    const id = stack.pop()!;
    subtree.push(id);
    for (const c of childrenOf.get(id) ?? []) stack.push(c);
  }
  await prisma.financeEntry.deleteMany({
    where: { stageRecordId: { in: subtree }, source: "STAGE_AUTO" },
  });

  await prisma.projectStageRecord.delete({ where: { id: stageId } });

  await recalcCurrentStage(projectId, {
    syncBudget: true,
    userId: session.user.id,
  });

  await auditLog({
    userId: session.user.id,
    action: "DELETE",
    entity: "ProjectStageRecord",
    entityId: stageId,
    projectId,
    oldData: {
      customName: stage.customName,
      stage: stage.stage,
      parentStageId: stage.parentStageId,
    },
  });

  return NextResponse.json({ success: true });
}
