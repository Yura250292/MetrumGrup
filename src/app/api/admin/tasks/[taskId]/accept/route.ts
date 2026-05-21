import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications/create";

/**
 * Виконавець «приймає» задачу: статус «Новий» → «В роботі».
 * Дозволено лише якщо юзер є серед `assignees` І поточний статус — «Новий».
 * Після успіху — нотифікуємо постановника (`createdById`), що задача прийнята.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      projectId: true,
      createdById: true,
      status: { select: { id: true, name: true } },
      assignees: {
        where: { userId: session.user.id },
        select: { userId: true },
      },
      project: { select: { title: true } },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });
  }
  if (task.assignees.length === 0) {
    return NextResponse.json(
      { error: "Тільки виконавець може прийняти задачу" },
      { status: 403 },
    );
  }
  if (task.status.name !== "Новий") {
    return NextResponse.json(
      { error: `Задача вже у статусі «${task.status.name}»` },
      { status: 400 },
    );
  }

  const inProgress = await prisma.taskStatus.findFirst({
    where: { projectId: task.projectId, name: "В роботі" },
  });
  if (!inProgress) {
    return NextResponse.json(
      { error: "Статусу «В роботі» не існує у цьому проєкті" },
      { status: 500 },
    );
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { statusId: inProgress.id },
  });

  // Notify creator (асинхронно, не блокуємо відповідь).
  if (task.createdById && task.createdById !== session.user.id) {
    try {
      await notifyUsers({
        userIds: [task.createdById],
        actorId: session.user.id,
        type: "TASK_STATUS_CHANGED",
        title: `Задачу прийнято: «${task.title}»`,
        body: task.project?.title
          ? `Проєкт: ${task.project.title} · статус → В роботі`
          : "Виконавець підтвердив що бере задачу.",
        relatedEntity: "Task",
        relatedId: `${task.projectId}:${task.id}`,
      });
    } catch (err) {
      console.error("[tasks/accept] notify creator failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
