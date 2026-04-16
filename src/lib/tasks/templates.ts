import { prisma } from "@/lib/prisma";

/**
 * Task templates — reusable task blueprints with optional subtasks + checklist.
 *
 * dataJson shape (TaskTemplate):
 * {
 *   title: string,
 *   description?: string,
 *   priority?: "LOW"|"NORMAL"|"HIGH"|"URGENT",
 *   estimatedHours?: number,
 *   checklist?: { content: string }[],
 *   subtasks?: { title: string; description?: string; checklist?: {content: string}[] }[]
 * }
 *
 * dataJson shape (ProjectTemplate): tasks grouped by stage
 * {
 *   stages: { stage: ProjectStage, tasks: TaskTemplateData[] }[]
 * }
 */

export type TaskTemplateData = {
  title: string;
  description?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  estimatedHours?: number;
  labels?: string[];
  checklist?: { content: string }[];
  subtasks?: TaskTemplateData[];
};

type TemplateContext = {
  projectId: string;
  stageId: string;
  statusId: string;
  createdById: string;
};

export async function applyTaskTemplate(
  templateId: string,
  ctx: TemplateContext,
  parentTaskId: string | null = null,
): Promise<string> {
  const tpl = await prisma.taskTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new Error("Template not found");
  const data = tpl.dataJson as unknown as TaskTemplateData;
  return spawnFromData(data, ctx, parentTaskId);
}

async function spawnFromData(
  data: TaskTemplateData,
  ctx: TemplateContext,
  parentTaskId: string | null,
): Promise<string> {
  const lastPos = await prisma.task.aggregate({
    where: { projectId: ctx.projectId, statusId: ctx.statusId, parentTaskId },
    _max: { position: true },
  });

  const created = await prisma.task.create({
    data: {
      projectId: ctx.projectId,
      stageId: ctx.stageId,
      statusId: ctx.statusId,
      parentTaskId,
      title: data.title,
      description: data.description ?? null,
      priority: data.priority ?? "NORMAL",
      estimatedHours: data.estimatedHours ?? null,
      position: (lastPos._max.position ?? -1) + 1,
      createdById: ctx.createdById,
    },
  });

  // Checklist
  if (Array.isArray(data.checklist) && data.checklist.length > 0) {
    await prisma.checklistItem.createMany({
      data: data.checklist.map((c, i) => ({
        taskId: created.id,
        content: c.content,
        position: i,
      })),
    });
  }

  // Labels by name — only attach labels that already exist in the project
  if (Array.isArray(data.labels) && data.labels.length > 0) {
    const labels = await prisma.taskLabel.findMany({
      where: { projectId: ctx.projectId, name: { in: data.labels } },
      select: { id: true },
    });
    if (labels.length > 0) {
      await prisma.taskLabelAssignment.createMany({
        data: labels.map((l) => ({ taskId: created.id, labelId: l.id })),
        skipDuplicates: true,
      });
    }
  }

  // Subtasks (recursive)
  if (Array.isArray(data.subtasks) && data.subtasks.length > 0) {
    for (const sub of data.subtasks) {
      await spawnFromData(sub, ctx, created.id);
    }
  }

  return created.id;
}

export async function convertTaskToTemplate(
  taskId: string,
  opts: { name: string; projectScoped: boolean; createdById: string },
): Promise<string> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      checklist: { orderBy: { position: "asc" } },
      labels: { include: { label: { select: { name: true } } } },
      subtasks: {
        include: {
          checklist: { orderBy: { position: "asc" } },
          labels: { include: { label: { select: { name: true } } } },
        },
      },
    },
  });
  if (!task) throw new Error("Task not found");

  const data: TaskTemplateData = {
    title: task.title,
    description: task.description ?? undefined,
    priority: task.priority,
    estimatedHours: task.estimatedHours ? Number(task.estimatedHours) : undefined,
    labels: task.labels.map((l) => l.label.name),
    checklist: task.checklist.map((c) => ({ content: c.content })),
    subtasks: task.subtasks.map((s) => ({
      title: s.title,
      description: s.description ?? undefined,
      priority: s.priority,
      estimatedHours: s.estimatedHours ? Number(s.estimatedHours) : undefined,
      labels: s.labels.map((l) => l.label.name),
      checklist: s.checklist.map((c) => ({ content: c.content })),
    })),
  };

  const created = await prisma.taskTemplate.create({
    data: {
      name: opts.name,
      projectId: opts.projectScoped ? task.projectId : null,
      dataJson: data as unknown as object,
      createdById: opts.createdById,
    },
  });
  return created.id;
}
