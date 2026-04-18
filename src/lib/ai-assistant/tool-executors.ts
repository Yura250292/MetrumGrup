import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { scopeByClient } from "@/lib/auth-utils";
import { timeReport } from "@/lib/time/reports";
import type { Role } from "@prisma/client";
import type { AiToolName, AiUserContext } from "./types";
import { validateToolInput } from "./tool-schemas";
import { isToolAllowedForRole } from "./tool-registry";

type ToolInput = Record<string, unknown>;

export async function executeTool(
  toolName: AiToolName,
  input: ToolInput,
  ctx: AiUserContext,
): Promise<string> {
  try {
    // Role check
    if (!isToolAllowedForRole(toolName, ctx.role)) {
      return JSON.stringify({ error: "Недостатньо прав для цієї операції" });
    }
    // Validate input with Zod
    const validatedInput = validateToolInput(toolName, input);
    const result = await executeToolInner(toolName, validatedInput, ctx);
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
    case "get_global_team_overview":
      return getGlobalTeamOverview(ctx);
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
    case "web_search":
      return webSearch(input);
    case "get_financial_analysis":
      return getFinancialAnalysis(input, ctx);
    case "create_task":
      return createNewTask(input, ctx);
    case "update_task":
      return updateExistingTask(input, ctx);
    case "assign_task":
      return assignTaskToUser(input, ctx);
    case "add_comment":
      return addNewComment(input, ctx);
    case "create_project":
      return createNewProject(input, ctx);
    case "update_project_stage":
      return updateStageProgress(input, ctx);
    case "add_team_member":
      return addProjectMember(input, ctx);
    case "schedule_payment":
      return scheduleNewPayment(input, ctx);
    case "mark_payment_paid":
      return markPaymentAsPaid(input, ctx);
    case "record_expense":
      return recordNewExpense(input, ctx);
    case "send_notification":
      return sendUserNotification(input, ctx);
    case "get_comments":
      return getEntityComments(input, ctx);
    case "get_time_logs":
      return getDetailedTimeLogs(input, ctx);
    case "get_workers":
      return getWorkersList(input, ctx);
    case "get_materials":
      return getMaterialsList(input);
    case "save_memory":
      return saveUserMemory(input, ctx);
    case "get_memories":
      return getUserMemories(ctx);
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
  const search = input.search as string | undefined;
  const status = input.status as string | undefined;
  const limit = Math.min((input.limit as number) || 20, 50);

  const scope = scopeByClient({ user: { id: ctx.userId, role: ctx.role } });

  // Fuzzy multi-word search across title, address, and client name
  let searchFilter: Record<string, unknown> | undefined;
  if (search) {
    const words = search.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length > 0) {
      searchFilter = {
        AND: words.map((word) => ({
          OR: [
            { title: { contains: word, mode: "insensitive" } },
            { address: { contains: word, mode: "insensitive" } },
            { client: { name: { contains: word, mode: "insensitive" } } },
          ],
        })),
      };
    }
  }

  const where: Record<string, unknown> = {
    ...scope,
    ...(status ? { status } : {}),
    ...searchFilter,
  };

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

// ── Web Search (Tavily API → DuckDuckGo fallback) ────────────

async function webSearch(input: ToolInput) {
  const query = input.query as string;
  const location = input.location as string | undefined;
  const searchQuery = location ? `${query} ${location}` : query;

  // Priority: Serper (Google) → Tavily → DuckDuckGo
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    return serperSearch(searchQuery, serperKey);
  }
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    return tavilySearch(searchQuery, tavilyKey);
  }
  return duckDuckGoSearch(searchQuery);
}

async function serperSearch(query: string, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, gl: "ua", hl: "uk", num: 10 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error("[serper] error", res.status);
      return duckDuckGoSearch(query);
    }
    const data = await res.json();
    const organic = data.organic ?? [];
    return {
      answer: data.answerBox?.answer ?? data.answerBox?.snippet ?? null,
      results: organic.slice(0, 8).map((r: { title: string; link: string; snippet: string; position: number }) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet?.slice(0, 300) ?? "",
        position: r.position,
      })),
      query,
      source: "Google",
    };
  } catch {
    clearTimeout(timeout);
    return duckDuckGoSearch(query);
  }
}

async function tavilySearch(query: string, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: "advanced", max_results: 8, include_answer: true, include_raw_content: false }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return duckDuckGoSearch(query); // fallback
    const data = await res.json();
    return {
      answer: data.answer ?? null,
      results: (data.results ?? []).slice(0, 8).map((r: { title: string; url: string; content: string; score: number }) => ({
        title: r.title, url: r.url, snippet: r.content?.slice(0, 300), relevance: r.score,
      })),
      query,
    };
  } catch {
    clearTimeout(timeout);
    return duckDuckGoSearch(query);
  }
}

async function duckDuckGoSearch(query: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // DuckDuckGo HTML lite — no API key needed
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MetrumBot/1.0)",
        "Accept": "text/html",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { error: `Помилка пошуку: ${res.status}`, query };
    }

    const html = await res.text();
    const results = parseDuckDuckGoHTML(html);

    return {
      answer: null,
      results: results.slice(0, 8),
      query,
      source: "DuckDuckGo",
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return { error: "Пошук перевищив час очікування (15с)." };
    }
    return { error: `Помилка пошуку: ${err instanceof Error ? err.message : "невідома"}` };
  }
}

function parseDuckDuckGoHTML(html: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  // Parse DuckDuckGo HTML results using regex (no DOM parser on server)
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const links: Array<{ url: string; title: string }> = [];
  let match;
  while ((match = resultRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    // DuckDuckGo wraps URLs in redirect — extract actual URL
    const urlMatch = rawUrl.match(/uddg=([^&]+)/);
    const url = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
    if (title && url && !url.includes("duckduckgo.com")) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
  }

  for (let i = 0; i < links.length && i < 8; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || "",
    });
  }

  return results;
}

// ── Financial Analysis (cross-project) ───────────────────────

async function getFinancialAnalysis(input: ToolInput, ctx: AiUserContext) {
  requireAdmin(ctx.role);

  const daysBack = (input.daysBack as number) || 90;
  const from = new Date();
  from.setDate(from.getDate() - daysBack);

  const [
    allProjects,
    financeEntries,
    payments,
    estimates,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      select: {
        id: true,
        title: true,
        status: true,
        totalBudget: true,
        totalPaid: true,
        currentStage: true,
        stageProgress: true,
      },
    }),
    prisma.financeEntry.findMany({
      where: { isArchived: false, occurredAt: { gte: from } },
      select: {
        type: true,
        amount: true,
        category: true,
        subcategory: true,
        projectId: true,
        occurredAt: true,
        project: { select: { title: true } },
      },
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: from } },
      select: {
        amount: true,
        status: true,
        projectId: true,
        scheduledDate: true,
        paidDate: true,
        project: { select: { title: true } },
      },
    }),
    prisma.estimate.findMany({
      where: { createdAt: { gte: from } },
      select: {
        title: true,
        status: true,
        finalAmount: true,
        profitAmount: true,
        projectId: true,
        project: { select: { title: true } },
      },
    }),
  ]);

  // Aggregate finance entries by category
  const byCategory: Record<string, { income: number; expense: number }> = {};
  let totalIncome = 0;
  let totalExpense = 0;

  for (const entry of financeEntries) {
    const cat = entry.category || "Інше";
    if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
    const amount = Number(entry.amount);
    if (entry.type === "INCOME") {
      byCategory[cat].income += amount;
      totalIncome += amount;
    } else {
      byCategory[cat].expense += amount;
      totalExpense += amount;
    }
  }

  // Project profitability
  const projectProfitability = allProjects.map((p) => {
    const budget = Number(p.totalBudget);
    const paid = Number(p.totalPaid);
    const projectExpenses = financeEntries
      .filter((e) => e.projectId === p.id && e.type === "EXPENSE")
      .reduce((s, e) => s + Number(e.amount), 0);

    return {
      title: p.title,
      status: p.status,
      stage: p.currentStage,
      progress: p.stageProgress,
      budget,
      paid,
      expenses: projectExpenses,
      profit: paid - projectExpenses,
      budgetUsage: budget > 0 ? Math.round((projectExpenses / budget) * 100) : 0,
    };
  });

  // Top expense categories
  const topExpenses = Object.entries(byCategory)
    .map(([cat, data]) => ({ category: cat, ...data }))
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 10);

  return {
    period: `Останні ${daysBack} днів`,
    summary: {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      activeProjects: allProjects.length,
      totalBudget: allProjects.reduce((s, p) => s + Number(p.totalBudget), 0),
      totalPaid: allProjects.reduce((s, p) => s + Number(p.totalPaid), 0),
    },
    topExpenseCategories: topExpenses,
    projectProfitability: projectProfitability.sort((a, b) => b.profit - a.profit),
    estimatesCreated: estimates.length,
    estimatesTotalValue: estimates.reduce((s, e) => s + Number(e.finalAmount ?? 0), 0),
    paymentsReceived: payments.filter((p) => p.status === "PAID").length,
    paymentsOverdue: payments.filter(
      (p) => p.status !== "PAID" && p.scheduledDate && p.scheduledDate < new Date(),
    ).length,
  };
}

// ── Write Actions ────────────────────────────────────────────

async function createNewTask(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const title = input.title as string;
  const description = (input.description as string) || undefined;
  const priority = (input.priority as string) || "NORMAL";
  const dueDateStr = input.dueDate as string | undefined;

  if (!title?.trim()) throw new Error("Назва завдання обов'язкова");

  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canCreateTasks) throw new Error("Немає прав на створення завдань в цьому проєкті");

  // Get first stage and default status
  const [stage, status] = await Promise.all([
    prisma.projectStageRecord.findFirst({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    }),
    prisma.taskStatus.findFirst({
      where: { projectId, isDefault: true },
      select: { id: true },
    }),
  ]);

  if (!stage) throw new Error("Проєкт не має етапів — спочатку створіть етапи");
  if (!status) throw new Error("Проєкт не має статусів завдань — спочатку налаштуйте статуси");

  // Get next position
  const lastPos = await prisma.task.aggregate({
    where: { projectId, statusId: status.id },
    _max: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description,
      priority: priority as "LOW" | "NORMAL" | "HIGH" | "URGENT",
      dueDate: dueDateStr ? new Date(dueDateStr) : undefined,
      projectId,
      stageId: stage.id,
      statusId: status.id,
      createdById: ctx.userId,
      position: (lastPos._max.position ?? -1) + 1,
      assignees: {
        create: { userId: ctx.userId },
      },
    },
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      status: { select: { name: true } },
    },
  });

  return {
    success: true,
    message: `Завдання "${task.title}" створено`,
    task: {
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status?.name,
      dueDate: task.dueDate?.toISOString().split("T")[0],
    },
  };
}

async function scheduleNewPayment(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const amount = input.amount as number;
  const scheduledDateStr = input.scheduledDate as string;
  const description = (input.description as string) || undefined;
  const method = (input.method as string) || "BANK_TRANSFER";

  if (!amount || amount <= 0) throw new Error("Сума повинна бути більше 0");

  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canViewFinancials) throw new Error("Немає прав на управління платежами");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  });
  if (!project) throw new Error("Проєкт не знайдено");

  const payment = await prisma.payment.create({
    data: {
      projectId,
      amount,
      scheduledDate: new Date(scheduledDateStr),
      notes: description,
      method: method as "BANK_TRANSFER" | "CASH" | "CARD",
      status: "PENDING",
      createdById: ctx.userId,
    },
    select: {
      id: true,
      amount: true,
      scheduledDate: true,
      notes: true,
      method: true,
      status: true,
    },
  });

  return {
    success: true,
    message: `Платіж на ${Number(payment.amount).toLocaleString("uk-UA")} ₴ заплановано на ${payment.scheduledDate?.toLocaleDateString("uk-UA")}`,
    payment: {
      id: payment.id,
      amount: Number(payment.amount),
      scheduledDate: payment.scheduledDate?.toISOString().split("T")[0],
      notes: payment.notes,
      method: payment.method,
      status: payment.status,
      project: project.title,
    },
  };
}

// ── NEW: Write actions ───────────────────────────────────────

async function updateExistingTask(input: ToolInput, ctx: AiUserContext) {
  const taskId = input.taskId as string;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, title: true },
  });
  if (!task) throw new Error("Завдання не знайдено");

  const access = await requireProjectAccess(task.projectId, ctx.userId);
  if (!access.canEditAnyTask) throw new Error("Немає прав на редагування завдань");

  const data: Record<string, unknown> = {};
  if (input.title) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.priority) data.priority = input.priority;
  if (input.dueDate) data.dueDate = new Date(input.dueDate as string);

  // Find status by name
  if (input.statusName) {
    const status = await prisma.taskStatus.findFirst({
      where: {
        projectId: task.projectId,
        name: { contains: input.statusName as string, mode: "insensitive" },
      },
    });
    if (status) data.statusId = status.id;
  }

  if (Object.keys(data).length === 0) return { message: "Нічого не змінено" };

  const updated = await prisma.task.update({
    where: { id: taskId },
    data,
    select: { id: true, title: true, priority: true, dueDate: true, status: { select: { name: true } } },
  });

  return { success: true, message: `Завдання "${updated.title}" оновлено`, task: { ...updated, dueDate: updated.dueDate?.toISOString().split("T")[0] } };
}

async function assignTaskToUser(input: ToolInput, ctx: AiUserContext) {
  const taskId = input.taskId as string;
  const userId = input.userId as string;
  const action = (input.action as string) || "add";

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, title: true } });
  if (!task) throw new Error("Завдання не знайдено");

  const access = await requireProjectAccess(task.projectId, ctx.userId);
  if (!access.canAssignTasks) throw new Error("Немає прав на призначення завдань");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Користувача не знайдено");

  if (action === "remove") {
    await prisma.taskAssignee.deleteMany({ where: { taskId, userId } });
    return { success: true, message: `${user.name} знятий з завдання "${task.title}"` };
  }

  await prisma.taskAssignee.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId },
    update: {},
  });
  return { success: true, message: `${user.name} призначений на завдання "${task.title}"` };
}

async function addNewComment(input: ToolInput, ctx: AiUserContext) {
  const entityType = input.entityType as string;
  const entityId = input.entityId as string;
  const body = input.body as string;
  if (!body?.trim()) throw new Error("Текст коментаря обов'язковий");

  const comment = await prisma.comment.create({
    data: {
      entityType: entityType as "TASK" | "PROJECT" | "ESTIMATE",
      entityId,
      body: body.trim(),
      authorId: ctx.userId,
    },
    select: { id: true, body: true, createdAt: true },
  });

  return { success: true, message: "Коментар додано", commentId: comment.id };
}

async function createNewProject(input: ToolInput, ctx: AiUserContext) {
  requireAdmin(ctx.role);

  const title = input.title as string;
  if (!title?.trim()) throw new Error("Назва проєкту обов'язкова");

  const slug = title.toLowerCase().replace(/[^a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);

  const clientId = (input.clientId as string) || ctx.userId;
  const project = await prisma.project.create({
    data: {
      title: title.trim(),
      slug,
      description: (input.description as string) || undefined,
      address: (input.address as string) || undefined,
      totalBudget: (input.totalBudget as number) || 0,
      status: "DRAFT",
      clientId,
    },
    select: { id: true, title: true, slug: true, status: true },
  });

  return { success: true, message: `Проєкт "${project.title}" створено (чернетка)`, project };
}

async function updateStageProgress(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  await requireProjectAccess(projectId, ctx.userId);

  const stage = input.stage as string;
  const progress = input.progress as number | undefined;
  const status = input.status as string | undefined;

  const data: Record<string, unknown> = {};
  if (progress !== undefined) data.progress = progress;
  if (status) data.status = status;

  const updated = await prisma.projectStageRecord.updateMany({
    where: { projectId, stage: stage as never },
    data,
  });

  if (updated.count === 0) throw new Error(`Етап ${stage} не знайдено в цьому проєкті`);

  // Update project's current stage if this stage is now in progress
  if (status === "IN_PROGRESS") {
    await prisma.project.update({
      where: { id: projectId },
      data: { currentStage: stage as never, stageProgress: progress ?? undefined },
    });
  }

  return { success: true, message: `Етап ${stage} оновлено${progress !== undefined ? `: ${progress}%` : ""}` };
}

async function addProjectMember(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const userId = input.userId as string;
  const role = input.role as string;

  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canManageMembers) throw new Error("Немає прав на управління командою");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Користувача не знайдено");

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, roleInProject: role as never, isActive: true, invitedById: ctx.userId },
    update: { roleInProject: role as never, isActive: true },
  });

  return { success: true, message: `${user.name} додано до проєкту як ${role}` };
}

async function markPaymentAsPaid(input: ToolInput, ctx: AiUserContext) {
  const paymentId = input.paymentId as string;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { projectId: true, amount: true },
  });
  if (!payment) throw new Error("Платіж не знайдено");

  const access = await requireProjectAccess(payment.projectId, ctx.userId);
  if (!access.canViewFinancials) throw new Error("Немає прав");

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PAID", paidDate: new Date() },
  });

  return { success: true, message: `Платіж на ${Number(payment.amount).toLocaleString("uk-UA")} ₴ відмічено як сплачений` };
}

async function recordNewExpense(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  requireAdmin(ctx.role);

  const desc = (input.description as string) || "";
  const cat = (input.category as string) || "other";
  const entry = await prisma.financeEntry.create({
    data: {
      projectId,
      type: "EXPENSE",
      kind: "FACT",
      amount: input.amount as number,
      category: cat,
      title: desc || `Витрата: ${cat}`,
      description: desc || undefined,
      occurredAt: input.occurredAt ? new Date(input.occurredAt as string) : new Date(),
      createdById: ctx.userId,
    },
    select: { id: true, amount: true, category: true, description: true },
  });

  return { success: true, message: `Витрату ${Number(entry.amount).toLocaleString("uk-UA")} ₴ (${entry.category}) записано` };
}

async function sendUserNotification(input: ToolInput, ctx: AiUserContext) {
  requireAdmin(ctx.role);

  const title = input.title as string;
  const message = input.message as string;
  const userId = input.userId as string | undefined;
  const projectId = input.projectId as string | undefined;

  if (userId) {
    await prisma.notification.create({
      data: { userId, title, message, type: "SYSTEM" },
    });
    return { success: true, message: `Сповіщення надіслано користувачу` };
  }

  if (projectId) {
    const members = await prisma.projectMember.findMany({
      where: { projectId, isActive: true },
      select: { userId: true },
    });
    await prisma.notification.createMany({
      data: members.map((m) => ({ userId: m.userId, title, message, type: "SYSTEM" as const })),
    });
    return { success: true, message: `Сповіщення надіслано ${members.length} учасникам проєкту` };
  }

  throw new Error("Вкажіть userId або projectId");
}

// ── NEW: Deep read tools ─────────────────────────────────────

async function getEntityComments(input: ToolInput, ctx: AiUserContext) {
  const entityType = input.entityType as string;
  const entityId = input.entityId as string;
  const limit = Math.min((input.limit as number) || 20, 50);

  const comments = await prisma.comment.findMany({
    where: { entityType: entityType as never, entityId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  return {
    count: comments.length,
    comments: comments.map((c) => ({
      author: c.author.name,
      body: c.body,
      date: c.createdAt.toISOString().split("T")[0],
    })),
  };
}

async function getDetailedTimeLogs(input: ToolInput, ctx: AiUserContext) {
  const projectId = input.projectId as string;
  const access = await requireProjectAccess(projectId, ctx.userId);
  if (!access.canViewTimeReports) throw new Error("Немає доступу до часових звітів");

  const daysBack = (input.daysBack as number) || 30;
  const from = new Date();
  from.setDate(from.getDate() - daysBack);

  const where: Record<string, unknown> = {
    task: { projectId },
    startedAt: { gte: from },
    endedAt: { not: null },
  };
  if (input.userId) where.userId = input.userId;

  const logs = await prisma.timeLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      minutes: true,
      startedAt: true,
      costSnapshot: true,
      billable: true,
      description: true,
      user: { select: { name: true } },
      task: { select: { title: true } },
    },
  });

  return {
    count: logs.length,
    totalHours: Math.round(logs.reduce((s, l) => s + (l.minutes ?? 0), 0) / 60 * 10) / 10,
    totalCost: logs.reduce((s, l) => s + Number(l.costSnapshot ?? 0), 0),
    logs: logs.map((l) => ({
      user: l.user.name,
      task: l.task.title,
      hours: Math.round((l.minutes ?? 0) / 60 * 10) / 10,
      cost: Number(l.costSnapshot ?? 0),
      date: l.startedAt?.toISOString().split("T")[0],
      billable: l.billable,
      description: l.description,
    })),
  };
}

async function getWorkersList(input: ToolInput, ctx: AiUserContext) {
  requireAdmin(ctx.role);

  const where: Record<string, unknown> = {};
  if (input.projectId) {
    where.crewAssignments = { some: { projectId: input.projectId as string } };
  }

  const workers = await prisma.worker.findMany({
    where,
    take: 50,
    select: {
      id: true,
      name: true,
      phone: true,
      specialty: true,
      dailyRate: true,
      isActive: true,
      crewAssignments: {
        select: { project: { select: { title: true } } },
      },
    },
  });

  return {
    count: workers.length,
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      phone: w.phone,
      specialty: w.specialty,
      dailyRate: Number(w.dailyRate ?? 0),
      active: w.isActive,
      currentProjects: w.crewAssignments.map((a) => a.project.title),
    })),
  };
}

async function getMaterialsList(input: ToolInput) {
  const search = input.search as string | undefined;
  const category = input.category as string | undefined;
  const limit = Math.min((input.limit as number) || 30, 50);

  const where: Record<string, unknown> = { isActive: true };
  if (search) where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { sku: { contains: search, mode: "insensitive" } },
  ];
  if (category) where.category = category;

  const materials = await prisma.material.findMany({
    where,
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      unit: true,
      basePrice: true,
      laborRate: true,
      markupPercent: true,
    },
  });

  return {
    count: materials.length,
    materials: materials.map((m) => ({
      id: m.id,
      name: m.name,
      sku: m.sku,
      category: m.category,
      unit: m.unit,
      price: Number(m.basePrice ?? 0),
      laborRate: Number(m.laborRate ?? 0),
      markup: Number(m.markupPercent ?? 0),
    })),
  };
}

// ── Memory ───────────────────────────────────────────────────

async function saveUserMemory(input: ToolInput, ctx: AiUserContext) {
  const key = input.key as string;
  const value = input.value as string;

  await prisma.aiMemory.upsert({
    where: { userId_key: { userId: ctx.userId, key } },
    create: { userId: ctx.userId, key, value },
    update: { value },
  });

  return { success: true, message: `Запам'ятовано: ${key} = ${value}` };
}

async function getUserMemories(ctx: AiUserContext) {
  const memories = await prisma.aiMemory.findMany({
    where: { userId: ctx.userId },
    select: { key: true, value: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return {
    count: memories.length,
    memories: memories.map((m) => ({
      key: m.key,
      value: m.value,
      updated: m.updatedAt.toISOString().split("T")[0],
    })),
  };
}

// ── Global Team Overview ─────────────────────────────────────

const ROLE_UA: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор", MANAGER: "Менеджер", ENGINEER: "Інженер",
  FINANCIER: "Фінансист", CLIENT: "Клієнт", USER: "Користувач",
  PROJECT_ADMIN: "Керівник", PROJECT_MANAGER: "PM", FOREMAN: "Прораб",
  FINANCE: "Фінансист", PROCUREMENT: "Закупівлі", VIEWER: "Спостерігач",
};

async function getGlobalTeamOverview(ctx: AiUserContext) {
  const now = new Date();

  const members = await prisma.projectMember.findMany({
    where: { isActive: true },
    include: {
      user: { select: { id: true, name: true, role: true, email: true, phone: true } },
      project: { select: { id: true, title: true, status: true, currentStage: true } },
    },
  });

  // Group by user
  const byUser = new Map<string, {
    name: string; role: string; email: string; phone: string | null;
    projects: Array<{ title: string; role: string; stage: string | null }>;
  }>();

  for (const m of members) {
    const existing = byUser.get(m.userId);
    const proj = { title: m.project.title, role: ROLE_UA[m.roleInProject] || m.roleInProject, stage: m.project.currentStage };
    if (existing) { existing.projects.push(proj); }
    else { byUser.set(m.userId, { name: m.user.name, role: ROLE_UA[m.user.role] || m.user.role, email: m.user.email, phone: m.user.phone, projects: [proj] }); }
  }

  // Get tasks per user with details
  const userIds = [...byUser.keys()];
  const tasks = await prisma.task.findMany({
    where: { isArchived: false, assignees: { some: { userId: { in: userIds } } } },
    select: {
      title: true, priority: true, dueDate: true,
      status: { select: { name: true } },
      project: { select: { title: true } },
      assignees: { select: { userId: true } },
    },
    orderBy: { priority: "desc" },
  });

  const tasksByUser = new Map<string, typeof tasks>();
  for (const t of tasks) {
    for (const a of t.assignees) {
      const list = tasksByUser.get(a.userId) || [];
      list.push(t);
      tasksByUser.set(a.userId, list);
    }
  }

  const team = [...byUser.entries()].map(([userId, d]) => {
    const userTasks = tasksByUser.get(userId) || [];
    const overdue = userTasks.filter((t) => t.dueDate && t.dueDate < now).length;

    return {
      name: d.name,
      role: d.role,
      contact: d.phone || d.email,
      навантаження: userTasks.length >= 8 ? "🔴 перевантажений" : userTasks.length >= 4 ? "🟡 нормальне" : userTasks.length > 0 ? "🟢 легке" : "⚪ вільний",
      завдань: userTasks.length,
      прострочених: overdue,
      проєкти: d.projects.map((p) => `${p.title} (${p.role})`).join(", "),
      поточніЗавдання: userTasks.slice(0, 3).map((t) => ({
        назва: t.title,
        пріоритет: t.priority,
        статус: t.status?.name ?? "—",
        проєкт: t.project.title,
        дедлайн: t.dueDate?.toISOString().split("T")[0] ?? "без дедлайну",
        прострочено: t.dueDate ? t.dueDate < now : false,
      })),
    };
  });

  return { членівКоманди: team.length, команда: team.sort((a, b) => b.завдань - a.завдань) };
}
