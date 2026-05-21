import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications/create";

/**
 * Спільні константи + helpers для status-transition endpoints
 * (resolve / confirm / reject). Винесено окремо щоб не дублювати
 * лог нотифікацій і lookup статусів.
 */

export async function getStatusByName(projectId: string, name: string) {
  return prisma.taskStatus.findFirst({
    where: { projectId, name },
  });
}

export async function loadTaskForTransition(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      projectId: true,
      createdById: true,
      status: { select: { id: true, name: true } },
      assignees: { select: { userId: true } },
      project: { select: { title: true } },
    },
  });
}

export function isAssignee(
  task: { assignees: { userId: string | null }[] },
  userId: string,
): boolean {
  return task.assignees.some((a) => a.userId === userId);
}

export function isAuthor(
  task: { createdById: string },
  userId: string,
): boolean {
  return task.createdById === userId;
}

/** Адмін має повний доступ до transition. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Нотифікація про зміну статусу (in-app + push + Telegram + email).
 * Шлемо ВСІМ учасникам (creator + assignees), крім самого actor.
 */
export async function notifyStatusChange(opts: {
  task: {
    id: string;
    title: string;
    projectId: string;
    createdById: string;
    assignees: { userId: string | null }[];
    project: { title: string } | null;
  };
  actorId: string;
  newStatusName: string;
}): Promise<void> {
  const targetIds = new Set<string>([opts.task.createdById]);
  for (const a of opts.task.assignees) {
    if (a.userId) targetIds.add(a.userId);
  }
  targetIds.delete(opts.actorId); // actor себе нотифікує не треба

  if (targetIds.size === 0) return;

  try {
    await notifyUsers({
      userIds: [...targetIds],
      actorId: opts.actorId,
      type: "TASK_STATUS_CHANGED",
      title: `Статус задачі «${opts.task.title}» → ${opts.newStatusName}`,
      body: opts.task.project?.title
        ? `Проєкт: ${opts.task.project.title}`
        : undefined,
      relatedEntity: "Task",
      relatedId: `${opts.task.projectId}:${opts.task.id}`,
    });
  } catch (err) {
    console.error("[task-transition] notify failed:", err);
  }
}
