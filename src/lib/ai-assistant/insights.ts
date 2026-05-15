import { prisma } from "@/lib/prisma";

export type Insight = {
  type: "danger" | "warning" | "info" | "success";
  title: string;
  detail: string;
  projectId?: string;
  actionHref?: string;
};

/**
 * Generates real-time insights by scanning the database for
 * overdue items, budget overruns, workload imbalances, etc.
 */
export async function generateInsights(userId: string): Promise<Insight[]> {
  const now = new Date();
  const insights: Insight[] = [];

  const [
    overduePayments,
    overdueTasks,
    projectsOverBudget,
    taskWorkload,
    recentStalled,
  ] = await Promise.all([
    // Overdue payments
    prisma.payment.findMany({
      where: { status: { in: ["PENDING", "PARTIAL"] }, scheduledDate: { lt: now } },
      select: { amount: true, scheduledDate: true, project: { select: { id: true, title: true } } },
    }),
    // Overdue tasks
    prisma.task.findMany({
      where: { isArchived: false, dueDate: { lt: now } },
      select: {
        id: true, title: true, dueDate: true, priority: true,
        project: { select: { id: true, title: true } },
        assignees: { select: { user: { select: { name: true } } } },
      },
      take: 20,
    }),
    // Projects where paid > budget
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, title: true, totalBudget: true, totalPaid: true },
    }),
    // Task count per assignee (active tasks)
    prisma.taskAssignee.groupBy({
      by: ["userId"],
      where: { task: { isArchived: false } },
      _count: true,
    }),
    // Projects with no updates in 14+ days
    prisma.project.findMany({
      where: { status: "ACTIVE", updatedAt: { lt: new Date(now.getTime() - 14 * 86400000) } },
      select: { id: true, title: true, updatedAt: true },
    }),
  ]);

  // 1. Overdue payments
  if (overduePayments.length > 0) {
    const total = overduePayments.reduce((s, p) => s + Number(p.amount), 0);
    insights.push({
      type: "danger",
      title: `${overduePayments.length} прострочених платежів`,
      detail: `Загальна сума: ${Math.round(total).toLocaleString("uk-UA")} ₴. Проєкти: ${[...new Set(overduePayments.map((p) => p.project.title))].join(", ")}`,
      actionHref: "/admin-v2/finance",
    });
  }

  // 2. Overdue tasks
  if (overdueTasks.length > 0) {
    const urgent = overdueTasks.filter((t) => t.priority === "URGENT" || t.priority === "HIGH");
    insights.push({
      type: urgent.length > 0 ? "danger" : "warning",
      title: `${overdueTasks.length} прострочених завдань`,
      detail: urgent.length > 0
        ? `${urgent.length} з них HIGH/URGENT: ${urgent.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}`
        : `Найстаріше: "${overdueTasks[0].title}" (${overdueTasks[0].dueDate?.toLocaleDateString("uk-UA")})`,
      actionHref: "/admin-v2/me",
    });
  }

  // 3. Budget overruns
  const overBudget = projectsOverBudget.filter((p) => {
    const budget = Number(p.totalBudget);
    const paid = Number(p.totalPaid);
    return budget > 0 && paid > budget * 0.9;
  });
  for (const p of overBudget) {
    const pct = Math.round((Number(p.totalPaid) / Number(p.totalBudget)) * 100);
    insights.push({
      type: pct > 100 ? "danger" : "warning",
      title: `${p.title}: бюджет ${pct > 100 ? "перевищено" : "майже вичерпано"}`,
      detail: `Використано ${pct}% бюджету (${Math.round(Number(p.totalPaid)).toLocaleString("uk-UA")} / ${Math.round(Number(p.totalBudget)).toLocaleString("uk-UA")} ₴)`,
      projectId: p.id,
      actionHref: `/admin-v2/projects/${p.id}`,
    });
  }

  // 4. Workload imbalance
  if (taskWorkload.length >= 2) {
    const sorted = [...taskWorkload].sort((a, b) => b._count - a._count);
    const max = sorted[0];
    const min = sorted[sorted.length - 1];
    if (max._count > min._count * 3 && max._count >= 8) {
      const maxUser = await prisma.user.findUnique({ where: { id: max.userId }, select: { name: true } });
      const minUser = await prisma.user.findUnique({ where: { id: min.userId }, select: { name: true } });
      insights.push({
        type: "warning",
        title: "Нерівномірне навантаження",
        detail: `${maxUser?.name}: ${max._count} завдань, ${minUser?.name}: ${min._count}. Рекомендую перерозподілити.`,
        actionHref: "/admin-v2/me?scope=all",
      });
    }
  }

  // 5. Stalled projects
  if (recentStalled.length > 0) {
    insights.push({
      type: "info",
      title: `${recentStalled.length} проєктів без оновлень 14+ днів`,
      detail: recentStalled.map((p) => p.title).join(", "),
      actionHref: "/admin-v2/projects",
    });
  }

  // 6. Positive — completed recently
  const completedThisWeek = await prisma.task.count({
    where: {
      completedAt: { gte: new Date(now.getTime() - 7 * 86400000) },
    },
  });
  if (completedThisWeek > 0) {
    insights.push({
      type: "success",
      title: `${completedThisWeek} завдань завершено цього тижня`,
      detail: "Команда працює продуктивно!",
    });
  }

  // 7. Smart pattern: expense categories anomalies
  const recentExpenses = await prisma.financeEntry.groupBy({
    by: ["category"],
    where: { type: "EXPENSE", isArchived: false, occurredAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 5,
  });
  if (recentExpenses.length >= 2) {
    const top = recentExpenses[0];
    const topAmount = Number(top._sum.amount ?? 0);
    const totalExpenses = recentExpenses.reduce((s, e) => s + Number(e._sum.amount ?? 0), 0);
    const pct = totalExpenses > 0 ? Math.round((topAmount / totalExpenses) * 100) : 0;
    if (pct > 50) {
      insights.push({
        type: "info",
        title: `${top.category}: ${pct}% всіх витрат`,
        detail: `За 30 днів категорія "${top.category}" — ${Math.round(topAmount).toLocaleString("uk-UA")} ₴ з ${Math.round(totalExpenses).toLocaleString("uk-UA")} ₴. Варто перевірити.`,
      });
    }
  }

  // 8. Upcoming payments this week
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const upcomingPayments = await prisma.payment.findMany({
    where: { status: "PENDING", scheduledDate: { gte: now, lte: nextWeek } },
    select: { amount: true, scheduledDate: true, project: { select: { title: true } } },
  });
  if (upcomingPayments.length > 0) {
    const total = upcomingPayments.reduce((s, p) => s + Number(p.amount), 0);
    insights.push({
      type: "info",
      title: `${upcomingPayments.length} платежів цього тижня`,
      detail: `Загалом ${Math.round(total).toLocaleString("uk-UA")} ₴`,
    });
  }

  // 9. Projects with no tasks assigned
  const projectsNoTasks = await prisma.project.findMany({
    where: {
      status: "ACTIVE",
      tasks: { none: {} },
    },
    select: { title: true },
    take: 5,
  });
  if (projectsNoTasks.length > 0) {
    insights.push({
      type: "warning",
      title: `${projectsNoTasks.length} активних проєктів без завдань`,
      detail: `${projectsNoTasks.map((p) => p.title).join(", ")}. Можливо потрібно створити завдання.`,
      actionHref: "/admin-v2/projects",
    });
  }

  // 10. Expense trend — compare last 30 days vs previous 30 days
  const prev30 = new Date(now.getTime() - 60 * 86400000);
  const [recentTotal, previousTotal] = await Promise.all([
    prisma.financeEntry.aggregate({
      where: { type: "EXPENSE", isArchived: false, occurredAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
      _sum: { amount: true },
    }),
    prisma.financeEntry.aggregate({
      where: { type: "EXPENSE", isArchived: false, occurredAt: { gte: prev30, lt: new Date(now.getTime() - 30 * 86400000) } },
      _sum: { amount: true },
    }),
  ]);

  const recent = Number(recentTotal._sum.amount ?? 0);
  const previous = Number(previousTotal._sum.amount ?? 0);
  if (previous > 0 && recent > previous * 1.3) {
    const growthPct = Math.round(((recent - previous) / previous) * 100);
    insights.push({
      type: "warning",
      title: `Витрати зросли на ${growthPct}%`,
      detail: `Останні 30 днів: ${Math.round(recent).toLocaleString("uk-UA")} ₴ vs попередні: ${Math.round(previous).toLocaleString("uk-UA")} ₴`,
      actionHref: "/admin-v2/finance",
    });
  }

  return insights.slice(0, 8);
}
