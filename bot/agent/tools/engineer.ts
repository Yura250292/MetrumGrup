import { prisma } from '../../../src/lib/prisma';
import { registerTool } from './registry';
import { urls } from '../urls';

registerTool({
  name: 'my_tasks',
  description:
    'Список РОБОЧИХ ЗАДАЧ (Task entity) призначених на поточного користувача. Aliases: задача, задачі, завдання, тікет, todo, тудушка, моя робота, що в роботі, що мені робити. НЕ ПЛУТАЙ з ПРОЕКТАМИ (Project) — для проектів є search_projects.',
  parameters: {
    type: 'object',
    properties: {
      onlyOpen: {
        type: 'boolean',
        description: 'true = тільки незавершені (за замовчуванням true)',
      },
      limit: { type: 'number', description: 'За замовчуванням 15, макс 50' },
    },
  },
  allowedRoles: [
    'SUPER_ADMIN',
    'MANAGER',
    'FINANCIER',
    'ENGINEER',
    'FOREMAN',
    'HR',
    'OWNER',
  ],
  handler: async (
    args: { onlyOpen?: boolean; limit?: number },
    ctx,
  ) => {
    const onlyOpen = args.onlyOpen !== false;
    const limit = Math.min(args.limit ?? 15, 50);
    const tasks = await prisma.task.findMany({
      where: {
        assignees: { some: { userId: ctx.user.id } },
        isArchived: false,
        ...(onlyOpen ? { status: { isDone: false } } : {}),
        ...(ctx.firmScope.firmId
          ? { project: { firmId: ctx.firmScope.firmId } }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: limit,
      include: {
        project: { select: { id: true, title: true } },
        status: { select: { id: true, name: true, isDone: true } },
      },
    });
    const now = Date.now();
    return {
      ok: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        project: t.project.title,
        projectUrl: urls.project(t.project.id),
        status: t.status.name,
        statusIsDone: t.status.isDone,
        dueDate: t.dueDate,
        overdue: t.dueDate ? t.dueDate.getTime() < now : false,
        url: urls.task(t.id),
      })),
    };
  },
});

registerTool({
  name: 'update_task_status',
  description:
    'Змінити статус задачі. Дозволено assignee задачі або менеджеру. confirm:true обовʼязково.',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      statusName: {
        type: 'string',
        description:
          'Назва статусу в проекті задачі (наприклад "Done", "In Progress", "To Do")',
      },
      confirm: { type: 'boolean' },
    },
    required: ['taskId', 'statusName', 'confirm'],
  },
  allowedRoles: [
    'SUPER_ADMIN',
    'MANAGER',
    'ENGINEER',
    'FOREMAN',
    'OWNER',
  ],
  mutation: true,
  handler: async (
    args: { taskId: string; statusName: string; confirm: boolean },
    ctx,
  ) => {
    if (!args.confirm) return { ok: false, error: 'confirm:true required' };

    const task = await prisma.task.findFirst({
      where: {
        id: args.taskId,
        ...(ctx.firmScope.firmId
          ? { project: { firmId: ctx.firmScope.firmId } }
          : {}),
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) return { ok: false, error: 'not_found' };

    const isAssignee = task.assignees.some((a) => a.userId === ctx.user.id);
    const isPrivileged =
      ctx.role === 'MANAGER' || ctx.role === 'SUPER_ADMIN' || ctx.role === 'OWNER';
    if (!isAssignee && !isPrivileged) {
      return { ok: false, error: 'not_assignee' };
    }

    const status = await prisma.taskStatus.findFirst({
      where: {
        projectId: task.projectId,
        name: { equals: args.statusName, mode: 'insensitive' },
      },
      select: { id: true, name: true, isDone: true },
    });
    if (!status) {
      return {
        ok: false,
        error: 'status_not_found',
        hint:
          'Доступні статуси проекту: ' +
          (
            await prisma.taskStatus.findMany({
              where: { projectId: task.projectId },
              select: { name: true },
            })
          )
            .map((s) => s.name)
            .join(', '),
      };
    }

    await prisma.task.update({
      where: { id: task.id },
      data: {
        statusId: status.id,
        completedAt: status.isDone ? new Date() : null,
      },
    });

    return { ok: true, taskId: task.id, newStatus: status.name };
  },
});

registerTool({
  name: 'add_task_comment',
  description: 'Додати коментар до задачі. Жодного confirm — це звичайний коментар.',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['taskId', 'body'],
  },
  allowedRoles: [
    'SUPER_ADMIN',
    'MANAGER',
    'FINANCIER',
    'ENGINEER',
    'FOREMAN',
    'HR',
    'OWNER',
    'CLIENT',
  ],
  mutation: true,
  handler: async (
    args: { taskId: string; body: string },
    ctx,
  ) => {
    if (!args.body.trim()) return { ok: false, error: 'empty_body' };

    const task = await prisma.task.findFirst({
      where: {
        id: args.taskId,
        ...(ctx.firmScope.firmId
          ? { project: { firmId: ctx.firmScope.firmId } }
          : {}),
      },
      select: { id: true, projectId: true },
    });
    if (!task) return { ok: false, error: 'not_found' };

    const comment = await prisma.comment.create({
      data: {
        entityType: 'TASK',
        entityId: task.id,
        authorId: ctx.user.id,
        body: args.body.trim().slice(0, 4000),
      },
      select: { id: true, createdAt: true },
    });

    return { ok: true, commentId: comment.id, createdAt: comment.createdAt };
  },
});
