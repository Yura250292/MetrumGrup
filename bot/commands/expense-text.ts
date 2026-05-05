import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { parseExpenseText, type ParsedExpense } from '../../src/lib/ai/parse-expense-text';

const APPROVER_ROLES = ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'] as const;
type ApproverRole = (typeof APPROVER_ROLES)[number];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatAmount(n: number): string {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}

function formatExpenseLine(e: ParsedExpense): string {
  const icon = e.costType === 'MATERIAL' ? '📦' : '🔨';
  const label = e.costType === 'MATERIAL' ? 'Матеріал' : 'Робота';
  const qty = e.quantity ? ` — ${e.quantity}${e.unit ? ' ' + e.unit : ''}` : '';
  const price = e.unitPrice ? ` × ${formatAmount(e.unitPrice)}` : '';
  return `${icon} <b>${label}:</b> ${escapeHtml(e.title)}${qty}${price} = ${formatAmount(e.amount)} грн`;
}

/**
 * /link <slug-or-id> — bind current Telegram group to a Project.
 * Only callable in groups by users with MANAGER+ role linked to Metrum.
 */
export async function linkProjectCommand(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) {
    await ctx.reply('⚠️ Команда /link працює лише в групових чатах.');
    return;
  }

  const text = (ctx.message && 'text' in ctx.message ? ctx.message.text : '') || '';
  const arg = text.replace(/^\/link(@\w+)?/i, '').trim();
  if (!arg) {
    await ctx.reply(
      '⚠️ Вкажи slug або id проекту:\n<code>/link atb-2026</code>',
      { parse_mode: 'HTML' },
    );
    return;
  }

  const fromId = ctx.from?.id;
  if (!fromId) return;

  const { prisma } = await import('../../src/lib/prisma');

  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { user: { select: { id: true, role: true, firmId: true, isActive: true } } },
  });
  const linked = botUser?.user;
  if (!linked || !linked.isActive) {
    await ctx.reply(
      '⛔️ Спочатку прив\'яжи Metrum-акаунт. Напиши боту в особисті: /start',
    );
    return;
  }
  if (!APPROVER_ROLES.includes(linked.role as ApproverRole)) {
    await ctx.reply('⛔️ Тільки менеджер/фінансист може прив\'язувати проект.');
    return;
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ slug: arg }, { id: arg }] },
    select: { id: true, title: true, slug: true, firmId: true, telegramChatId: true },
  });
  if (!project) {
    await ctx.reply(`❌ Проект "${arg}" не знайдено.`);
    return;
  }
  if (linked.firmId && project.firmId && linked.firmId !== project.firmId) {
    await ctx.reply('⛔️ Цей проект належить іншій фірмі.');
    return;
  }

  const chatId = BigInt(chat.id);
  const conflict = await prisma.project.findFirst({
    where: { telegramChatId: chatId, NOT: { id: project.id } },
    select: { id: true, title: true },
  });
  if (conflict) {
    await ctx.reply(
      `⚠️ Ця група вже прив'язана до проекту "${escapeHtml(conflict.title)}". Спочатку відв'яжи через /unlink в тому проекті.`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: {
      telegramChatId: chatId,
      telegramLinkedAt: new Date(),
      telegramLinkedById: linked.id,
    },
  });

  await ctx.reply(
    `✅ Група прив'язана до проекту <b>${escapeHtml(project.title)}</b>.\n\n` +
      `Тепер майстри можуть писати сюди витрати у вільній формі — бот розпізнає і відправить менеджеру на підтвердження.`,
    { parse_mode: 'HTML' },
  );
}

/**
 * /unlink — remove current group's binding to a project.
 */
export async function unlinkProjectCommand(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return;

  const fromId = ctx.from?.id;
  if (!fromId) return;

  const { prisma } = await import('../../src/lib/prisma');
  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { user: { select: { id: true, role: true, isActive: true } } },
  });
  const linked = botUser?.user;
  if (!linked || !linked.isActive || !APPROVER_ROLES.includes(linked.role as ApproverRole)) {
    await ctx.reply('⛔️ Тільки менеджер може відв\'язувати групи.');
    return;
  }

  const updated = await prisma.project.updateMany({
    where: { telegramChatId: BigInt(chat.id) },
    data: { telegramChatId: null, telegramLinkedAt: null, telegramLinkedById: null },
  });
  if (updated.count > 0) {
    await ctx.reply('✅ Група відв\'язана від проекту.');
  } else {
    await ctx.reply('ℹ️ Ця група не була прив\'язана.');
  }
}

/**
 * Group text handler: detects expense reports from masters and creates a draft
 * with confirm-buttons. Returns true when message was handled (so the global
 * text handler can skip its own logic).
 */
export async function handleGroupExpenseText(ctx: BotContext): Promise<boolean> {
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return false;

  const msg = ctx.message;
  if (!msg || !('text' in msg)) return false;
  const text = msg.text;
  if (!text || text.startsWith('/')) return false;

  const fromId = ctx.from?.id;
  if (!fromId) return false;

  const { prisma } = await import('../../src/lib/prisma');

  const project = await prisma.project.findFirst({
    where: { telegramChatId: BigInt(chat.id) },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) return false; // group not linked — let other handlers deal

  // From here on the chat is "ours" — handle and return true even on errors.
  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: {
      username: true,
      firstName: true,
      user: { select: { id: true, isActive: true, firmId: true } },
    },
  });
  const author = botUser?.user;
  if (!author || !author.isActive) {
    const handle = ctx.from?.username ? '@' + ctx.from.username : ctx.from?.first_name || '';
    await ctx.reply(
      `${handle ? handle + ', ' : ''}спочатку прив'яжи Metrum-акаунт — напиши боту в особисті: /start`,
    );
    return true;
  }
  if (author.firmId && project.firmId && author.firmId !== project.firmId) {
    // silently skip — user from other firm shouldn't even be writing here
    return true;
  }

  let parsed: ParsedExpense[];
  try {
    parsed = await parseExpenseText(text);
  } catch (err) {
    console.error('[expense-text] parser error:', err);
    return true;
  }
  if (parsed.length === 0) return false; // not an expense — fall through to other handlers

  const draft = await prisma.pendingExpenseDraft.create({
    data: {
      chatId: BigInt(chat.id),
      messageId: msg.message_id,
      authorUserId: author.id,
      projectId: project.id,
      parsedJson: parsed as unknown as object,
      rawText: text.slice(0, 4000),
    },
    select: { id: true },
  });

  const total = parsed.reduce((s, e) => s + e.amount, 0);
  const lines = parsed.map(formatExpenseLine).join('\n');
  const lowConf = parsed.filter((e) => e.confidence < 0.7);
  const warning = lowConf.length > 0
    ? `\n\n⚠️ <i>Перевір — ${lowConf.length} рядок(ів) розпізнано неоднозначно</i>`
    : '';

  await ctx.reply(
    `🧾 <b>Зрозумів ${parsed.length} витрат на ${escapeHtml(project.title)}</b>\n\n` +
      lines +
      `\n\n<b>Разом:</b> ${formatAmount(total)} грн` +
      warning,
    {
      parse_mode: 'HTML',
      reply_parameters: { message_id: msg.message_id },
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Відправити менеджеру', `exp_send:${draft.id}`)],
        [Markup.button.callback('❌ Скасувати', `exp_cancel:${draft.id}`)],
      ]),
    },
  );
  return true;
}

/**
 * Callback: exp_send:<draftId> — author confirms parsing, create FinanceEntry
 * × N with status=PENDING and notify approvers.
 */
export async function handleExpenseSendCallback(ctx: BotContext, draftId: string) {
  const fromId = ctx.from?.id;
  if (!fromId) {
    await ctx.answerCbQuery();
    return;
  }

  const { prisma } = await import('../../src/lib/prisma');

  const draft = await prisma.pendingExpenseDraft.findUnique({
    where: { id: draftId },
    include: {
      // Prisma Json is unstructured — parse on use
    },
  });
  if (!draft) {
    await ctx.answerCbQuery('Draft вже не дійсний', { show_alert: true });
    return;
  }

  const tgUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { userId: true },
  });
  if (!tgUser?.userId || tgUser.userId !== draft.authorUserId) {
    await ctx.answerCbQuery('Підтвердити може тільки автор повідомлення', { show_alert: true });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: draft.projectId },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) {
    await ctx.answerCbQuery('Проект не знайдено');
    return;
  }

  const items = draft.parsedJson as unknown as ParsedExpense[];

  const username = ctx.from?.username ? '@' + ctx.from.username : ctx.from?.first_name || 'TG';

  await ctx.answerCbQuery('⏳ Створюю записи...');

  const created: { id: string; title: string; amount: number }[] = [];
  for (const item of items) {
    const category = item.costType === 'MATERIAL' ? 'materials' : 'subcontractors';
    const entry = await prisma.financeEntry.create({
      data: {
        type: 'EXPENSE',
        kind: 'FACT',
        status: 'PENDING',
        amount: item.amount,
        currency: item.currency || 'UAH',
        occurredAt: new Date(),
        projectId: project.id,
        firmId: project.firmId ?? null,
        category,
        costType: item.costType,
        title: item.title,
        description: `Telegram (${username}): ${item.rawLine || draft.rawText.slice(0, 200)}`,
        createdById: draft.authorUserId,
        source: 'MANUAL',
      },
      select: { id: true, title: true, amount: true },
    });
    created.push({ id: entry.id, title: entry.title, amount: Number(entry.amount) });
  }

  // Fire notifications (in-app + email + push + Telegram DM with buttons).
  // Done after creation loop so we don't slow down the per-row creation.
  const { notifyFinanceApprovers } = await import('../../src/lib/financing/notify-approval');
  for (const c of created) {
    await notifyFinanceApprovers(
      {
        id: c.id,
        title: c.title,
        type: 'EXPENSE',
        amount: c.amount,
        projectTitle: project.title,
      },
      draft.authorUserId,
    );
  }

  await prisma.pendingExpenseDraft.delete({ where: { id: draftId } }).catch(() => {});

  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.editMessageText(
    `📨 <b>Відправлено менеджеру</b> (${created.length} запис${created.length === 1 ? '' : 'ів'}).\n\n` +
      `Чекай підтвердження — як менеджер натисне "✅", запис стане факт-витратою.`,
    { parse_mode: 'HTML' },
  ).catch(() => {});
}

/**
 * Callback: exp_cancel:<draftId> — author drops the draft.
 */
export async function handleExpenseCancelCallback(ctx: BotContext, draftId: string) {
  const fromId = ctx.from?.id;
  if (!fromId) {
    await ctx.answerCbQuery();
    return;
  }
  const { prisma } = await import('../../src/lib/prisma');
  const draft = await prisma.pendingExpenseDraft.findUnique({
    where: { id: draftId },
    select: { authorUserId: true },
  });
  if (!draft) {
    await ctx.answerCbQuery();
    return;
  }
  const tgUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { userId: true },
  });
  if (tgUser?.userId !== draft.authorUserId) {
    await ctx.answerCbQuery('Скасувати може тільки автор', { show_alert: true });
    return;
  }
  await prisma.pendingExpenseDraft.delete({ where: { id: draftId } }).catch(() => {});
  await ctx.answerCbQuery('Скасовано');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.editMessageText('❌ <i>Скасовано</i>', { parse_mode: 'HTML' }).catch(() => {});
}
