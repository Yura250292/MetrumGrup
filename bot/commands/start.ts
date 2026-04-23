import { BotContext } from '../types';
import { Markup } from 'telegraf';

export async function startCommand(ctx: BotContext) {
  const userName = ctx.from?.first_name || 'Друже';
  const telegramId = ctx.from?.id;

  // Extract /start <payload> (deep-link token)
  const messageText = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
  const startPayload = messageText?.startsWith('/start ')
    ? messageText.slice(7).trim()
    : '';

  // Save user to DB
  if (telegramId) {
    try {
      const { prisma } = await import('../../src/lib/prisma');

      // 1. Upsert TelegramBotUser (identity)
      const botUser = await prisma.telegramBotUser.upsert({
        where: { telegramId: BigInt(telegramId) },
        update: {
          firstName: ctx.from?.first_name || '',
          lastName: ctx.from?.last_name || null,
          username: ctx.from?.username || null,
        },
        create: {
          telegramId: BigInt(telegramId),
          firstName: ctx.from?.first_name || '',
          lastName: ctx.from?.last_name || null,
          username: ctx.from?.username || null,
        },
      });

      // 2. If /start <token> — try to link to Metrum user
      if (startPayload && /^[A-Za-z0-9_-]{10,}$/.test(startPayload)) {
        const linkToken = await prisma.telegramLinkToken.findUnique({
          where: { token: startPayload },
        });

        if (!linkToken) {
          await ctx.reply('❌ Токен не знайдено. Запросіть новий на сайті.');
        } else if (linkToken.usedAt) {
          await ctx.reply('❌ Цей токен уже використаний. Запросіть новий на сайті.');
        } else if (linkToken.expiresAt < new Date()) {
          await ctx.reply('❌ Термін дії токена вичерпано. Запросіть новий на сайті.');
        } else {
          // Detach any other TelegramBotUser previously linked to this Metrum user
          await prisma.telegramBotUser.updateMany({
            where: { userId: linkToken.userId, NOT: { id: botUser.id } },
            data: { userId: null },
          });

          // Link this TelegramBotUser to the Metrum user
          await prisma.telegramBotUser.update({
            where: { id: botUser.id },
            data: { userId: linkToken.userId },
          });

          await prisma.telegramLinkToken.update({
            where: { id: linkToken.id },
            data: { usedAt: new Date() },
          });

          const metrumUser = await prisma.user.findUnique({
            where: { id: linkToken.userId },
            select: { name: true, email: true },
          });

          await ctx.reply(
            `✅ <b>Обліковий запис прив'язано</b>\n\n` +
              `Metrum: ${metrumUser?.name ?? metrumUser?.email ?? 'користувач'}\n\n` +
              `Тепер ви отримуватимете сюди:\n` +
              `• особисті повідомлення з чату\n` +
              `• згадки (@you) у групових/проєктних чатах\n` +
              `• нові призначені задачі\n\n` +
              `Налаштування можна змінити у профілі на сайті.`,
            { parse_mode: 'HTML' },
          );
          return;
        }
      }
    } catch (err) {
      console.error('[start] save user error:', err);
    }
  }

  // If already admin — show admin menu
  if (ctx.session?.isAdmin) {
    const { menuCommand } = await import('./menu');
    return menuCommand(ctx);
  }

  // Public menu
  const message = `🏗 <b>Вітаємо в Metrum Group!</b>

Провідна будівельна компанія з професійною командою інженерів та прозорою системою оплати.

<b>Наші послуги:</b>
🏠 Будівництво приватних будинків
🏢 Комерційне будівництво
🔧 Ремонт та реконструкція
🌳 Ландшафтний дизайн
📐 Архітектурне проектування

✅ Повний цикл: від ідеї до ключів`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [
        Markup.button.url('🌐 Наш сайт', 'https://www.metrum-grup.biz.ua'),
        Markup.button.callback('📞 Контакти', 'contact')
      ],
      [Markup.button.callback('💼 Послуги', 'services')],
      [Markup.button.callback('🔐 Адмінка', 'admin_login')],
    ])
  });
}
