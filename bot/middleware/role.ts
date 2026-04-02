import { MiddlewareFn } from 'telegraf';
import { Role } from '@prisma/client';
import { BotContext } from '../types';

export function requireRole(allowedRoles: Role[]): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const user = ctx.state.user;

    if (!user || !allowedRoles.includes(user.role)) {
      return ctx.reply('⛔️ Недостатньо прав доступу для цієї команди');
    }

    return next();
  };
}
