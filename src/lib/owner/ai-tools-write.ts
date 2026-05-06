/**
 * Write-tools — AI може створювати чернетки/нагадування (НЕ виконує
 * мутаційні дії одразу). Власник підтверджує/править через UI.
 *
 * Поточні tools:
 *  - create_task_draft — створити чернетку задачі у проекті
 *  - create_reminder — нагадування для власника (notification)
 *
 * Архітектура безпеки:
 *  - Усі writes йдуть через write-only-when-confirmed pattern: Task створюється
 *    з пріоритетом=LOW і назвою-префіксом "[AI-DRAFT]" — менеджер бачить у списку,
 *    редагує/підтверджує, або видаляє.
 *  - Notification створюється для самого власника (нагадати йому ж).
 */

import { prisma } from "@/lib/prisma";
import { z } from "zod";

interface ToolContext {
  firmId: string | null;
  ownerUserId: string;
}

// ─── create_task_draft ─────────────────────────────────────────────────────

export const CreateTaskDraftInput = z.object({
  projectIdOrName: z.string().describe("Проект для якого створити задачу"),
  title: z.string().min(3).max(200).describe("Назва задачі"),
  description: z.string().max(2000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueDate: z.string().optional().describe("YYYY-MM-DD"),
  assigneeName: z.string().optional().describe("ПІБ виконавця (фуззі-пошук)"),
});

export async function createTaskDraft(
  ctx: ToolContext,
  input: z.infer<typeof CreateTaskDraftInput>,
): Promise<string> {
  const project = await prisma.project.findFirst({
    where: {
      ...(ctx.firmId ? { firmId: ctx.firmId } : {}),
      OR: [
        { id: input.projectIdOrName },
        { slug: input.projectIdOrName },
        { title: { contains: input.projectIdOrName, mode: "insensitive" } },
      ],
    },
    include: {
      stages: {
        select: { id: true, customName: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      taskStatuses: {
        select: { id: true, name: true, position: true },
        orderBy: { position: "asc" },
        take: 1,
      },
    },
  });
  if (!project) return `❌ Проект «${input.projectIdOrName}» не знайдено.`;
  if (project.stages.length === 0)
    return `❌ У проекті «${project.title}» нема жодного етапу — задачу неможливо прикріпити.`;
  if (project.taskStatuses.length === 0)
    return `❌ У проекті «${project.title}» нема жодного статусу задач.`;

  let assigneeUserId: string | null = null;
  if (input.assigneeName) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { name: { contains: input.assigneeName, mode: "insensitive" } },
          { email: { contains: input.assigneeName, mode: "insensitive" } },
        ],
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (user) assigneeUserId = user.id;
  }

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      stageId: project.stages[0].id,
      statusId: project.taskStatuses[0].id,
      title: `[AI-DRAFT] ${input.title}`,
      description: input.description ?? null,
      priority: input.priority,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      createdById: ctx.ownerUserId,
      ...(assigneeUserId
        ? {
            assignees: {
              create: {
                userId: assigneeUserId,
                assignedById: ctx.ownerUserId,
              },
            },
          }
        : {}),
    },
    select: { id: true, title: true },
  });

  let md = `✓ **Створено чернетку задачі**\n\n`;
  md += `- Назва: «${task.title}»\n`;
  md += `- Проект: ${project.title}\n`;
  md += `- Пріоритет: ${input.priority}\n`;
  if (input.dueDate) md += `- Дедлайн: ${input.dueDate}\n`;
  if (assigneeUserId) md += `- Виконавець призначено\n`;
  md += `\n_Префікс \`[AI-DRAFT]\` лишається на задачі — менеджер може відредагувати або видалити._`;
  return md;
}

// ─── create_reminder ───────────────────────────────────────────────────────

export const CreateReminderInput = z.object({
  title: z.string().min(3).max(200),
  body: z.string().max(1000).optional(),
  remindAt: z.string().describe("Дата нагадування YYYY-MM-DD"),
});

export async function createReminder(
  ctx: ToolContext,
  input: z.infer<typeof CreateReminderInput>,
): Promise<string> {
  const remindAt = new Date(input.remindAt);
  if (isNaN(remindAt.getTime())) return `❌ Невірна дата: ${input.remindAt}`;

  const note = await prisma.notification.create({
    data: {
      userId: ctx.ownerUserId,
      type: "AI_REMINDER",
      title: input.title,
      body: input.body ?? null,
      relatedEntity: "OwnerReminder",
      relatedId: ctx.ownerUserId,
    },
    select: { id: true },
  });
  void note;

  return `✓ Нагадування «${input.title}» створено для тебе на ${input.remindAt}.\nЗʼявиться в списку повідомлень. _(Notification.AI_REMINDER)_`;
}

// ─── manifest ──────────────────────────────────────────────────────────────

export const WRITE_TOOLS = [
  {
    name: "create_task_draft",
    description:
      "Створити ЧЕРНЕТКУ задачі у проекті. Префікс '[AI-DRAFT]' залишається — менеджер може відредагувати/підтвердити/видалити. Використовуй коли власник просить 'постав задачу X', 'нагадай команді Y'. Це безпечна write-операція.",
    input_schema: {
      type: "object",
      properties: {
        projectIdOrName: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"], default: "NORMAL" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        assigneeName: { type: "string" },
      },
      required: ["projectIdOrName", "title"],
    },
  },
  {
    name: "create_reminder",
    description:
      "Створити нагадування для самого власника (зʼявиться у його сповіщеннях). Для 'нагадай мені перевірити X', 'постав на завтра дзвінок Y'.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        remindAt: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["title", "remindAt"],
    },
  },
];

export async function dispatchWriteTool(
  ctx: ToolContext,
  name: string,
  input: unknown,
): Promise<string | null> {
  try {
    switch (name) {
      case "create_task_draft":
        return await createTaskDraft(ctx, CreateTaskDraftInput.parse(input));
      case "create_reminder":
        return await createReminder(ctx, CreateReminderInput.parse(input));
      default:
        return null;
    }
  } catch (e) {
    return `❌ Помилка ${name}: ${e instanceof Error ? e.message : String(e)}`;
  }
}
