import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  getStatusByName,
  isAdminRole,
  isAssignee,
  isAuthor,
  loadTaskForTransition,
  notifyStatusChange,
} from "@/lib/tasks/transitions";

/**
 * Виконавець (assignee) маркує задачу як «Вирішено» — готову до перевірки
 * автором. Дозволено assignee, author, admin. Поточний статус має бути
 * «Новий» або «В роботі».
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
  const allowed =
    isAdminRole(session.user.role) ||
    isAssignee(task, userId) ||
    isAuthor(task, userId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (task.status.name === "Вирішено" || task.status.name === "Закрито") {
    return NextResponse.json(
      { error: `Задача уже у статусі «${task.status.name}»` },
      { status: 400 },
    );
  }

  const target = await getStatusByName(task.projectId, "Вирішено");
  if (!target) {
    return NextResponse.json(
      { error: "Статусу «Вирішено» не існує. Запустіть міграцію." },
      { status: 500 },
    );
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { statusId: target.id },
  });

  await notifyStatusChange({
    task,
    actorId: userId,
    newStatusName: "Вирішено",
  });

  return NextResponse.json({ ok: true });
}
