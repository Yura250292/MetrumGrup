import { prisma } from "@/lib/prisma";
import { PLATFORM_STATE, detectMetaTask } from "./platform-state";

export type ContextPacket = {
  page: string;
  projectId?: string;
  projectTitle?: string;
  projectStatus?: string;
  currentStage?: string;
  stageProgress?: number;
  budget?: number;
  paid?: number;
  openTasks?: number;
  overdueTasks?: number;
  overduePayments?: number;

  // Task-scoped fields (when invoked from task drawer)
  taskId?: string;
  taskTitle?: string;
  taskStatus?: string;
  taskStage?: string;
  taskPriority?: string;
  relatedOpenTasks?: number;
  relatedDoneTasks?: number;

  // Meta-task: this task is about developing the Metrum platform itself
  isMetaTask?: boolean;
  metaModules?: string[];
};

export type ContextPacketInput = {
  pathname?: string;
  projectId?: string;
  taskId?: string;
};

/**
 * Build a compact context packet based on the current page URL or an explicit
 * project/task id. Injected into the system prompt so AI knows the working context.
 */
export async function buildContextPacket(
  input: ContextPacketInput | string,
  userId: string,
): Promise<ContextPacket | null> {
  // Back-compat: old call signature was buildContextPacket(pathname, userId)
  const opts: ContextPacketInput =
    typeof input === "string" ? { pathname: input } : input;

  // Resolve projectId from explicit arg or pathname
  let projectId = opts.projectId;
  if (!projectId && opts.pathname) {
    const m = opts.pathname.match(/\/projects\/([^/]+)/);
    if (m && m[1].length >= 10) projectId = m[1];
  }

  let taskInfo: {
    id: string;
    title: string;
    status: string;
    stage?: string;
    priority: string;
    projectId: string;
  } | null = null;

  if (opts.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: opts.taskId },
      select: {
        id: true,
        title: true,
        priority: true,
        projectId: true,
        status: { select: { name: true } },
        stage: { select: { stage: true } },
      },
    });
    if (task) {
      taskInfo = {
        id: task.id,
        title: task.title,
        status: task.status.name,
        stage: task.stage?.stage ?? undefined,
        priority: task.priority,
        projectId: task.projectId,
      };
      if (!projectId) projectId = task.projectId;
    }
  }

  if (!projectId && !taskInfo && !opts.pathname) return null;

  const now = new Date();
  const project = projectId
    ? await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          title: true,
          status: true,
          currentStage: true,
          stageProgress: true,
          totalBudget: true,
          totalPaid: true,
        },
      })
    : null;

  let openTasks: number | undefined;
  let overdueTasks: number | undefined;
  let overduePayments: number | undefined;
  if (projectId) {
    [openTasks, overdueTasks, overduePayments] = await Promise.all([
      prisma.task.count({ where: { projectId, isArchived: false } }),
      prisma.task.count({
        where: { projectId, isArchived: false, dueDate: { lt: now } },
      }),
      prisma.payment.count({
        where: {
          projectId,
          status: { in: ["PENDING", "PARTIAL"] },
          scheduledDate: { lt: now },
        },
      }),
    ]);
  }

  // Sibling tasks for task context (excluding the current task)
  let relatedOpenTasks: number | undefined;
  let relatedDoneTasks: number | undefined;
  if (taskInfo) {
    const [openCount, doneCount] = await Promise.all([
      prisma.task.count({
        where: {
          projectId: taskInfo.projectId,
          isArchived: false,
          id: { not: taskInfo.id },
          completedAt: null,
        },
      }),
      prisma.task.count({
        where: {
          projectId: taskInfo.projectId,
          isArchived: false,
          id: { not: taskInfo.id },
          completedAt: { not: null },
        },
      }),
    ]);
    relatedOpenTasks = openCount;
    relatedDoneTasks = doneCount;
  }

  const meta = detectMetaTask({
    taskTitle: taskInfo?.title,
    projectTitle: project?.title,
    pathname: opts.pathname,
  });

  const page = (() => {
    if (taskInfo) return "task";
    if (!opts.pathname) return project ? "project" : "unknown";
    if (opts.pathname.includes("/financing")) return "financing";
    if (opts.pathname.includes("/me") || opts.pathname.includes("/tasks")) return "tasks";
    if (opts.pathname.includes("/estimates")) return "estimates";
    return "project";
  })();

  return {
    page,
    projectId: projectId ?? undefined,
    projectTitle: project?.title,
    projectStatus: project?.status,
    currentStage: project?.currentStage ?? undefined,
    stageProgress: project?.stageProgress ?? undefined,
    budget: project ? Number(project.totalBudget) : undefined,
    paid: project ? Number(project.totalPaid) : undefined,
    openTasks,
    overdueTasks,
    overduePayments,
    taskId: taskInfo?.id,
    taskTitle: taskInfo?.title,
    taskStatus: taskInfo?.status,
    taskStage: taskInfo?.stage,
    taskPriority: taskInfo?.priority,
    relatedOpenTasks,
    relatedDoneTasks,
    isMetaTask: meta.isMeta,
    metaModules: meta.modules,
  };
}

export function contextPacketToPrompt(ctx: ContextPacket): string {
  const lines = [`Сторінка: ${ctx.page}`];
  if (ctx.projectTitle) lines.push(`Проєкт: ${ctx.projectTitle} (${ctx.projectStatus})`);
  if (ctx.currentStage)
    lines.push(`Етап проєкту: ${ctx.currentStage} (${ctx.stageProgress ?? 0}%)`);
  if (ctx.budget)
    lines.push(
      `Бюджет: ${ctx.budget.toLocaleString("uk-UA")} ₴, сплачено: ${(ctx.paid ?? 0).toLocaleString("uk-UA")} ₴`,
    );
  if (ctx.openTasks !== undefined)
    lines.push(
      `Відкриті завдання проєкту: ${ctx.openTasks}, прострочені: ${ctx.overdueTasks ?? 0}`,
    );
  if (ctx.overduePayments) lines.push(`Прострочені платежі: ${ctx.overduePayments}`);

  if (ctx.taskTitle) {
    lines.push("");
    lines.push(`### Поточна задача`);
    lines.push(`Назва: ${ctx.taskTitle}`);
    lines.push(`Статус: ${ctx.taskStatus} (пріоритет ${ctx.taskPriority})`);
    if (ctx.taskStage) lines.push(`Етап: ${ctx.taskStage}`);
    if (ctx.relatedOpenTasks !== undefined)
      lines.push(
        `Сусідні задачі цього проєкту: ${ctx.relatedOpenTasks} відкриті, ${ctx.relatedDoneTasks ?? 0} закриті — використай tool get_task_list з projectId щоб побачити деталі.`,
      );
  }

  if (ctx.isMetaTask) {
    lines.push("");
    lines.push("### ⚠️ META-ЗАДАЧА: розробка самої платформи Metrum");
    lines.push(
      "Ця задача стосується доробки CRM/адмінки самої платформи на якій ти живеш. НЕ давай generic поради для зовнішнього клієнта — використовуй знання поточного стану модулів нижче і пропонуй конкретні кроки під реальний стан коду.",
    );
    if (ctx.metaModules?.length) {
      lines.push(`Згадані модулі: ${ctx.metaModules.join(", ")}`);
    }
    lines.push("");
    lines.push("### СТАН МОДУЛІВ ПЛАТФОРМИ (feature inventory)");
    lines.push(PLATFORM_STATE);
  }

  return lines.join("\n");
}
