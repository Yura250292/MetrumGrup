import { BotContext } from '../types';
import { Markup } from 'telegraf';

export async function menuCommand(ctx: BotContext) {
  if (!ctx.session?.isAdmin) {
    return ctx.reply('⛔️ Використовуйте /admin для входу в систему прораба.');
  }

  const message = `🔧 <b>Меню Прораба</b>

Оберіть розділ або напишіть запит українською мовою:`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback('🧾 Додати чек / накладну', 'admin:receipt')
      ],
      [
        Markup.button.callback('📋 Проекти', 'admin:projects'),
        Markup.button.callback('💰 Платежі', 'admin:payments')
      ],
      [
        Markup.button.callback('📊 Кошториси', 'admin:estimates'),
        Markup.button.callback('📦 Матеріали', 'admin:materials')
      ],
      [
        Markup.button.callback('📈 Статистика', 'admin:stats'),
        Markup.button.callback('🚪 Вийти', 'admin:logout')
      ]
    ])
  });
}
