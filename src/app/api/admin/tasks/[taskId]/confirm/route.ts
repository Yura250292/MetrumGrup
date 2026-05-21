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
 * Автор підтверджує що задача виконана коректно — статус → «Закрито».
 * Дозволено лише автору (creator) і адміну.
 * Поточний статус має бути «Вирішено» або «В роботі».
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
      { error: "Закрити може лише автор задачі або адмін" },
      { status: 403 },
    );
  }
  if (task.status.name === "Закрито") {
    return NextResponse.json({ error: "Задача вже закрита" }, { status: 400 });
  }

  const target = await getStatusByName(task.projectId, "Закрито");
  if (!target) {
    return NextResponse.json(
      { error: "Статусу «Закрито» не існує" },
      { status: 500 },
    );
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { statusId: target.id, completedAt: new Date() },
  });

  await notifyStatusChange({
    task,
    actorId: userId,
    newStatusName: "Закрито",
  });

  return NextResponse.json({ ok: true });
}
