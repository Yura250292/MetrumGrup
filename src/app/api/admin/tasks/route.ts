import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  addChecklistItem,
  createTask,
  TaskError,
  type AssigneeInput,
} from "@/lib/tasks/service";
import { getOrCreatePersonalInbox } from "@/lib/tasks/personal-inbox";
import { computeFireAt } from "@/lib/tasks/reminders";

/**
 * Створення задачі БЕЗ обовʼязкового проєкту в URL.
 *
 * Required body: `title`, `description`, `dueDate` (ISO).
 * Optional: `projectId` (інакше Personal Inbox), `stageId` (інакше default
 * проєкту), `priority`, `estimatedHours`, `assignees`, `checklist`.
 *
 * `assignees` — масив `{userId}` АБО `{externalName}` (зовнішній виконавець,
 * не User). Внутрішні UserId перевіряються на доступ до проєкту, зовнішні —
 * trim+truncate до 100 символів.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const dueDateRaw = body.dueDate ? String(body.dueDate) : "";

  if (!title) {
    return NextResponse.json({ error: "Назва обовʼязкова" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json(
      { error: "Короткий опис обовʼязковий" },
      { status: 400 },
    );
  }
  if (!dueDateRaw) {
    return NextResponse.json(
      { error: "Дедлайн обовʼязковий" },
      { status: 400 },
    );
  }
  const dueDate = new Date(dueDateRaw);
  if (isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "Невалідна дата" }, { status: 400 });
  }

  // Resolve project + stage.
  let projectId = body.projectId ? String(body.projectId) : "";
  let stageId = body.stageId ? String(body.stageId) : "";
  if (!projectId) {
    const inbox = await getOrCreatePersonalInbox(session.user.id);
    projectId = inbox.projectId;
    stageId = inbox.defaultStageId;
  } else if (!stageId) {
    // Fallback: дефолтна (перша top-level) стадія цього проєкту.
    const stage = await prisma.projectStageRecord.findFirst({
      where: { projectId, parentStageId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (!stage) {
      return NextResponse.json(
        { error: "У проєкті немає жодної стадії — створіть її спочатку" },
        { status: 400 },
      );
    }
    stageId = stage.id;
  }

  const priorityRaw = body.priority as string | undefined;
  const priority =
    priorityRaw === "LOW" ||
    priorityRaw === "NORMAL" ||
    priorityRaw === "HIGH" ||
    priorityRaw === "URGENT"
      ? priorityRaw
      : undefined;

  const assignees: AssigneeInput[] = Array.isArray(body.assignees)
    ? (body.assignees as unknown[]).flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const o = raw as Record<string, unknown>;
        if (o.userId) return [{ userId: String(o.userId) } as AssigneeInput];
        if (o.externalName) {
          return [{ externalName: String(o.externalName) } as AssigneeInput];
        }
        return [];
      })
    : [];

  try {
    const task = await createTask(
      {
        projectId,
        stageId,
        title,
        description,
        priority,
        dueDate,
        estimatedHours:
          body.estimatedHours === null || body.estimatedHours === undefined
            ? undefined
            : Number(body.estimatedHours),
        assignees: assignees.length > 0 ? assignees : undefined,
      },
      session.user.id,
    );

    if (Array.isArray(body.checklist) && body.checklist.length > 0) {
      for (const raw of body.checklist as unknown[]) {
        const content = String(raw).trim();
        if (!content) continue;
        try {
          await addChecklistItem(
            task.id,
            { content: content.slice(0, 500) },
            session.user.id,
          );
        } catch (err) {
          console.error("[tasks POST] checklist item failed:", err);
        }
      }
    }

    // Reminder — опційний. Якщо передано — створимо TaskReminder з обчисленим
    // fireAt. Cron-tick підбере його коли наступить час.
    if (body.reminder && typeof body.reminder === "object") {
      const r = body.reminder as { kind?: string; value?: number };
      if (
        (r.kind === "PERCENT" || r.kind === "BEFORE_HOURS") &&
        typeof r.value === "number" &&
        r.value > 0
      ) {
        try {
          const { prisma } = await import("@/lib/prisma");
          const created = await prisma.task.findUnique({
            where: { id: task.id },
            select: { createdAt: true, dueDate: true },
          });
          if (created?.dueDate) {
            const fireAt = computeFireAt(
              r.kind,
              r.value,
              created.createdAt,
              created.dueDate,
            );
            // Якщо момент уже в минулому (наприклад дедлайн через 30 хв,
            // а юзер вибрав «за 1 годину») — пропускаємо тихо.
            if (fireAt.getTime() > Date.now()) {
              await prisma.taskReminder.create({
                data: {
                  taskId: task.id,
                  kind: r.kind,
                  value: r.value,
                  fireAt,
                },
              });
            }
          }
        } catch (err) {
          console.error("[tasks POST] reminder create failed:", err);
        }
      }
    }

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
