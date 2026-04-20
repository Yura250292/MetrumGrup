import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../types';
import { startCommand } from './start';
import { adminCommand, logoutCommand } from './admin';
import { menuCommand } from './menu';
import { projectsCommand } from './projects';
import { estimateCommand } from './estimate';
import { materialsCommand } from './materials';
import { paymentsCommand } from './payments';
import { statusCommand } from './status';
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
import { requireAdmin } from '../middleware/auth';
import { getUserProjects } from '../services/database';
import { formatProjectsList } from '../services/formatter';

export function registerCommands(bot: Telegraf<BotContext>) {
  // Публічні команди
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('admin', adminCommand);

  // Команди тільки для адміна
  bot.command('menu', requireAdmin, menuCommand);
  bot.command('logout', logoutCommand);
  bot.command('projects', requireAdmin, projectsCommand);
  bot.command('estimate', requireAdmin, estimateCommand);
  bot.command('materials', requireAdmin, materialsCommand);
  bot.command('payments', requireAdmin, paymentsCommand);
  bot.command('status', requireAdmin, statusCommand);
  bot.command('receipt', requireAdmin, receiptCommand);
  bot.command('cancel', async (ctx) => {
    if (ctx.session?.pendingReceipt) {
      ctx.session.pendingReceipt = undefined;
      await ctx.reply('❌ Скасовано.');
    }
  });

  // Функція обробки аудіо (для voice та audio)
  const handleAudioMessage = async (ctx: BotContext, fileId: string, duration: number) => {
    // Тільки для адміна
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

  // Обробка фото — перевіряємо чи це чек
  bot.on('photo', async (ctx) => {
    if (ctx.session?.isAdmin) {
      await handleReceiptPhoto(ctx);
    }
  });

  // Обробка документів — перевіряємо чи це чек
  bot.on('document', async (ctx) => {
    if (ctx.session?.isAdmin) {
      await handleReceiptDocument(ctx);
    }
  });

  // Обробка текстових повідомлень
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;

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

        await ctx.reply(
          '✅ <b>Вхід виконано</b>\n\n' +
          '🤖 <b>Режим прораба активний!</b>\n\n' +
          '📝 Пишіть запити українською:\n' +
          '• "Покажи всі проекти"\n' +
          '• "Скільки витратили на фундамент?"\n' +
          '• "Розрахуй ПДВ на 100000"\n\n' +
          '🎙️ <b>Можна надсилати голосові повідомлення!</b>\n\n' +
          'Або використовуйте /menu',
          { parse_mode: 'HTML' }
        );
      } else {
        if (ctx.session) {
          ctx.session.awaitingPassword = false;
        }
        await ctx.reply('❌ Невірний пароль. Спробуйте /admin ще раз.');
      }
      return;
    }

    // Якщо адмін - обробляємо через AI
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
    if (data === 'rcpt_confirm') {
      await handleReceiptConfirm(ctx);
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
    if (data === 'noop') {
      await ctx.answerCbQuery();
      return;
    }

    // Адмін кнопки
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

        case 'projects':
          await ctx.answerCbQuery();
          // Показуємо всі проекти
          const projects = await getUserProjects('', 'SUPER_ADMIN');
          const message = formatProjectsList(projects);
          await ctx.reply(message, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
            ])
          });
          break;

        case 'payments':
          await ctx.answerCbQuery();
          const { getUserPayments } = await import('../services/database');
          const { formatPaymentsList } = await import('../services/formatter');
          const payments = await getUserPayments('', 'SUPER_ADMIN');
          const paymentsMsg = formatPaymentsList(payments);
          await ctx.reply(paymentsMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
            ])
          });
          break;

        case 'estimates':
          await ctx.answerCbQuery();
          const { prisma } = await import('../../src/lib/prisma');
          const estimates = await prisma.estimate.findMany({
            include: { project: true },
            orderBy: { createdAt: 'desc' },
            take: 10
          });

          if (estimates.length === 0) {
            await ctx.reply('📊 Кошторисів не знайдено', {
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
              ])
            });
          } else {
            let msg = `📊 <b>Кошториси (${estimates.length})</b>\n\n`;
            estimates.forEach((est, i) => {
              msg += `${i + 1}. <b>${est.number}</b>\n`;
              msg += `   └ ${est.title}\n`;
              msg += `   └ Проект: ${est.project.title}\n`;
              msg += `   └ Статус: ${est.status}\n\n`;
            });
            msg += `\nВикористовуйте: /estimate НОМЕР`;
            await ctx.reply(msg, {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
              ])
            });
          }
          break;

        case 'materials':
          await ctx.answerCbQuery();
          const { getMaterials } = await import('../services/database');
          const { formatMaterialsList } = await import('../services/formatter');
          const materials = await getMaterials();
          const materialsMsg = formatMaterialsList(materials);
          await ctx.reply(materialsMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
            ])
          });
          break;

        case 'stats':
          await ctx.answerCbQuery();
          // Статистика
          const allProjects = await getUserProjects('', 'SUPER_ADMIN');
          const { getUserPayments: getPayments } = await import('../services/database');
          const allPayments = await getPayments('', 'SUPER_ADMIN');
          const { formatCurrency } = await import('../utils/constants');

          const activeProjects = allProjects.filter(p => p.status === 'ACTIVE').length;
          const totalBudget = allProjects.reduce((sum, p) => sum + parseFloat(p.totalBudget.toString()), 0);
          const totalPaid = allProjects.reduce((sum, p) => sum + parseFloat(p.totalPaid.toString()), 0);
          const pendingPayments = allPayments.filter(p => p.status === 'PENDING').length;

          let statsMsg = `📊 <b>Загальна статистика</b>\n\n`;
          statsMsg += `<b>Проекти:</b>\n`;
          statsMsg += `└ Всього: ${allProjects.length}\n`;
          statsMsg += `└ Активних: ${activeProjects}\n\n`;
          statsMsg += `<b>Фінанси:</b>\n`;
          statsMsg += `└ Загальний бюджет: ${formatCurrency(totalBudget)}\n`;
          statsMsg += `└ Оплачено: ${formatCurrency(totalPaid)}\n`;
          statsMsg += `└ Залишок: ${formatCurrency(totalBudget - totalPaid)}\n\n`;
          if (pendingPayments > 0) {
            statsMsg += `⏳ Очікується платежів: ${pendingPayments}\n`;
          }

          await ctx.reply(statsMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
            ])
          });
          break;

        case 'logout':
          if (ctx.session) {
            ctx.session.isAdmin = false;
          }
          await ctx.answerCbQuery();
          await ctx.reply('👋 Ви вийшли з режиму прораба.\n\nВикористовуйте /start');
          break;

        default:
          await ctx.answerCbQuery('Функція в розробці...');
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
