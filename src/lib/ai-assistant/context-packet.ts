import { prisma } from "@/lib/prisma";

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
};

/**
 * Build a compact context packet based on the current page URL.
 * Injected into the system prompt so AI knows the working context.
 */
export async function buildContextPacket(
  pathname: string,
  userId: string,
): Promise<ContextPacket | null> {
  // Extract projectId from URL: /admin-v2/projects/[id]
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  if (!projectMatch) return null;

  const projectId = projectMatch[1];
  // Skip non-CUID ids (like "new")
  if (projectId.length < 10) return null;

  const now = new Date();

  const [project, openTasks, overdueTasks, overduePayments] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        title: true,
        status: true,
        currentStage: true,
        stageProgress: true,
        totalBudget: true,
        totalPaid: true,
      },
    }),
    prisma.task.count({ where: { projectId, isArchived: false } }),
    prisma.task.count({ where: { projectId, isArchived: false, dueDate: { lt: now } } }),
    prisma.payment.count({
      where: { projectId, status: { in: ["PENDING", "PARTIAL"] }, scheduledDate: { lt: now } },
    }),
  ]);

  if (!project) return null;

  return {
    page: pathname.includes("/financing") ? "financing"
      : pathname.includes("/tasks") || pathname.includes("/me") ? "tasks"
      : pathname.includes("/estimates") ? "estimates"
      : "project",
    projectId,
    projectTitle: project.title,
    projectStatus: project.status,
    currentStage: project.currentStage ?? undefined,
    stageProgress: project.stageProgress ?? undefined,
    budget: Number(project.totalBudget),
    paid: Number(project.totalPaid),
    openTasks,
    overdueTasks,
    overduePayments,
  };
}

export function contextPacketToPrompt(ctx: ContextPacket): string {
  const lines = [`Сторінка: ${ctx.page}`];
  if (ctx.projectTitle) lines.push(`Проєкт: ${ctx.projectTitle} (${ctx.projectStatus})`);
  if (ctx.currentStage) lines.push(`Етап: ${ctx.currentStage} (${ctx.stageProgress ?? 0}%)`);
  if (ctx.budget) lines.push(`Бюджет: ${ctx.budget.toLocaleString("uk-UA")} ₴, сплачено: ${(ctx.paid ?? 0).toLocaleString("uk-UA")} ₴`);
  if (ctx.openTasks !== undefined) lines.push(`Відкриті завдання: ${ctx.openTasks}, прострочені: ${ctx.overdueTasks ?? 0}`);
  if (ctx.overduePayments) lines.push(`Прострочені платежі: ${ctx.overduePayments}`);
  return lines.join("\n");
}
