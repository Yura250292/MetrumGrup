import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import type { BotContext } from '../types';
import { prisma } from '../../src/lib/prisma';
import {
  approveScan,
  createScanFromFile,
  rejectScan,
  ReceiptScanError,
} from '../../src/lib/services/receipt-scan-service';
import { GeminiUnavailableError } from '../../src/lib/ocr/gemini-client';

const WEB_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '';

const APPROVER_ROLES = new Set(['SUPER_ADMIN', 'MANAGER', 'FINANCIER']);

interface ResolvedBotUser {
  userId: string;
  role: string;
  name: string;
}

/**
 * Resolve the linked User for the current Telegram user. Strict: if there is
 * no TelegramBotUser.userId binding, the operation is refused so scans are
 * never attributed to the wrong person.
 */
async function resolveBotUser(ctx: BotContext): Promise<ResolvedBotUser | null> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return null;
  const tbu = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(telegramId) },
    include: { user: true },
  });
  if (!tbu?.user) return null;
  return { userId: tbu.user.id, role: tbu.user.role, name: tbu.user.name };
}

function chunkButtons(buttons: InlineKeyboardButton[], cols: number): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += cols) {
    rows.push(buttons.slice(i, i + cols));
  }
  return rows;
}

export async function scanwarehouseCommand(ctx: BotContext) {
  const botUser = await resolveBotUser(ctx);
  if (!botUser) {
    await ctx.reply(
      '🔒 Ваш Telegram не прив\'язаний до облікового запису користувача.\n\n' +
      'Зверніться до адміністратора, щоб у `TelegramBotUser` встановили `userId`.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const projects = await prisma.project.findMany({
    where: { status: { in: ['ACTIVE', 'DRAFT'] } },
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
    take: 30,
  });

  if (projects.length === 0) {
    await ctx.reply('Немає активних проєктів для прив\'язки накладної.');
    return;
  }

  const buttons: InlineKeyboardButton[] = projects.map((p) =>
    Markup.button.callback(p.title.slice(0, 60), `wh_proj:${p.id}`),
  );

  if (ctx.session) {
    ctx.session.pendingWarehouseScan = { step: 'awaiting_project' };
  }

  await ctx.reply(
    '📦 <b>Скан накладної на склад проєкту</b>\n\n' +
    'Оберіть проєкт. Після цього надішліть фото або PDF накладної — позиції впадуть на склад цього проєкту.\n\n' +
    '/cancel — скасувати',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(chunkButtons(buttons, 1)),
    },
  );
}

export async function handleProjectPickCallback(ctx: BotContext, projectId: string) {
  await ctx.answerCbQuery();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) {
    await ctx.reply('Проєкт не знайдено.');
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.pendingWarehouseScan = {
    step: 'awaiting_file',
    projectId: project.id,
    projectTitle: project.title,
  };

  await ctx.reply(
    `📂 Проєкт: <b>${project.title}</b>\n\n` +
    'Надішліть фото накладної або PDF файл. Я розпізнаю позиції і покажу результат для підтвердження.\n\n' +
    '/cancel — скасувати',
    { parse_mode: 'HTML' },
  );
}

async function handleScanFile(
  ctx: BotContext,
  fileId: string,
  fileName: string,
  mimeType: string,
) {
  const session = ctx.session?.pendingWarehouseScan;
  if (!session?.projectId) {
    await ctx.reply('Спершу запустіть /scanwarehouse і оберіть проєкт.');
    return;
  }

  const botUser = await resolveBotUser(ctx);
  if (!botUser) {
    await ctx.reply('🔒 Ваш Telegram не прив\'язаний до користувача. Зверніться до адміна.');
    return;
  }

  await ctx.reply('🔍 Завантажую і розпізнаю накладну…');
  await ctx.sendChatAction('typing');

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());

    const result = await createScanFromFile({
      projectId: session.projectId,
      buffer,
      mimeType,
      originalName: fileName,
      createdById: botUser.userId,
      source: 'TELEGRAM',
    });

    session.step = 'awaiting_confirmation';
    session.scanId = result.scanId;
    session.matchedCount = result.matchedCount;
    session.suggestedCount = result.suggestedCount;
    session.unmatchedCount = result.unmatchedCount;
    session.totalItems = result.totalItems;

    const allMatched = result.unmatchedCount === 0 && result.suggestedCount === 0;
    const reviewUrl = WEB_BASE_URL ? `${WEB_BASE_URL}/admin-v2/receipts/${result.scanId}` : null;

    let message = `✅ <b>Розпізнано</b>\n\n`;
    message += `Проєкт: <b>${session.projectTitle}</b>\n`;
    message += `Позицій: ${result.totalItems}\n`;
    message += `• Знайдено в довіднику: ${result.matchedCount}\n`;
    message += `• Потребують перевірки: ${result.suggestedCount}\n`;
    message += `• Не знайдено: ${result.unmatchedCount}\n\n`;

    if (allMatched && APPROVER_ROLES.has(botUser.role)) {
      message += '🎯 Усі позиції автоматично прив\'язані. Підтвердіть, щоб надійшли на склад.';
    } else if (!allMatched) {
      message += '⚠️ Є непідтверджені позиції — відкрийте на сайті для розбору.';
    } else {
      message += 'У вас немає прав на підтвердження. Передайте посилання адміну/менеджеру.';
    }

    const buttons: InlineKeyboardButton[][] = [];
    if (allMatched && APPROVER_ROLES.has(botUser.role)) {
      buttons.push([Markup.button.callback('✅ Підтвердити та провести на склад', `wh_approve:${result.scanId}`)]);
    }
    if (reviewUrl) {
      buttons.push([Markup.button.url('🌐 Відкрити на сайті', reviewUrl)]);
    }
    buttons.push([Markup.button.callback('❌ Відхилити', `wh_reject:${result.scanId}`)]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (err) {
    console.error('[scanwarehouse] error:', err);
    if (err instanceof ReceiptScanError) {
      await ctx.reply(`❌ ${err.message}`);
    } else if (err instanceof GeminiUnavailableError) {
      await ctx.reply(`❌ AI розпізнавання недоступне: ${err.message}`);
    } else {
      await ctx.reply('❌ Не вдалося обробити файл. Спробуйте інший.');
    }
  }
}

export async function handleWarehouseScanPhoto(ctx: BotContext) {
  if (!('message' in ctx.update) || !ctx.update.message) return false;
  const msg = ctx.update.message;
  if (!('photo' in msg) || !msg.photo) return false;

  const session = ctx.session?.pendingWarehouseScan;
  if (!session || session.step !== 'awaiting_file') return false;

  const photos = msg.photo;
  const largest = photos[photos.length - 1];
  await handleScanFile(ctx, largest.file_id, `photo-${Date.now()}.jpg`, 'image/jpeg');
  return true;
}

export async function handleWarehouseScanDocument(ctx: BotContext) {
  if (!('message' in ctx.update) || !ctx.update.message) return false;
  const msg = ctx.update.message;
  if (!('document' in msg) || !msg.document) return false;

  const session = ctx.session?.pendingWarehouseScan;
  if (!session || session.step !== 'awaiting_file') return false;

  const doc = msg.document;
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!doc.mime_type || !allowed.includes(doc.mime_type)) {
    await ctx.reply('Підтримуються лише JPG, PNG, WebP та PDF.');
    return true;
  }
  await handleScanFile(ctx, doc.file_id, doc.file_name ?? `document-${Date.now()}`, doc.mime_type);
  return true;
}

export async function handleWarehouseApproveCallback(ctx: BotContext, scanId: string) {
  await ctx.answerCbQuery();
  const botUser = await resolveBotUser(ctx);
  if (!botUser || !APPROVER_ROLES.has(botUser.role)) {
    await ctx.reply('⛔ Лише SUPER_ADMIN, MANAGER або FINANCIER можуть підтверджувати скани.');
    return;
  }

  try {
    const result = await approveScan(scanId, botUser.userId);
    await ctx.reply(
      `✅ <b>Підтверджено</b>\n\n` +
      `На склад проєкту проведено: ${result.postedItems} позицій\n` +
      (result.skippedItems > 0 ? `Пропущено: ${result.skippedItems}\n` : '') +
      `\nFinanceEntry: ${result.financeEntryId.slice(-6)}`,
      { parse_mode: 'HTML' },
    );
    if (ctx.session?.pendingWarehouseScan?.scanId === scanId) {
      ctx.session.pendingWarehouseScan = undefined;
    }
  } catch (err) {
    if (err instanceof ReceiptScanError) {
      await ctx.reply(`❌ ${err.message}`);
    } else {
      console.error('[scanwarehouse approve] error:', err);
      await ctx.reply('❌ Не вдалося підтвердити скан.');
    }
  }
}

export async function handleWarehouseRejectCallback(ctx: BotContext, scanId: string) {
  await ctx.answerCbQuery();
  const botUser = await resolveBotUser(ctx);
  if (!botUser || !APPROVER_ROLES.has(botUser.role)) {
    await ctx.reply('⛔ Лише SUPER_ADMIN, MANAGER або FINANCIER можуть відхиляти скани.');
    return;
  }

  try {
    await rejectScan(scanId, botUser.userId, 'Відхилено через Telegram-бот');
    await ctx.reply('❌ Скан відхилено.');
    if (ctx.session?.pendingWarehouseScan?.scanId === scanId) {
      ctx.session.pendingWarehouseScan = undefined;
    }
  } catch (err) {
    if (err instanceof ReceiptScanError) {
      await ctx.reply(`❌ ${err.message}`);
    } else {
      console.error('[scanwarehouse reject] error:', err);
      await ctx.reply('❌ Не вдалося відхилити скан.');
    }
  }
}
