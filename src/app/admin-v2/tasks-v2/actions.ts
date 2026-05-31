"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateTask, TaskError } from "@/lib/tasks/service";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Toggle task done/undone. Looks up the project's terminal status
 * (isDone=true) when marking done, and the project's first non-done
 * status when reopening. All auth/permission checks are delegated to
 * `updateTask` from src/lib/tasks/service.
 */
export async function toggleTaskDoneAction(
  taskId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        projectId: true,
        status: { select: { id: true, isDone: true } },
      },
    });
    if (!task) return { ok: false, error: "Task not found" };

    const currentlyDone = task.status?.isDone ?? false;
    const targetStatus = await prisma.taskStatus.findFirst({
      where: {
        projectId: task.projectId,
        isDone: !currentlyDone,
      },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (!targetStatus) {
      return {
        ok: false,
        error: currentlyDone
          ? "У цьому проєкті немає статусу 'у роботі'"
          : "У цьому проєкті немає статусу 'завершено'",
      };
    }

    await updateTask(taskId, { statusId: targetStatus.id }, session.user.id);
    revalidatePath("/admin-v2/tasks-v2");
    return { ok: true };
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message };
    console.error("[tasks-v2/toggleDone]", e);
    return { ok: false, error: "Внутрішня помилка" };
  }
}

const PRIORITY_CYCLE = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITY_CYCLE)[number];

/**
 * Cycle priority LOW → NORMAL → HIGH → URGENT → LOW.
 * Permission checks go through updateTask.
 */
export async function cycleTaskPriorityAction(
  taskId: string,
  currentPriority: Priority,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  const idx = PRIORITY_CYCLE.indexOf(currentPriority);
  const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];

  try {
    await updateTask(taskId, { priority: next }, session.user.id);
    revalidatePath("/admin-v2/tasks-v2");
    return { ok: true };
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message };
    console.error("[tasks-v2/cyclePriority]", e);
    return { ok: false, error: "Внутрішня помилка" };
  }
}
