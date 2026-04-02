import { BotContext } from '../types';
import { getEstimate } from '../services/database';
import { formatEstimate } from '../services/formatter';
import { Markup } from 'telegraf';

export async function estimateCommand(ctx: BotContext) {
  try {
    // Отримуємо номер кошторису з тексту команди
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const estimateNumber = text.replace('/estimate', '').trim();

    if (!estimateNumber) {
      return ctx.reply(
        '💡 Використання: /estimate НОМЕР\n\n' +
        'Приклад: /estimate EST-2024-001',
        {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
          ])
        }
      );
    }

    // Адмін має доступ до всіх кошторисів
    const estimate = await getEstimate(estimateNumber, '', 'SUPER_ADMIN');

    if (!estimate) {
      return ctx.reply(`❌ Кошторис "${estimateNumber}" не знайдено.`, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
        ])
      });
    }

    const message = formatEstimate(estimate);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  } catch (error) {
    console.error('Error in estimateCommand:', error);
    await ctx.reply('❌ Помилка при завантаженні кошторису. Спробуйте пізніше.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  }
}
