import { BotContext } from '../types';
import { Markup } from 'telegraf';

export async function startCommand(ctx: BotContext) {
  const userName = ctx.from?.first_name || 'Друже';

  // Перевіряємо чи це адмін
  if (ctx.session?.isAdmin) {
    return ctx.reply(
      `👋 Привіт, ${userName}!\n\n` +
      '🔧 Ви в режимі прораба.\n' +
      'Використовуйте /menu або пишіть запити українською.',
      { parse_mode: 'HTML' }
    );
  }

  // Звичайний користувач - публічне меню
  const message = `🏗 <b>Вітаємо в Metrum Group!</b>

Провідна будівельна компанія з професійною командою інженерів та прозорою системою оплати.

<b>Наші послуги:</b>
🏠 Будівництво приватних будинків
🏢 Комерційне будівництво
🔧 Ремонт та реконструкція
🌳 Ландшафтний дизайн

✅ Детальні кошториси та гарантія на всі роботи`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [
        Markup.button.url('🌐 Наш сайт', 'https://www.metrum-grup.biz.ua'),
        Markup.button.callback('📞 Контакти', 'contact')
      ],
      [Markup.button.callback('💼 Послуги', 'services')]
    ])
  });
}
