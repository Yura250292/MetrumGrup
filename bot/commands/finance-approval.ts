import { BotContext } from '../types';

const APPROVER_ROLES = ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'] as const;
type ApproverRole = (typeof APPROVER_ROLES)[number];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function resolveApprover(telegramId: number) {
  const { prisma } = await import('../../src/lib/prisma');
  const tgUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { user: { select: { id: true, role: true, firmId: true, isActive: true, name: true } } },
  });
  const linked = tgUser?.user;
  if (!linked || !linked.isActive) return null;
  if (!APPROVER_ROLES.includes(linked.role as ApproverRole)) return null;
  return linked;
}

/**
 * fin_approve:<entryId> — manager approves a PENDING FinanceEntry from TG DM.
 */
export async function handleFinanceApproveCallback(ctx: BotContext, entryId: string) {
  const fromId = ctx.from?.id;
  if (!fromId) {
    await ctx.answerCbQuery();
    return;
  }
  const approver = await resolveApprover(fromId);
  if (!approver) {
    await ctx.answerCbQuery('Недостатньо прав', { show_alert: true });
    return;
  }

  const { prisma } = await import('../../src/lib/prisma');
  const entry = await prisma.financeEntry.findUnique({
    where: { id: entryId },
    select: { id: true, status: true, firmId: true, title: true, amount: true, createdById: true, type: true },
  });
  if (!entry) {
    await ctx.answerCbQuery('Запис не знайдено', { show_alert: true });
    return;
  }
  if (approver.firmId && entry.firmId && approver.firmId !== entry.firmId) {
    await ctx.answerCbQuery('Інша фірма', { show_alert: true });
    return;
  }
  if (entry.status === 'APPROVED' || entry.status === 'PAID') {
    await ctx.answerCbQuery('Уже підтверджено');
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    return;
  }

  await prisma.financeEntry.update({
    where: { id: entryId },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedById: approver.id,
      updatedById: approver.id,
      remindAt: null,
    },
  });

  // Notify the original creator (master) — uses existing helper.
  const { notifyFinanceActor } = await import('../../src/lib/financing/notify-approval');
  await notifyFinanceActor(
    {
      id: entry.id,
      title: entry.title,
      type: entry.type,
      amount: Number(entry.amount),
      createdById: entry.createdById,
    },
    'APPROVED',
    approver.id,
  );

  await ctx.answerCbQuery('✅ Підтверджено');
  const original = ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message
    ? ctx.callbackQuery.message.text || ''
    : '';
  await ctx.editMessageText(
    escapeHtml(original) +
      `\n\n✅ <b>Підтверджено</b> ${escapeHtml(approver.name || '')} · ${new Date().toLocaleString('uk-UA')}`,
    { parse_mode: 'HTML' },
  ).catch(() => {});
}

/**
 * fin_reject:<entryId> — manager rejects, entry goes back to DRAFT.
 */
export async function handleFinanceRejectCallback(ctx: BotContext, entryId: string) {
  const fromId = ctx.from?.id;
  if (!fromId) {
    await ctx.answerCbQuery();
    return;
  }
  const approver = await resolveApprover(fromId);
  if (!approver) {
    await ctx.answerCbQuery('Недостатньо прав', { show_alert: true });
    return;
  }

  const { prisma } = await import('../../src/lib/prisma');
  const entry = await prisma.financeEntry.findUnique({
    where: { id: entryId },
    select: { id: true, status: true, firmId: true, title: true, amount: true, createdById: true, type: true },
  });
  if (!entry) {
    await ctx.answerCbQuery('Запис не знайдено', { show_alert: true });
    return;
  }
  if (approver.firmId && entry.firmId && approver.firmId !== entry.firmId) {
    await ctx.answerCbQuery('Інша фірма', { show_alert: true });
    return;
  }

  await prisma.financeEntry.update({
    where: { id: entryId },
    data: {
      status: 'DRAFT',
      updatedById: approver.id,
      remindAt: null,
    },
  });

  const { notifyFinanceActor } = await import('../../src/lib/financing/notify-approval');
  await notifyFinanceActor(
    {
      id: entry.id,
      title: entry.title,
      type: entry.type,
      amount: Number(entry.amount),
      createdById: entry.createdById,
    },
    'REJECTED',
    approver.id,
  );

  await ctx.answerCbQuery('❌ Відхилено');
  const original = ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message
    ? ctx.callbackQuery.message.text || ''
    : '';
  await ctx.editMessageText(
    escapeHtml(original) +
      `\n\n❌ <b>Відхилено</b> ${escapeHtml(approver.name || '')} · ${new Date().toLocaleString('uk-UA')}`,
    { parse_mode: 'HTML' },
  ).catch(() => {});
}
