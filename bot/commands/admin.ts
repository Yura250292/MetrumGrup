import { BotContext } from '../types';

export async function adminCommand(ctx: BotContext) {
  // Якщо вже адмін
  if (ctx.session?.isAdmin) {
    return ctx.reply('✅ Ви вже авторизовані.\n\nВикористовуйте /menu');
  }

  // Встановлюємо прапорець очікування пароля
  if (ctx.session) {
    ctx.session.awaitingPassword = true;
  }

  await ctx.reply(
    '🔐 <b>Вхід для прораба</b>\n\n' +
    'Введіть пароль:',
    { parse_mode: 'HTML' }
  );
}

export async function logoutCommand(ctx: BotContext) {
  if (ctx.session) {
    ctx.session.isAdmin = false;
    ctx.session.awaitingPassword = false;
  }

  await ctx.reply('👋 Ви вийшли з режиму прораба.\n\nВикористовуйте /start');
}
