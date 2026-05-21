import { prisma } from '../../../src/lib/prisma';
import { registerTool } from './registry';

registerTool({
  name: 'get_time',
  description:
    'Повертає поточний час та дату у часовому поясі Europe/Kyiv. Викликай для будь-яких розрахунків що залежать від "сьогодні", "вчора", дедлайнів.',
  parameters: { type: 'object', properties: {} },
  allowedRoles: [
    'SUPER_ADMIN',
    'OWNER',
    'MANAGER',
    'FINANCIER',
    'ENGINEER',
    'FOREMAN',
    'HR',
    'CLIENT',
    'USER',
  ],
  handler: async () => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      kyivTime: now.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
    };
  },
});

registerTool({
  name: 'search_projects',
  description:
    'Пошук проектів за частковою назвою або статусом. Повертає до 10 збігів з firmId-ізоляцією.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Частина назви проекту' },
      status: {
        type: 'string',
        description: 'Опційний фільтр: PLANNING|ACTIVE|COMPLETED|ON_HOLD|CANCELLED',
      },
    },
  },
  allowedRoles: [
    'SUPER_ADMIN',
    'OWNER',
    'MANAGER',
    'FINANCIER',
    'ENGINEER',
    'FOREMAN',
    'HR',
    'CLIENT',
  ],
  handler: async (args: { query?: string; status?: string }, ctx) => {
    const where: Record<string, unknown> = {};
    if (ctx.firmScope.firmId) where.firmId = ctx.firmScope.firmId;
    if (args.query) {
      where.title = { contains: args.query, mode: 'insensitive' };
    }
    if (args.status) where.status = args.status;
    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        currentStage: true,
        stageProgress: true,
      },
    });
    return { projects };
  },
});

registerTool({
  name: 'get_project_info',
  description:
    'Деталі одного проекту: статус, етап, прогрес. БЕЗ зарплат та чутливих фінансових даних.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Або точний projectId, або точна назва' },
    },
    required: ['projectId'],
  },
  allowedRoles: [
    'SUPER_ADMIN',
    'OWNER',
    'MANAGER',
    'FINANCIER',
    'ENGINEER',
    'FOREMAN',
    'HR',
    'CLIENT',
  ],
  handler: async (args: { projectId: string }, ctx) => {
    const baseWhere = ctx.firmScope.firmId ? { firmId: ctx.firmScope.firmId } : {};
    const project = await prisma.project.findFirst({
      where: {
        ...baseWhere,
        OR: [{ id: args.projectId }, { title: args.projectId }],
      },
      select: {
        id: true,
        title: true,
        status: true,
        currentStage: true,
        stageProgress: true,
        startDate: true,
        endDate: true,
        client: { select: { name: true } },
        manager: { select: { name: true } },
      },
    });
    if (!project) return { found: false };
    return { found: true, project };
  },
});
