import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';

// Ініціалізація сесії
export const sessionMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.session) {
    ctx.session = {
      isAdmin: false,
      awaitingPassword: false
    };
  }
  return next();
};

// Перевірка адмін доступу для команд
export const requireAdmin: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.session?.isAdmin) {
    return ctx.reply(
      '⛔️ Ця команда доступна тільки для адміністраторів.\n\n' +
      'Використовуйте /admin для входу.'
    );
  }
  return next();
};
