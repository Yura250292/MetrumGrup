import { BotContext } from '../types';
import { Markup } from 'telegraf';

export async function startCommand(ctx: BotContext) {
  const userName = ctx.from?.first_name || 'Друже';
  const telegramId = ctx.from?.id;

  // Save user to DB
  if (telegramId) {
    try {
      const { prisma } = await import('../../src/lib/prisma');
      await prisma.telegramBotUser.upsert({
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
