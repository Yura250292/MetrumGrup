import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

/**
 * POST /api/admin/projects/[id]/baseline/freeze
 *
 * Копіює актуальні дати у planned* і ставить baselineFrozenAt = now() для
 * усіх неархівованих задач проєкту. Тільки PM/SUPER_ADMIN (canManageTaskConfig).
 *
 * Існуючі planned* НЕ перезаписуються (idempotent у разі повторного freeze
 * — не зрушуємо вже зафіксований baseline).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }

  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canManageTaskConfig)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();

  // 1) Copy startDate→plannedStartAt where plannedStartAt IS NULL.
  await prisma.$executeRawUnsafe(
    `UPDATE tasks
     SET "plannedStartAt" = "startDate"
     WHERE "projectId" = $1
       AND "isArchived" = false
       AND "plannedStartAt" IS NULL
       AND "startDate" IS NOT NULL`,
    projectId,
  );
  // 2) Copy dueDate→plannedEndAt where plannedEndAt IS NULL.
  await prisma.$executeRawUnsafe(
    `UPDATE tasks
     SET "plannedEndAt" = "dueDate"
     WHERE "projectId" = $1
       AND "isArchived" = false
       AND "plannedEndAt" IS NULL
       AND "dueDate" IS NOT NULL`,
    projectId,
  );
  // 3) Mark baselineFrozenAt for all unfrozen tasks у цьому проєкті.
  const result = await prisma.task.updateMany({
    where: { projectId, isArchived: false, baselineFrozenAt: null },
    data: { baselineFrozenAt: now },
  });

  return NextResponse.json({
    data: { frozenAt: now.toISOString(), tasksFrozen: result.count },
  });
}
