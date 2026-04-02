import { BotContext } from '../types';
import { getUserProjects } from '../services/database';
import { formatProjectsList } from '../services/formatter';
import { projectsKeyboard } from '../utils/keyboards';
import { Markup } from 'telegraf';

export async function projectsCommand(ctx: BotContext) {
  try {
    // Адмін бачить всі проекти
    const projects = await getUserProjects('', 'SUPER_ADMIN');

    const message = formatProjectsList(projects);

    if (projects.length > 0) {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...projectsKeyboard(projects)
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
        ])
      });
    }
  } catch (error) {
    console.error('Error in projectsCommand:', error);
    await ctx.reply('❌ Помилка при завантаженні проектів. Спробуйте пізніше.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]
      ])
    });
  }
}
