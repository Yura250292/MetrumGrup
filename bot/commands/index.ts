import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../types';
import { startCommand } from './start';
import { adminCommand, logoutCommand } from './admin';
import { menuCommand } from './menu';
import { estimateCommand } from './estimate';
import { helpCommand } from './help';
import {
  receiptCommand,
  handleReceiptPhoto,
  handleReceiptDocument,
  handleFolderNavigationCallback,
  handleFolderBackCallback,
  handleSelectFolderCallback,
  handleReceiptConfirm,
  handleEditAmountCallback,
  handleReceiptTextInput,
  handleReceiptCancel,
  handleApproveCallback,
  handleRemindCallback,
  handleRejectCallback,
} from './receipt';
import {
  scanwarehouseCommand,
  handleProjectPickCallback,
  handleWarehouseScanPhoto,
  handleWarehouseScanDocument,
  handleWarehouseApproveCallback,
  handleWarehouseRejectCallback,
} from './scanwarehouse';
import {
  linkProjectCommand,
  unlinkProjectCommand,
  numCommand,
  handleForumTopicCreated,
  handleGroupExpenseText,
  handleGroupExpensePhoto,
  handleGroupExpenseDocument,
  handleExpenseSendCallback,
  handleExpenseCancelCallback,
} from './expense-text';
import {
  handleFinanceApproveCallback,
  handleFinanceRejectCallback,
} from './finance-approval';
import { requireAdmin } from '../middleware/auth';

export function registerCommands(bot: Telegraf<BotContext>) {
  // Публічні команди
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('admin', adminCommand);

  // Команди для linked Metrum-користувачів та legacy-адмінів
  bot.command('menu', menuCommand);
  bot.command('logout', logoutCommand);
  bot.command('estimate', requireAdmin, estimateCommand);
  bot.command('receipt', requireAdmin, receiptCommand);
  bot.command('scanwarehouse', requireAdmin, scanwarehouseCommand);

  // Group-binding commands — own role check inside (work in groups, not requireAdmin)
  bot.command('link', linkProjectCommand);
  bot.command('unlink', unlinkProjectCommand);
  bot.command('num', numCommand);

  // Auto-bind new forum topics by number from name
  bot.on('message', async (ctx, next) => {
    const msg: any = ctx.message;
    if (msg && 'forum_topic_created' in msg && msg.forum_topic_created) {
      try {
        await handleForumTopicCreated(ctx);
      } catch (err) {
        console.error('[forum_topic_created] error:', err);
      }
    }
    return next();
  });
  bot.command('cancel', async (ctx) => {
    let cancelled = false;
    if (ctx.session?.pendingReceipt) {
      ctx.session.pendingReceipt = undefined;
      cancelled = true;
    }
    if (ctx.session?.pendingWarehouseScan) {
      ctx.session.pendingWarehouseScan = undefined;
      cancelled = true;
    }
    if (cancelled) await ctx.reply('❌ Скасовано.');
  });

  // Функція обробки аудіо (для voice та audio)
  const handleAudioMessage = async (ctx: BotContext, fileId: string, duration: number) => {
    // Universal Agent — будь-який linked Metrum-користувач у DM
    if (ctx.chat?.type === 'private' && ctx.from?.id) {
      try {
        const { prisma } = await import('../../src/lib/prisma');
        const linked = await prisma.telegramBotUser.findUnique({
          where: { telegramId: BigInt(ctx.from.id) },
          select: { userId: true },
        });
        if (linked?.userId) {
          await ctx.reply('🎙️ Розпізнаю аудіо…');
          const { transcribeVoiceSafe } = await import('../agent/media');
          const text = await transcribeVoiceSafe(ctx, fileId, duration);
          if (!text) {
            return ctx.reply('❌ Не вдалося розпізнати аудіо. Спробуй текстом.');
          }
          const { runAgent } = await import('../agent');
          await runAgent(ctx, {
            text,
            prefix: '🎙️ [Голосове повідомлення розпізнано]',
          });
          return;
        }
      } catch (err) {
        console.error('[agent-voice] fallback failed:', err);
      }
    }

    // Тільки для адміна (legacy)
    if (!ctx.session?.isAdmin) {
      return ctx.reply('⛔️ Голосові повідомлення доступні тільки для прораба.\n\nВикористовуйте /admin для входу.');
    }

    try {
      await ctx.reply('🎙️ Розпізнаю голосове повідомлення...');

      const { processVoiceMessage } = await import('../services/audio');
      const result = await processVoiceMessage(
        ctx.telegram,
        fileId,
        duration
      );

      if (!result.success || !result.text) {
        return ctx.reply('❌ Не вдалося розпізнати аудіо. Спробуйте ще раз або напишіть текстом.');
      }

      // Показуємо розпізнаний текст
      await ctx.reply(`📝 Розпізнано: "${result.text}"\n\n⏳ Обробляю запит...`);

      // Обробляємо як звичайний текстовий запит
      const { handleAdminAI } = await import('../services/ai');

      if (!ctx.session.conversationHistory) {
        ctx.session.conversationHistory = [];
      }

      if (ctx.session.conversationHistory.length > 20) {
        ctx.session.conversationHistory = ctx.session.conversationHistory.slice(-20);
      }

      await ctx.sendChatAction('typing');

      const response = await handleAdminAI(result.text, ctx.session.conversationHistory);

      ctx.session.conversationHistory.push({
        role: 'user',
        content: result.text,
        timestamp: Date.now()
      });
      ctx.session.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      });

      await ctx.reply(response, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Audio message error:', error);
      await ctx.reply('❌ Помилка при обробці голосового повідомлення. Спробуйте написати текстом.');
    }
  };

  // Обробка голосових повідомлень
  bot.on('voice', async (ctx) => {
    await handleAudioMessage(ctx, ctx.message.voice.file_id, ctx.message.voice.duration);
  });

  // Обробка аудіо нот (кружечки в Telegram)
  bot.on('audio', async (ctx) => {
    if (ctx.message.audio) {
      await handleAudioMessage(ctx, ctx.message.audio.file_id, ctx.message.audio.duration || 0);
    }
  });

  // Universal Agent fallback for media у DM
  const tryAgentMediaFallback = async (
    ctx: BotContext,
    fileId: string,
    mime: string,
    name: string,
    caption: string | undefined,
  ): Promise<boolean> => {
    if (ctx.chat?.type !== 'private' || !ctx.from?.id) return false;
    if (ctx.session?.pendingReceipt || ctx.session?.pendingWarehouseScan) return false;
    try {
      const { prisma } = await import('../../src/lib/prisma');
      const linked = await prisma.telegramBotUser.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
        select: { userId: true },
      });
      if (!linked?.userId) return false;

      await ctx.reply('📥 Завантажую файл…');
      const { uploadToR2 } = await import('../agent/media');
      const uploaded = await uploadToR2(ctx, fileId, {
        fallbackName: name,
        fallbackMime: mime,
      });
      if (!uploaded) {
        await ctx.reply('❌ Не вдалося завантажити файл. Спробуй ще раз.');
        return true;
      }
      const prefix = [
        '📎 [Прикріплений файл]',
        `r2Key: ${uploaded.r2Key}`,
        `mimeType: ${uploaded.mimeType}`,
        `name: ${uploaded.name}`,
        mime.startsWith('image/')
          ? 'Якщо це чек/накладна/фото витрати — виклич parse_expense_image з цим r2Key+mimeType.'
          : 'Цей файл збережено у R2. Поки що OCR підтримується лише для зображень.',
      ].join('\n');
      const { runAgent } = await import('../agent');
      await runAgent(ctx, {
        text: caption || '',
        prefix,
      });
      return true;
    } catch (err) {
      console.error('[agent-media] fallback failed:', err);
      return false;
    }
  };

  // Обробка фото — спершу group-expense, далі pending wizards для адміна, інакше Agent
  bot.on('photo', async (ctx) => {
    try {
      const handledByGroup = await handleGroupExpensePhoto(ctx);
      if (handledByGroup) return;
    } catch (err) {
      console.error('[expense-photo] error:', err);
    }
    if (ctx.session?.pendingReceipt) {
      await handleReceiptPhoto(ctx);
      return;
    }
    if (ctx.session?.pendingWarehouseScan) {
      const handled = await handleWarehouseScanPhoto(ctx);
      if (handled) return;
    }
    const photos = ctx.message?.photo ?? [];
    const largest = photos[photos.length - 1];
    if (largest) {
      const handled = await tryAgentMediaFallback(
        ctx,
        largest.file_id,
        'image/jpeg',
        `photo-${largest.file_unique_id}.jpg`,
        ctx.message?.caption,
      );
      if (handled) return;
    }
    if (!ctx.session?.isAdmin) return;
    await handleReceiptPhoto(ctx);
  });

  // Обробка документів — аналогічно
  bot.on('document', async (ctx) => {
    try {
      const handledByGroup = await handleGroupExpenseDocument(ctx);
      if (handledByGroup) return;
    } catch (err) {
      console.error('[expense-doc] error:', err);
    }
    if (ctx.session?.pendingReceipt) {
      await handleReceiptDocument(ctx);
      return;
    }
    if (ctx.session?.pendingWarehouseScan) {
      const handled = await handleWarehouseScanDocument(ctx);
      if (handled) return;
    }
    const doc = ctx.message?.document;
    if (doc) {
      const handled = await tryAgentMediaFallback(
        ctx,
        doc.file_id,
        doc.mime_type || 'application/octet-stream',
        doc.file_name || `doc-${doc.file_unique_id}`,
        ctx.message?.caption,
      );
      if (handled) return;
    }
    if (!ctx.session?.isAdmin) return;
    await handleReceiptDocument(ctx);
  });

  // Обробка текстових повідомлень
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    // Group-expense handler runs first — it checks chat type internally and
    // returns false if the message isn't from a linked group, so private flows
    // are unaffected.
    try {
      const handledByGroup = await handleGroupExpenseText(ctx);
      if (handledByGroup) return;
    } catch (err) {
      console.error('[expense-text] handler error:', err);
    }

    // Якщо є активний процес додавання чеку — обробляємо текст для receipt
    if (ctx.session?.pendingReceipt && !text.startsWith('/')) {
      const handled = await handleReceiptTextInput(ctx, text);
      if (handled) return;
    }

    // Якщо очікуємо пароль адміна
    if (ctx.session?.awaitingPassword) {
      const correctPassword = process.env.ADMIN_PASSWORD || '2233';

      if (text === correctPassword) {
        if (ctx.session) {
          ctx.session.isAdmin = true;
          ctx.session.awaitingPassword = false;
        }

        // Mark user as admin in DB
        const telegramId = ctx.from?.id;
        if (telegramId) {
          try {
            const { prisma } = await import('../../src/lib/prisma');
            await prisma.telegramBotUser.update({
              where: { telegramId: BigInt(telegramId) },
              data: { isAdmin: true },
            });
          } catch (err) {
            console.error('[auth] flag admin error:', err);
          }
        }

        await ctx.reply('✅ <b>Вхід виконано</b>', { parse_mode: 'HTML' });
        const { menuCommand } = await import('./menu');
        await menuCommand(ctx);
      } else {
        if (ctx.session) {
          ctx.session.awaitingPassword = false;
        }
        await ctx.reply('❌ Невірний пароль. Спробуйте ще раз через /start → 🔐 Адмінка.');
      }
      return;
    }

    // Universal Bot Agent: будь-який linked Metrum-користувач у DM
    // (FOREMAN/MANAGER/FINANCIER/ENGINEER/SUPER_ADMIN) йде через новий runtime.
    if (
      !text.startsWith('/') &&
      ctx.chat?.type === 'private' &&
      ctx.from?.id
    ) {
      try {
        const { prisma } = await import('../../src/lib/prisma');
        const linked = await prisma.telegramBotUser.findUnique({
          where: { telegramId: BigInt(ctx.from.id) },
          select: { userId: true },
        });
        if (linked?.userId) {
          const { runAgent } = await import('../agent');
          await ctx.sendChatAction('typing');
          await runAgent(ctx, { text });
          return;
        }
      } catch (err) {
        console.error('[agent-fallback] failed, falling back to legacy:', err);
      }
    }

    // Legacy admin AI - якщо адмін через пароль, без user-linking
    if (ctx.session?.isAdmin && !text.startsWith('/')) {
      const { handleAdminAI } = await import('../services/ai');

      // Ініціалізуємо історію розмови якщо її немає
      if (!ctx.session.conversationHistory) {
        ctx.session.conversationHistory = [];
      }

      // Обмежуємо історію до 20 повідомлень (10 пар запит-відповідь)
      if (ctx.session.conversationHistory.length > 20) {
        ctx.session.conversationHistory = ctx.session.conversationHistory.slice(-20);
      }

      // Показуємо індикатор "друкує..."
      await ctx.sendChatAction('typing');

      const response = await handleAdminAI(text, ctx.session.conversationHistory);

      // Зберігаємо запит користувача та відповідь бота в історію
      ctx.session.conversationHistory.push({
        role: 'user',
        content: text,
        timestamp: Date.now()
      });
      ctx.session.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      });

      await ctx.reply(response, { parse_mode: 'HTML' });
      return;
    }

    // Інші текстові повідомлення
    if (!text.startsWith('/')) {
      await ctx.reply(
        '👋 Доступні команди:\n\n' +
        '/start - головне меню\n' +
        '/admin - вхід для прораба'
      );
    }
  });

  // Обробка callback queries (inline кнопки)
  bot.on('callback_query', async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const data = ctx.callbackQuery.data;

    // Публічні кнопки
    if (data === 'contact') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📞 <b>Контакти Metrum Group</b>\n\n' +
        '📱 +380 67 743 0101\n' +
        '📧 contact@metrum.com.ua\n\n' +
        '<b>Офіси у Львові:</b>\n' +
        '📍 вул. Газова, 36/1\n' +
        '📍 вул. Джерельна, 38',
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (data === 'admin_login') {
      await ctx.answerCbQuery();
      if (ctx.session?.isAdmin) {
        const { menuCommand } = await import('./menu');
        await menuCommand(ctx);
      } else {
        if (ctx.session) {
          ctx.session.awaitingPassword = true;
        }
        await ctx.reply(
          '🔐 <b>Вхід в адмінку</b>\n\n' +
          'Введіть пароль:',
          { parse_mode: 'HTML' }
        );
      }
      return;
    }

    if (data === 'services') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '💼 <b>Послуги Metrum Group</b>\n\n' +
        '🏠 Будівництво приватних будинків\n' +
        '🏢 Комерційне будівництво\n' +
        '🔧 Ремонт та реконструкція\n' +
        '🌳 Ландшафтний дизайн\n' +
        '📐 Архітектурне проектування\n\n' +
        '✨ Повний цикл: від ідеї до ключів',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Receipt flow callbacks
    if (data.startsWith('rcpt_folder:')) {
      await handleFolderNavigationCallback(ctx, data.replace('rcpt_folder:', ''));
      return;
    }
    if (data.startsWith('rcpt_folder_back:')) {
      await handleFolderBackCallback(ctx, data.replace('rcpt_folder_back:', ''));
      return;
    }
    if (data === 'rcpt_folder_root') {
      await ctx.answerCbQuery();
      await receiptCommand(ctx);
      return;
    }
    if (data.startsWith('rcpt_select_folder:')) {
      await handleSelectFolderCallback(ctx, data.replace('rcpt_select_folder:', ''));
      return;
    }
    if (data === 'rcpt_confirm' || data === 'rcpt_confirm:EXPENSE') {
      await handleReceiptConfirm(ctx, 'EXPENSE');
      return;
    }
    if (data === 'rcpt_confirm:INCOME') {
      await handleReceiptConfirm(ctx, 'INCOME');
      return;
    }
    if (data === 'rcpt_edit_amount') {
      await handleEditAmountCallback(ctx);
      return;
    }
    if (data.startsWith('rcpt_approve:')) {
      await handleApproveCallback(ctx, data.replace('rcpt_approve:', ''));
      return;
    }
    if (data.startsWith('rcpt_remind:')) {
      await handleRemindCallback(ctx, data.replace('rcpt_remind:', ''));
      return;
    }
    if (data.startsWith('rcpt_reject:')) {
      await handleRejectCallback(ctx, data.replace('rcpt_reject:', ''));
      return;
    }
    if (data === 'receipt_cancel') {
      await handleReceiptCancel(ctx);
      return;
    }

    // Expense-text flow callbacks (master writes expenses in group chat)
    if (data.startsWith('exp_send:')) {
      await handleExpenseSendCallback(ctx, data.replace('exp_send:', ''));
      return;
    }
    if (data.startsWith('exp_cancel:')) {
      await handleExpenseCancelCallback(ctx, data.replace('exp_cancel:', ''));
      return;
    }

    // Finance approval (manager approves PENDING entry from TG DM)
    if (data.startsWith('fin_approve:')) {
      await handleFinanceApproveCallback(ctx, data.replace('fin_approve:', ''));
      return;
    }
    if (data.startsWith('fin_reject:')) {
      await handleFinanceRejectCallback(ctx, data.replace('fin_reject:', ''));
      return;
    }

    // Warehouse scan flow callbacks
    if (data.startsWith('wh_proj:')) {
      await handleProjectPickCallback(ctx, data.replace('wh_proj:', ''));
      return;
    }
    if (data.startsWith('wh_approve:')) {
      await handleWarehouseApproveCallback(ctx, data.replace('wh_approve:', ''));
      return;
    }
    if (data.startsWith('wh_reject:')) {
      await handleWarehouseRejectCallback(ctx, data.replace('wh_reject:', ''));
      return;
    }

    if (data === 'noop') {
      await ctx.answerCbQuery();
      return;
    }

    // AI preset (натиск кнопки з меню → запускаємо runAgent із preset-промптом)
    if (data.startsWith('ai:preset:')) {
      const slug = data.replace('ai:preset:', '');
      await ctx.answerCbQuery();
      try {
        const { PRESET_PROMPTS } = await import('./menu');
        const prompt = PRESET_PROMPTS[slug];
        if (!prompt) {
          await ctx.reply('⚠️ Невідома дія. Спробуй /menu.');
          return;
        }
        const { runAgent } = await import('../agent');
        await ctx.sendChatAction('typing');
        await runAgent(ctx, { text: prompt });
      } catch (err) {
        console.error('[ai-preset] failed:', err);
        await ctx.reply('❌ Сталася помилка. Спробуй ще раз.');
      }
      return;
    }

    // Адмін кнопки (legacy: для адмінів через пароль без user-linking)
    if (data.startsWith('admin:')) {
      if (!ctx.session?.isAdmin) {
        await ctx.answerCbQuery('⛔️ Потрібен вхід адміністратора', { show_alert: true });
        return;
      }

      const action = data.replace('admin:', '');

      switch (action) {
        case 'receipt':
          await ctx.answerCbQuery();
          await receiptCommand(ctx);
          break;

        case 'logout':
          if (ctx.session) {
            ctx.session.isAdmin = false;
          }
          await ctx.answerCbQuery();
          await ctx.reply('👋 Ви вийшли з режиму прораба.\n\nВикористовуйте /start');
          break;

        default:
          await ctx.answerCbQuery('Скористайтесь меню — /menu', { show_alert: true });
      }
    } else if (data === 'back_to_menu') {
      // Повернення до меню прораба
      await ctx.answerCbQuery();
      const { menuCommand } = await import('./menu');
      await menuCommand(ctx);
    } else if (data === 'start') {
      // Повернення до головного меню
      await ctx.answerCbQuery();
      const { startCommand } = await import('./start');
      await startCommand(ctx);
    } else {
      await ctx.answerCbQuery();
    }
  });
}
