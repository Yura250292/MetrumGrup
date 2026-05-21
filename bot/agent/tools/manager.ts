import { prisma } from '../../../src/lib/prisma';
import { notifyFinanceActor } from '../../../src/lib/financing/notify-approval';
import { registerTool } from './registry';
import { urls } from '../urls';

const APPROVER_ROLES = ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'] as const;

registerTool({
  name: 'get_pending_approvals',
  description:
    'Список того, що чекає апруву менеджера/фінансиста: FinanceEntry зі статусом PENDING + ForemanReport PENDING_APPROVAL. firmId-ізольовано.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'За замовчуванням 10, макс 30' },
    },
  },
  allowedRoles: ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'],
  handler: async (args: { limit?: number }, ctx) => {
    const limit = Math.min(args.limit ?? 10, 30);
    const firmFilter = ctx.firmScope.firmId
      ? { firmId: ctx.firmScope.firmId }
      : {};

    const [financeEntries, foremanReports] = await Promise.all([
      prisma.financeEntry.findMany({
        where: { status: 'PENDING', ...firmFilter, isArchived: false },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          amount: true,
          type: true,
          category: true,
          occurredAt: true,
          counterparty: true,
          project: { select: { title: true } },
          createdBy: { select: { name: true, email: true } },
        },
      }),
      prisma.foremanReport.findMany({
        where: { status: 'PENDING_APPROVAL', ...firmFilter },
        orderBy: { submittedAt: 'desc' },
        take: limit,
        include: {
          project: { select: { title: true } },
          createdBy: { select: { name: true, email: true } },
          items: { select: { amount: true } },
        },
      }),
    ]);

    return {
      ok: true,
      financeEntries: financeEntries.map((e) => ({
        id: e.id,
        title: e.title,
        amount: Number(e.amount),
        type: e.type,
        category: e.category,
        occurredAt: e.occurredAt,
        counterparty: e.counterparty,
        project: e.project?.title ?? null,
        author: e.createdBy.name ?? e.createdBy.email,
        url: urls.financeEntry(e.id),
      })),
      foremanReports: foremanReports.map((r) => ({
        id: r.id,
        project: r.project.title,
        submittedAt: r.submittedAt,
        author: r.createdBy.name ?? r.createdBy.email,
        itemCount: r.items.length,
        total: r.items.reduce((s, it) => s + Number(it.amount), 0),
        url: urls.foremanReport(r.id),
      })),
      financeEntriesCount: financeEntries.length,
      foremanReportsCount: foremanReports.length,
    };
  },
});

registerTool({
  name: 'approve_finance_entry',
  description:
    'Підтвердити FinanceEntry (один або кілька). Викликати ТІЛЬКИ після того як користувач явно ствердив наступним повідомленням. confirm:true обов\'язково.',
  parameters: {
    type: 'object',
    properties: {
      entryIds: {
        type: 'array',
        description: 'Список ID FinanceEntry',
        items: { type: 'string' },
      },
      confirm: { type: 'boolean' },
    },
    required: ['entryIds', 'confirm'],
  },
  allowedRoles: ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'],
  mutation: true,
  handler: async (
    args: { entryIds: string[]; confirm: boolean },
    ctx,
  ) => {
    if (!args.confirm) {
      return { ok: false, error: 'confirm:true is required' };
    }
    if (!APPROVER_ROLES.includes(ctx.role as never)) {
      return { ok: false, error: 'role_not_approver' };
    }
    const results: Array<{ id: string; ok: boolean; reason?: string }> = [];
    for (const entryId of args.entryIds.slice(0, 20)) {
      const entry = await prisma.financeEntry.findUnique({
        where: { id: entryId },
        select: {
          id: true,
          status: true,
          firmId: true,
          title: true,
          amount: true,
          createdById: true,
          type: true,
        },
      });
      if (!entry) {
        results.push({ id: entryId, ok: false, reason: 'not_found' });
        continue;
      }
      if (
        ctx.firmId &&
        entry.firmId &&
        entry.firmId !== ctx.firmId
      ) {
        results.push({ id: entryId, ok: false, reason: 'wrong_firm' });
        continue;
      }
      if (entry.status === 'APPROVED' || entry.status === 'PAID') {
        results.push({ id: entryId, ok: false, reason: 'already_resolved' });
        continue;
      }
      await prisma.financeEntry.update({
        where: { id: entryId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: ctx.user.id,
          updatedById: ctx.user.id,
          remindAt: null,
        },
      });
      await notifyFinanceActor(
        {
          id: entry.id,
          title: entry.title,
          type: entry.type,
          amount: Number(entry.amount),
          createdById: entry.createdById,
        },
        'APPROVED',
        ctx.user.id,
      );
      results.push({ id: entryId, ok: true });
    }
    return { ok: true, results };
  },
});

registerTool({
  name: 'reject_finance_entry',
  description:
    'Відхилити FinanceEntry (повертає у DRAFT). confirm:true обов\'язково.',
  parameters: {
    type: 'object',
    properties: {
      entryId: { type: 'string' },
      reason: {
        type: 'string',
        description: 'Чому відхилили — піде в нотифікацію автору',
      },
      confirm: { type: 'boolean' },
    },
    required: ['entryId', 'reason', 'confirm'],
  },
  allowedRoles: ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'],
  mutation: true,
  handler: async (
    args: { entryId: string; reason: string; confirm: boolean },
    ctx,
  ) => {
    if (!args.confirm) {
      return { ok: false, error: 'confirm:true is required' };
    }
    const entry = await prisma.financeEntry.findUnique({
      where: { id: args.entryId },
      select: {
        id: true,
        status: true,
        firmId: true,
        title: true,
        amount: true,
        createdById: true,
        type: true,
      },
    });
    if (!entry) return { ok: false, error: 'not_found' };
    if (ctx.firmId && entry.firmId && entry.firmId !== ctx.firmId) {
      return { ok: false, error: 'wrong_firm' };
    }
    await prisma.financeEntry.update({
      where: { id: args.entryId },
      data: {
        status: 'DRAFT',
        updatedById: ctx.user.id,
        remindAt: null,
      },
    });
    await notifyFinanceActor(
      {
        id: entry.id,
        title: entry.title,
        type: entry.type,
        amount: Number(entry.amount),
        createdById: entry.createdById,
      },
      'REJECTED',
      ctx.user.id,
    );
    return { ok: true, entryId: entry.id, reason: args.reason };
  },
});

registerTool({
  name: 'daily_summary',
  description:
    'Зведення дня/тижня для менеджера: pending апруви, foreman reports, нові витрати. Без зарплат.',
  parameters: {
    type: 'object',
    properties: {
      scope: { type: 'string', description: 'today | week' },
    },
  },
  allowedRoles: ['SUPER_ADMIN', 'MANAGER', 'FINANCIER', 'ENGINEER'],
  handler: async (args: { scope?: string }, ctx) => {
    const since = new Date();
    if (args.scope === 'week') {
      since.setDate(since.getDate() - 7);
    } else {
      since.setHours(0, 0, 0, 0);
    }
    const firmFilter = ctx.firmScope.firmId
      ? { firmId: ctx.firmScope.firmId }
      : {};

    const [
      pendingFinance,
      pendingReports,
      newEntries,
      tasksDueSoon,
    ] = await Promise.all([
      prisma.financeEntry.count({
        where: { status: 'PENDING', isArchived: false, ...firmFilter },
      }),
      prisma.foremanReport.count({
        where: { status: 'PENDING_APPROVAL', ...firmFilter },
      }),
      prisma.financeEntry.count({
        where: { createdAt: { gte: since }, isArchived: false, ...firmFilter },
      }),
      prisma.task.count({
        where: {
          assignees: { some: { userId: ctx.user.id } },
          status: { in: ['TODO', 'IN_PROGRESS'] },
          dueDate: { gte: new Date(), lte: new Date(Date.now() + 3 * 86400000) },
        },
      }),
    ]);

    return {
      ok: true,
      scope: args.scope === 'week' ? 'week' : 'today',
      pendingFinanceApprovals: pendingFinance,
      pendingForemanReports: pendingReports,
      newFinanceEntries: newEntries,
      myTasksDueSoon: tasksDueSoon,
    };
  },
});

registerTool({
  name: 'get_project_budget',
  description:
    'Бюджет проекту: план vs факт. ВАЖЛИВО: salaries показує ТІЛЬКИ SUPER_ADMIN.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
    },
    required: ['projectId'],
  },
  allowedRoles: ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'],
  handler: async (args: { projectId: string }, ctx) => {
    const project = await prisma.project.findFirst({
      where: {
        id: args.projectId,
        ...(ctx.firmScope.firmId ? { firmId: ctx.firmScope.firmId } : {}),
      },
      select: {
        id: true,
        title: true,
        totalBudget: true,
        totalPaid: true,
        currentStage: true,
        stageProgress: true,
      },
    });
    if (!project) return { ok: false, error: 'not_found' };

    const facts = await prisma.financeEntry.findMany({
      where: {
        projectId: project.id,
        kind: 'FACT',
        isArchived: false,
        status: { in: ['APPROVED', 'PAID'] },
      },
      select: { type: true, amount: true, category: true },
    });

    let expenseTotal = 0;
    let incomeTotal = 0;
    let salaryTotal = 0;
    for (const f of facts) {
      const amt = Number(f.amount);
      if (f.category?.toLowerCase().includes('зп') || f.category?.toLowerCase().includes('зарплат')) {
        salaryTotal += amt;
      }
      if (f.type === 'INCOME') incomeTotal += amt;
      else expenseTotal += amt;
    }

    const base = {
      ok: true,
      projectId: project.id,
      title: project.title,
      stage: project.currentStage,
      stageProgress: project.stageProgress,
      totalBudget: Number(project.totalBudget),
      totalPaid: Number(project.totalPaid),
      factExpenseTotal: expenseTotal,
      factIncomeTotal: incomeTotal,
      url: urls.project(project.id),
    };

    if (ctx.role === 'SUPER_ADMIN') {
      return { ...base, salaries: salaryTotal };
    }
    // STRICT: salaries прибрані для не-SUPER_ADMIN ролей (memory: project_metrum_finance_access_rule)
    return base;
  },
});
