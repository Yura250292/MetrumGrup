import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  getStatusByName,
  isAdminRole,
  isAuthor,
  loadTaskForTransition,
  notifyStatusChange,
} from "@/lib/tasks/transitions";

/**
 * Автор повертає задачу на доопрацювання («Вирішено» → «В роботі»). Шле
 * нотифікацію виконавцям. Дозволено лише автору і адміну.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { taskId } = await params;

  const task = await loadTaskForTransition(taskId);
  if (!task) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const userId = session.user.id;
  if (!isAdminRole(session.user.role) && !isAuthor(task, userId)) {
    return NextResponse.json(
      { error: "Повернути на доопрацювання може лише автор або адмін" },
      { status: 403 },
    );
  }
  if (task.status.name !== "Вирішено") {
    return NextResponse.json(
      { error: `Доступно лише зі статусу «Вирішено» (зараз: ${task.status.name})` },
      { status: 400 },
    );
  }

  const target = await getStatusByName(task.projectId, "В роботі");
  if (!target) {
    return NextResponse.json(
      { error: "Статусу «В роботі» не існує" },
      { status: 500 },
    );
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { statusId: target.id, completedAt: null },
  });

  await notifyStatusChange({
    task,
    actorId: userId,
    newStatusName: "Повернуто на доопрацювання",
  });

  return NextResponse.json({ ok: true });
}
