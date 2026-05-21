import { prisma } from '../../../src/lib/prisma';
import {
  parseExpenseText,
  type ParsedExpense,
} from '../../../src/lib/ai/parse-expense-text';
import { classifyExpenseImage } from '../../../src/lib/ai/classify-expense-image';
import { downloadFromR2 } from '../../../src/lib/foreman/r2';
import {
  fromParsedExpense,
  mergeForemanItems,
  type ForemanDraftItem,
} from '../../../src/lib/foreman/merge-items';
import { resolveSuppliersBulk } from '../../../src/lib/foreman/resolve-supplier';
import { sendTelegramNotification } from '../../../src/lib/notifications/telegram';
import { registerTool } from './registry';
import { urls } from '../urls';
import type { CostType } from '@prisma/client';

const ITEM_SCHEMA = {
  type: 'object' as const,
  properties: {
    costType: { type: 'string', description: 'MATERIAL або LABOR' },
    title: { type: 'string' },
    quantity: { type: 'number' },
    unit: { type: 'string' },
    unitPrice: { type: 'number' },
    amount: { type: 'number' },
    supplier: { type: 'string' },
  },
  required: ['costType', 'title', 'amount'],
};

function summarizeItems(items: ParsedExpense[] | ForemanDraftItem[]): {
  count: number;
  total: number;
  materialsTotal: number;
  laborTotal: number;
} {
  let total = 0;
  let mat = 0;
  let lab = 0;
  for (const it of items) {
    const amt = Number(it.amount) || 0;
    total += amt;
    if (it.costType === 'MATERIAL') mat += amt;
    else if (it.costType === 'LABOR') lab += amt;
  }
  return { count: items.length, total, materialsTotal: mat, laborTotal: lab };
}

registerTool({
  name: 'parse_expense_text',
  description:
    'Розпізнає витрати з вільного тексту виконроба (матеріали/роботи/суми/постачальники). Повертає structured items для прев\'ю — НЕ створює запис у БД. Використовуй ДО submit_foreman_report щоб показати юзеру що буде записано.',
  parameters: {
    type: 'object',
    properties: {
      rawText: {
        type: 'string',
        description: 'Текст від користувача з описом витрат',
      },
    },
    required: ['rawText'],
  },
  allowedRoles: ['FOREMAN', 'MANAGER', 'SUPER_ADMIN'],
  handler: async (args: { rawText: string }) => {
    try {
      const items = await parseExpenseText(args.rawText);
      return { ok: true, items, summary: summarizeItems(items) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

registerTool({
  name: 'parse_expense_image',
  description:
    'OCR + класифікація витрат із фото чека/накладної (через R2 key). НЕ створює запис у БД. Використовуй коли користувач прислав фото.',
  parameters: {
    type: 'object',
    properties: {
      r2Key: { type: 'string', description: 'Ключ файлу у R2' },
      mimeType: { type: 'string', description: 'image/jpeg, image/png тощо' },
    },
    required: ['r2Key', 'mimeType'],
  },
  allowedRoles: ['FOREMAN', 'MANAGER', 'SUPER_ADMIN'],
  handler: async (args: { r2Key: string; mimeType: string }) => {
    try {
      const buf = await downloadFromR2(args.r2Key);
      const cls = await classifyExpenseImage(buf, args.mimeType);
      const items: ParsedExpense[] =
        cls.type === 'expense_table'
          ? cls.items
          : cls.type === 'expense_total_only' && cls.totalAmount
            ? [
                {
                  costType: 'MATERIAL',
                  title: cls.summary || 'Витрата (підсумок з фото)',
                  amount: cls.totalAmount,
                  currency: 'UAH',
                  confidence: 0.5,
                  rawLine: '',
                } as ParsedExpense,
              ]
            : [];
      return {
        ok: true,
        kind: cls.type,
        items,
        summary: summarizeItems(items),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

registerTool({
  name: 'submit_foreman_report',
  description:
    'Створює звіт виконроба (PENDING_APPROVAL) у БД і нотифікує менеджера. Викликати ТІЛЬКИ після того як користувач підтвердив items наступним повідомленням. confirm:true обов\'язково.',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project ID (отриманий з get_project_info або search_projects)',
      },
      items: {
        type: 'array',
        description:
          'Список витрат (як отримано з parse_expense_text / parse_expense_image)',
        items: ITEM_SCHEMA,
      },
      occurredAt: {
        type: 'string',
        description: 'ISO дата витрати; за замовчуванням сьогодні',
      },
      rawText: {
        type: 'string',
        description: 'Вихідний текст від користувача для аудиту',
      },
      attachmentR2Keys: {
        type: 'array',
        description: 'Ключі вкладень у R2',
        items: { type: 'string' },
      },
      confirm: {
        type: 'boolean',
        description: 'Має бути true. Захист від випадкового виклику.',
      },
    },
    required: ['projectId', 'items', 'confirm'],
  },
  allowedRoles: ['FOREMAN', 'SUPER_ADMIN'],
  mutation: true,
  handler: async (
    args: {
      projectId: string;
      items: Array<{
        costType: string;
        title: string;
        quantity?: number;
        unit?: string;
        unitPrice?: number;
        amount: number;
        supplier?: string;
      }>;
      occurredAt?: string;
      rawText?: string;
      attachmentR2Keys?: string[];
      confirm: boolean;
    },
    ctx,
  ) => {
    if (!args.confirm) {
      return {
        ok: false,
        error: 'confirm:true is required — спочатку отримай підтвердження',
      };
    }
    if (!args.items.length) {
      return { ok: false, error: 'Items list is empty' };
    }

    const project = await prisma.project.findFirst({
      where: {
        id: args.projectId,
        ...(ctx.firmScope.firmId ? { firmId: ctx.firmScope.firmId } : {}),
      },
      select: { id: true, title: true, firmId: true, managerId: true },
    });
    if (!project) {
      return { ok: false, error: 'Project not found or out of firm scope' };
    }

    const occurredAt = args.occurredAt ? new Date(args.occurredAt) : new Date();
    if (isNaN(occurredAt.getTime())) {
      return { ok: false, error: 'Invalid occurredAt date' };
    }

    const drafts: ForemanDraftItem[] = args.items.map((it) => ({
      costType: (it.costType === 'LABOR' ? 'LABOR' : 'MATERIAL') as CostType,
      title: it.title.slice(0, 200),
      unit: it.unit ?? null,
      quantity: it.quantity ?? null,
      unitPrice: it.unitPrice ?? null,
      amount: Number(it.amount) || 0,
      currency: 'UAH',
      confidence: 0.85,
      supplier: it.supplier ?? null,
    }));
    const merged = mergeForemanItems([drafts]).filter((it) => it.amount > 0);
    if (!merged.length) {
      return { ok: false, error: 'All items had zero amount after merge' };
    }

    const resolutions = await resolveSuppliersBulk({
      firmId: project.firmId ?? null,
      guesses: merged.map((it) => ({ guess: it.supplier ?? null })),
    });

    const report = await prisma.foremanReport.create({
      data: {
        projectId: project.id,
        firmId: project.firmId,
        createdById: ctx.user.id,
        status: 'PENDING_APPROVAL',
        rawText: args.rawText ?? null,
        occurredAt,
        currency: 'UAH',
        submittedAt: new Date(),
        attachments: args.attachmentR2Keys?.length
          ? {
              create: args.attachmentR2Keys.map((key) => ({
                r2Key: key,
                originalName: key.split('/').pop() ?? key,
                mimeType: 'application/octet-stream',
                size: 0,
                uploadedById: ctx.user.id,
              })),
            }
          : undefined,
        items: {
          create: merged.map((it, idx) => ({
            costType: it.costType,
            title: it.title,
            unit: it.unit,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            amount: it.amount,
            currency: it.currency,
            confidence: it.confidence,
            sortOrder: idx,
            counterpartyId: resolutions[idx]?.counterpartyId ?? null,
            supplierGuess: resolutions[idx]?.supplierGuess ?? null,
          })),
        },
      },
      select: { id: true },
    });

    const sum = summarizeItems(merged);

    // Знайти менеджерів у тій же фірмі та нотифікувати
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ['MANAGER', 'SUPER_ADMIN'] },
        firmId: project.firmId ?? undefined,
        isActive: true,
      },
      select: { id: true },
      take: 5,
    });
    await Promise.all(
      managers.map((m) =>
        sendTelegramNotification(m.id, {
          title: '📥 Новий звіт виконроба',
          body: `Проект: ${project.title}\nПозицій: ${sum.count}\nСума: ${sum.total.toFixed(0)} ₴\nВід: ${ctx.user.name ?? ctx.user.email ?? ctx.user.id}`,
          url: `/admin-v2/foreman-reports/${report.id}`,
        }).catch((err) => {
          console.warn('[bot-agent] notify manager failed:', err);
        }),
      ),
    );

    return {
      ok: true,
      reportId: report.id,
      project: project.title,
      ...sum,
      managersNotified: managers.length,
      url: urls.foremanReport(report.id),
    };
  },
});

registerTool({
  name: 'get_my_foreman_reports',
  description: 'Список останніх звітів виконроба поточного користувача.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description:
          'DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|CANCELLED — опційний фільтр',
      },
      limit: { type: 'number', description: 'За замовчуванням 10, макс 30' },
    },
  },
  allowedRoles: ['FOREMAN', 'SUPER_ADMIN'],
  handler: async (
    args: { status?: string; limit?: number },
    ctx,
  ) => {
    const limit = Math.min(args.limit ?? 10, 30);
    const reports = await prisma.foremanReport.findMany({
      where: {
        createdById: ctx.user.id,
        ...(args.status && /^(DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|CANCELLED)$/.test(args.status)
          ? { status: args.status as never }
          : {}),
        ...(ctx.firmScope.firmId ? { firmId: ctx.firmScope.firmId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        project: { select: { title: true } },
        items: { select: { amount: true } },
      },
    });
    return {
      ok: true,
      reports: reports.map((r) => ({
        id: r.id,
        project: r.project.title,
        status: r.status,
        occurredAt: r.occurredAt,
        submittedAt: r.submittedAt,
        rejectionReason: r.rejectionReason,
        itemCount: r.items.length,
        total: r.items.reduce((s, it) => s + Number(it.amount), 0),
        url: urls.foremanReport(r.id),
      })),
    };
  },
});
