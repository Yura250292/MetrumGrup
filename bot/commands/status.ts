import { BotContext } from '../types';
import { getUserProjects, getUserPayments } from '../services/database';
import { formatCurrency } from '../utils/constants';
import { Markup } from 'telegraf';

export async function statusCommand(ctx: BotContext) {
  try {
    // Адмін бачить всю статистику
    const projects = await getUserProjects('', 'SUPER_ADMIN');
    const payments = await getUserPayments('', 'SUPER_ADMIN');

    // Підрахунок статистики
    const activeProjects = projects.filter(p => p.status === 'ACTIVE').length;
    const totalBudget = projects.reduce((sum, p) => sum + parseFloat(p.totalBudget.toString()), 0);
    const totalPaid = projects.reduce((sum, p) => sum + parseFloat(p.totalPaid.toString()), 0);

    const pendingPayments = payments.filter(p => p.status === 'PENDING').length;

    let message = `📊 <b>Загальна статистика</b>\n\n`;

    message += `<b>Проекти:</b>\n`;
    message += `└ Всього: ${projects.length}\n`;
    message += `└ Активних: ${activeProjects}\n\n`;

    message += `<b>Фінанси:</b>\n`;
    message += `└ Загальний бюджет: ${formatCurrency(totalBudget)}\n`;
    message += `└ Оплачено: ${formatCurrency(totalPaid)}\n`;
    message += `└ Залишок: ${formatCurrency(totalBudget - totalPaid)}\n\n`;

    if (pendingPayments > 0) {
      message += `⏳ Очікується платежів: ${pendingPayments}\n`;
    }

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  } catch (error) {
    console.error('Error in statusCommand:', error);
    await ctx.reply('❌ Помилка при завантаженні статусу. Спробуйте пізніше.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  }
}
