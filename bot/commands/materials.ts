import { BotContext } from '../types';
import { getMaterials } from '../services/database';
import { formatMaterialsList } from '../services/formatter';
import { Markup } from 'telegraf';

export async function materialsCommand(ctx: BotContext) {
  try {
    // Отримуємо текст після команди для пошуку
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const search = text.replace('/materials', '').trim() || undefined;

    const materials = await getMaterials(search);

    const message = formatMaterialsList(materials);
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
    ]);

    if (search) {
      await ctx.reply(`🔍 Пошук: "${search}"\n\n${message}`, {
        parse_mode: 'HTML',
        ...keyboard
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...keyboard
      });
    }
  } catch (error) {
    console.error('Error in materialsCommand:', error);
    await ctx.reply('❌ Помилка при завантаженні матеріалів. Спробуйте пізніше.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  }
}
