import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

/**
 * POST /api/admin/projects/[id]/baseline/clear
 *
 * Розморожує baseline (baselineFrozenAt = null), planned* дати лишаються.
 * Після цього їх можна редагувати через PUT /tasks/:id/dates без rebaseline.
 * Тільки PM/SUPER_ADMIN (canManageTaskConfig).
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

  const result = await prisma.task.updateMany({
    where: { projectId, isArchived: false, baselineFrozenAt: { not: null } },
    data: { baselineFrozenAt: null },
  });

  return NextResponse.json({ data: { tasksCleared: result.count } });
}
