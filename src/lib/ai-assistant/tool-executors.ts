import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { scopeByClient } from "@/lib/auth-utils";
import { timeReport } from "@/lib/time/reports";
import type { Role } from "@prisma/client";
import type { AiToolName, AiUserContext } from "./types";

type ToolInput = Record<string, unknown>;

export async function executeTool(
  toolName: AiToolName,
  input: ToolInput,
  ctx: AiUserContext,
): Promise<string> {
  try {
    const result = await executeToolInner(toolName, input, ctx);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Невідома помилка";
    return JSON.stringify({ error: msg });
  }
}

async function executeToolInner(
  toolName: AiToolName,
  input: ToolInput,
  ctx: AiUserContext,
): Promise<unknown> {
  switch (toolName) {
    case "list_projects":
      return listProjects(input, ctx);
    case "get_project_summary":
      return getProjectSummary(input, ctx);
    case "get_project_financials":
      return getProjectFinancials(input, ctx);
    case "get_task_list":
      return getTaskList(input, ctx);
    case "get_my_tasks":
      return getMyTasks(input, ctx);
    case "get_team_workload":
      return getTeamWorkload(input, ctx);
    case "get_estimate_summary":
      return getEstimateSummary(input, ctx);
    case "get_payment_status":
      return getPaymentStatus(input, ctx);
    case "get_stage_progress":
      return getStageProgress(input, ctx);
    case "get_dashboard_kpis":
      return getDashboardKpis(ctx);
    case "compare_projects":
      return compareProjects(input, ctx);
    case "get_overdue_items":
      return getOverdueItems(input, ctx);
    default:
      return { error: `Невідомий інструмент: ${toolName}` };
  }
}

// ── Helpers ──────────────────────────────────────────────────

function requireAdmin(role: Role) {
  if (!["SUPER_ADMIN", "MANAGER", "FINANCIER"].includes(role)) {
    throw new Error("Недостатньо прав для цієї операції");
  }
}

async function requireProjectAccess(projectId: string, userId: string) {
  const access = await getProjectAccessContext(projectId, userId);
  if (!access || !access.canView) {
    throw new Error("Немає доступу до цього проєкту");
  }
  return access;
}

// ── Tool Implementations ─────────────────────────────────────

async function listProjects(input: ToolInput, ctx: AiUserContext) {
  const status = input.status as string | undefined;
  const limit = Math.min((input.limit as number) || 20, 50);

  const scope = scopeByClient({ user: { id: ctx.userId, role: ctx.role } });
  const where = { ...scope, ...(status ? { status: status as never } : {}) };

  const projects = await prisma.project.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      currentStage: true,
      stageProgress: true,
      totalBudget: true,
      totalPaid: true,
      startDate: true,
      expectedEndDate: true,
      address: true,
      client: { select: { name: true } },
      manager: { select: { name: true } },
      _count: { select: { tasks: true, estimates: true } },
    },
  });

  return {
    count: projects.length,
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      stage: p.currentStage,
      stageProgress: p.stageProgress,
      budget: Number(p.totalBudget),
      paid: Number(p.totalPaid),
      address: p.address,
      startDate: p.startDate?.toISOString().split("T")[0],
      expectedEndDate: p.expectedEndDate?.toISOString().split("T")[0],
      client: p.client?.name,
      manager: p.manager?.name,
      tasksCount: p._count.tasks,
      estimatesCount: p._count.estimates,
    })),
  };
}

async function getProjectSummary(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  await requireProjectAccess(projectId, ctx.userId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true, email: true } },
      stages: { orderBy: { sortOrder: "asc" } },
      members: {
        where: { isActive: true },
        include: { user: { select: { name: true, email: true } } },
      },
      _count: { select: { tasks: true, estimates: true, payments: true, files: true, photoReports: true } },
    },
  });

  if (!project) throw new Error("Проєкт не знайдено");

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    address: project.address,
    status: project.status,
    currentStage: project.currentStage,
    stageProgress: project.stageProgress,
    budget: Number(project.totalBudget),
    paid: Number(project.totalPaid),
    remaining: Number(project.totalBudget) - Number(project.totalPaid),
    startDate: project.startDate?.toISOString().split("T")[0],
    expectedEndDate: project.expectedEndDate?.toISOString().split("T")[0],
    actualEndDate: project.actualEndDate?.toISOString().split("T")[0],
    client: project.client,
    manager: project.manager,
    teamMembers: project.members.map((m) => ({
      name: m.user.name,
      role: m.roleInProject,
    })),
    stages: project.stages.map((s) => ({
      stage: s.stage,
      status: s.status,
      progress: s.progress,
      startDate: s.startDate?.toISOString().split("T")[0],
      endDate: s.endDate?.toISOString().split("T")[0],
    })),
    counts: project._count,
  };
}

async function getProjectFinancials(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canViewFinancials) throw new Error("Немає доступу до фінансових даних");

  const [project, payments, financeEntries, estimates] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { totalBudget: true, totalPaid: true, title: true },
    }),
    prisma.payment.findMany({
      where: { projectId },
      orderBy: { scheduledDate: "asc" },
      select: {
        id: true,
        amount: true,
        status: true,
        scheduledDate: true,
        paidDate: true,
        description: true,
      },
    }),
    prisma.financeEntry.findMany({
      where: { projectId, isArchived: false },
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: {
        type: true,
        amount: true,
        category: true,
        subcategory: true,
        description: true,
        occurredAt: true,
        kind: true,
      },
    }),
    prisma.estimate.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        status: true,
        finalAmount: true,
        totalMaterials: true,
        totalLabor: true,
        totalOverhead: true,
      },
    }),
  ]);

  const totalIncome = financeEntries
    .filter((e) => e.type === "INCOME")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalExpense = financeEntries
    .filter((e) => e.type === "EXPENSE")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    budget: Number(project?.totalBudget ?? 0),
    paid: Number(project?.totalPaid ?? 0),
    remaining: Number(project?.totalBudget ?? 0) - Number(project?.totalPaid ?? 0),
    financeEntries: {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      recentEntries: financeEntries.slice(0, 20).map((e) => ({
        type: e.type,
        amount: Number(e.amount),
        category: e.category,
        subcategory: e.subcategory,
        description: e.description,
        date: e.occurredAt?.toISOString().split("T")[0],
      })),
    },
    payments: payments.map((p) => ({
      amount: Number(p.amount),
      status: p.status,
      scheduledDate: p.scheduledDate?.toISOString().split("T")[0],
      paidDate: p.paidDate?.toISOString().split("T")[0],
      description: p.description,
    })),
    estimates: estimates.map((e) => ({
      title: e.title,
      status: e.status,
      finalAmount: Number(e.finalAmount ?? 0),
      materials: Number(e.totalMaterials ?? 0),
      labor: Number(e.totalLabor ?? 0),
      overhead: Number(e.totalOverhead ?? 0),
    })),
  };
}

async function getTaskList(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canViewTasks) throw new Error("Немає доступу до завдань цього проєкту");

  const limit = Math.min((input.limit as number) || 30, 50);
  const priority = input.priority as string | undefined;
  const assigneeId = input.assigneeId as string | undefined;

  const where: Record<string, unknown> = {
    projectId,
    isArchived: false,
  };
  if (priority) where.priority = priority;
  if (assigneeId) {
    where.assignees = { some: { userId: assigneeId } };
  }

  const tasks = await prisma.task.findMany({
    where,
    take: limit,
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      estimatedHours: true,
      actualHours: true,
      createdAt: true,
      status: { select: { name: true, color: true } },
      assignees: {
        include: { user: { select: { name: true } } },
      },
      labels: {
        include: { label: { select: { name: true, color: true } } },
      },
      _count: { select: { checklist: true } },
    },
  });

  const commentCounts = tasks.length
    ? await prisma.comment.groupBy({
        by: ["entityId"],
        where: {
          entityType: "TASK",
          entityId: { in: tasks.map((task) => task.id) },
        },
        _count: { _all: true },
      })
    : [];

  const commentCountByTaskId = new Map(
    commentCounts.map((item) => [item.entityId, item._count._all]),
  );

  return {
    count: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status?.name ?? "Без статусу",
      priority: t.priority,
      dueDate: t.dueDate?.toISOString().split("T")[0],
      estimatedHours: t.estimatedHours,
      actualHours: Number(t.actualHours ?? 0),
      assignees: t.assignees.map((a) => a.user.name),
      labels: t.labels.map((l) => l.label.name),
      checklistItems: t._count.checklist,
      comments: commentCountByTaskId.get(t.id) ?? 0,
    })),
  };
}

async function getMyTasks(input: ToolInput, ctx: AiUserContext) {
  const limit = Math.min((input.limit as number) || 30, 50);

  const tasks = await prisma.task.findMany({
    where: {
      assignees: { some: { userId: ctx.userId } },
      isArchived: false,
    },
    take: limit,
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      estimatedHours: true,
      actualHours: true,
      status: { select: { name: true } },
      project: { select: { id: true, title: true } },
      labels: { include: { label: { select: { name: true } } } },
    },
  });

  const now = new Date();
  return {
    count: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project.title,
      projectId: t.project.id,
      status: t.status?.name ?? "Без статусу",
      priority: t.priority,
      dueDate: t.dueDate?.toISOString().split("T")[0],
      isOverdue: t.dueDate ? t.dueDate < now : false,
      estimatedHours: t.estimatedHours,
      actualHours: Number(t.actualHours ?? 0),
      labels: t.labels.map((l) => l.label.name),
    })),
  };
}

async function getTeamWorkload(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canViewTimeReports) throw new Error("Немає доступу до звітів по часу");

  const daysBack = (input.daysBack as number) || 30;
  const from = new Date();
  from.setDate(from.getDate() - daysBack);

  const report = await timeReport(projectId, { from, to: new Date() });
  return report;
}

async function getEstimateSummary(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  await requireProjectAccess(projectId, ctx.userId);

  const estimates = await prisma.estimate.findMany({
    where: { projectId },
    include: {
      sections: {
        include: {
          items: {
            take: 10,
            select: {
              title: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              amount: true,
              itemType: true,
            },
          },
        },
      },
    },
  });

  return estimates.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    totalMaterials: Number(e.totalMaterials ?? 0),
    totalLabor: Number(e.totalLabor ?? 0),
    totalOverhead: Number(e.totalOverhead ?? 0),
    totalAmount: Number(e.totalAmount ?? 0),
    discount: Number(e.discount ?? 0),
    finalAmount: Number(e.finalAmount ?? 0),
    finalClientPrice: Number(e.finalClientPrice ?? 0),
    profitAmount: Number(e.profitAmount ?? 0),
    sections: e.sections.map((s) => ({
      title: s.title,
      total: Number(s.totalAmount ?? 0),
      itemsCount: s.items.length,
      sampleItems: s.items.slice(0, 5).map((i) => ({
        title: i.title,
        quantity: Number(i.quantity),
        unit: i.unit,
        unitPrice: Number(i.unitPrice),
        amount: Number(i.amount),
        type: i.itemType,
      })),
    })),
  }));
}

async function getPaymentStatus(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canViewFinancials && !access.isClientOfProject) {
    throw new Error("Немає доступу до платежів");
  }

  const payments = await prisma.payment.findMany({
    where: { projectId },
    orderBy: { scheduledDate: "asc" },
    select: {
      id: true,
      amount: true,
      status: true,
      method: true,
      scheduledDate: true,
      paidDate: true,
      description: true,
      invoiceNumber: true,
    },
  });

  const now = new Date();
  const totalScheduled = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + Number(p.amount), 0);
  const overdue = payments.filter(
    (p) => p.scheduledDate && p.scheduledDate < now && p.status !== "PAID",
  );

  return {
    totalScheduled,
    totalPaid,
    remaining: totalScheduled - totalPaid,
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, p) => s + Number(p.amount), 0),
    payments: payments.map((p) => ({
      amount: Number(p.amount),
      status: p.status,
      method: p.method,
      scheduledDate: p.scheduledDate?.toISOString().split("T")[0],
      paidDate: p.paidDate?.toISOString().split("T")[0],
      description: p.description,
      invoiceNumber: p.invoiceNumber,
    })),
  };
}

async function getStageProgress(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  await requireProjectAccess(projectId, ctx.userId);

  const [project, stages] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { currentStage: true, stageProgress: true, title: true },
    }),
    prisma.projectStageRecord.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return {
    projectTitle: project?.title,
    currentStage: project?.currentStage,
    overallProgress: project?.stageProgress,
    stages: stages.map((s) => ({
      stage: s.stage,
      status: s.status,
      progress: s.progress,
      startDate: s.startDate?.toISOString().split("T")[0],
      endDate: s.endDate?.toISOString().split("T")[0],
      notes: s.notes,
    })),
  };
}

async function getDashboardKpis(ctx: AiUserContext) {
  requireAdmin(ctx.role);

  const [
    projectCounts,
    activeProjects,
    totalClients,
    estimatesCount,
    revenueAgg,
    budgetAgg,
    activeTasks,
    overdueTasks,
    overduePayments,
  ] = await Promise.all([
    prisma.project.groupBy({ by: ["status"], _count: true }),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "CLIENT" } }),
    prisma.estimate.count(),
    prisma.payment.aggregate({
      where: { status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.project.aggregate({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      _sum: { totalBudget: true },
    }),
    prisma.task.count({ where: { isArchived: false } }),
    prisma.task.count({
      where: { isArchived: false, dueDate: { lt: new Date() } },
    }),
    prisma.payment.count({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: new Date() },
      },
    }),
  ]);

  const statusBreakdown: Record<string, number> = {};
  for (const g of projectCounts) {
    statusBreakdown[g.status] = g._count;
  }

  return {
    projects: {
      total: Object.values(statusBreakdown).reduce((s, n) => s + n, 0),
      active: activeProjects,
      byStatus: statusBreakdown,
    },
    clients: totalClients,
    estimates: estimatesCount,
    revenue: Number(revenueAgg._sum.amount ?? 0),
    activeBudget: Number(budgetAgg._sum.totalBudget ?? 0),
    tasks: {
      active: activeTasks,
      overdue: overdueTasks,
    },
    overduePayments,
  };
}

async function compareProjects(input: ToolInput, ctx: AiUserContext) {
  requireAdmin(ctx.role);

  const projectIds = (input.projectIds as string[]) ?? [];
  if (projectIds.length < 2 || projectIds.length > 5) {
    throw new Error("Потрібно від 2 до 5 проєктів для порівняння");
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      title: true,
      status: true,
      currentStage: true,
      stageProgress: true,
      totalBudget: true,
      totalPaid: true,
      startDate: true,
      expectedEndDate: true,
      _count: { select: { tasks: true, members: true, estimates: true } },
    },
  });

  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    stage: p.currentStage,
    progress: p.stageProgress,
    budget: Number(p.totalBudget),
    paid: Number(p.totalPaid),
    paymentProgress: Number(p.totalBudget) > 0
      ? Math.round((Number(p.totalPaid) / Number(p.totalBudget)) * 100)
      : 0,
    startDate: p.startDate?.toISOString().split("T")[0],
    expectedEndDate: p.expectedEndDate?.toISOString().split("T")[0],
    tasksCount: p._count.tasks,
    teamSize: p._count.members,
    estimatesCount: p._count.estimates,
  }));
}

async function getOverdueItems(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string | undefined;
  const now = new Date();

  const scope = scopeByClient({ user: { id: ctx.userId, role: ctx.role } });
  const projectWhere = { ...scope, ...(projectId ? { id: projectId } : {}) };

  const [overduePayments, overdueTasks] = await Promise.all([
    prisma.payment.findMany({
      where: {
        project: projectWhere,
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: now },
      },
      take: 30,
      orderBy: { scheduledDate: "asc" },
      select: {
        amount: true,
        scheduledDate: true,
        description: true,
        status: true,
        project: { select: { id: true, title: true } },
      },
    }),
    ctx.role !== "CLIENT"
      ? prisma.task.findMany({
          where: {
            project: projectWhere,
            isArchived: false,
            dueDate: { lt: now },
          },
          take: 30,
          orderBy: { dueDate: "asc" },
          select: {
            id: true,
            title: true,
            priority: true,
            dueDate: true,
            status: { select: { name: true } },
            project: { select: { id: true, title: true } },
            assignees: {
              include: { user: { select: { name: true } } },
            },
          },
        })
      : [],
  ]);

  return {
    overduePayments: overduePayments.map((p) => ({
      project: p.project.title,
      projectId: p.project.id,
      amount: Number(p.amount),
      scheduledDate: p.scheduledDate?.toISOString().split("T")[0],
      description: p.description,
    })),
    overdueTasks: Array.isArray(overdueTasks)
      ? overdueTasks.map((t) => ({
          project: t.project.title,
          projectId: t.project.id,
          taskId: t.id,
          title: t.title,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString().split("T")[0],
          status: t.status?.name,
          assignees: t.assignees.map((a) => a.user.name),
        }))
      : [],
  };
}
