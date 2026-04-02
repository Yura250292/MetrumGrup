import { BotContext } from '../types';
import { getUserPayments } from '../services/database';
import { formatPaymentsList } from '../services/formatter';
import { Markup } from 'telegraf';

export async function paymentsCommand(ctx: BotContext) {
  try {
    // Адмін бачить всі платежі
    const payments = await getUserPayments('', 'SUPER_ADMIN');

    const message = formatPaymentsList(payments);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  } catch (error) {
    console.error('Error in paymentsCommand:', error);
    await ctx.reply('❌ Помилка при завантаженні платежів. Спробуйте пізніше.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  }
}
