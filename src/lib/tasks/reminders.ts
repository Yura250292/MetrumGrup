import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications/create";

/**
 * Розрахунок моменту нагадування.
 *  - PERCENT: процент від тривалості (createdAt → dueDate). value=70 → коли
 *    минуло 70% часу.
 *  - BEFORE_HOURS: за value годин до dueDate.
 */
export function computeFireAt(
  kind: "PERCENT" | "BEFORE_HOURS",
  value: number,
  createdAt: Date,
  dueDate: Date,
): Date {
  if (kind === "BEFORE_HOURS") {
    return new Date(dueDate.getTime() - value * 60 * 60 * 1000);
  }
  // PERCENT
  const durationMs = dueDate.getTime() - createdAt.getTime();
  const offsetMs = durationMs * (Math.min(100, Math.max(1, value)) / 100);
  return new Date(createdAt.getTime() + offsetMs);
}

/**
 * Один раз обробляє пачку прострочених (fireAt <= now) нагадувань: шле
 * notifyUsers виконавцям-Users задачі, потім ставить firedAt = now.
 * Викликається з /api/cron/tick кожні 5 хв.
 *
 * Повертає кількість успішно відправлених нагадувань.
 */
export async function fireTaskReminders(): Promise<number> {
  const now = new Date();
  const due = await prisma.taskReminder.findMany({
    where: {
      firedAt: null,
      fireAt: { lte: now },
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          projectId: true,
          dueDate: true,
          createdById: true,
          status: { select: { isDone: true } },
          assignees: {
            where: { userId: { not: null } },
            select: { userId: true },
          },
          project: { select: { title: true } },
        },
      },
    },
    take: 100,
  });

  let sent = 0;
  for (const r of due) {
    // Якщо задача вже виконана — просто закриваємо нагадування без шуму.
    if (r.task.status.isDone) {
      await prisma.taskReminder.update({
        where: { id: r.id },
        data: { firedAt: now },
      });
      continue;
    }

    const userIds = r.task.assignees
      .map((a) => a.userId)
      .filter((id): id is string => !!id);
    if (userIds.length === 0) {
      // Нема кого нотифікувати — закриваємо щоб не циклитись.
      await prisma.taskReminder.update({
        where: { id: r.id },
        data: { firedAt: now },
      });
      continue;
    }

    const dueLabel = r.task.dueDate
      ? new Date(r.task.dueDate).toLocaleDateString("uk-UA", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : null;
    try {
      await notifyUsers({
        userIds,
        // Системне нагадування — actor = автор задачі (для аудиту/UI).
        actorId: r.task.createdById,
        type: "TASK_DUE_SOON",
        title: `Нагадування: «${r.task.title}»`,
        body: dueLabel
          ? `Дедлайн ${dueLabel}. Проєкт: ${r.task.project?.title ?? "—"}`
          : `Проєкт: ${r.task.project?.title ?? "—"}`,
        relatedEntity: "Task",
        relatedId: `${r.task.projectId}:${r.task.id}`,
      });
    } catch (err) {
      console.error("[task-reminders] notify failed:", err);
    }

    await prisma.taskReminder.update({
      where: { id: r.id },
      data: { firedAt: now },
    });
    sent++;
  }

  return sent;
}
