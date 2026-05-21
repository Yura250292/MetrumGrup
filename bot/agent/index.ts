import type { Telegraf } from 'telegraf';
import type { BotContext } from '../types';
import { runAgent } from './runtime';

export { runAgent } from './runtime';
export type { AgentInput } from './runtime';

/**
 * Підключає Universal Agent як fallback handler для DM-повідомлень.
 * Має викликатися ОСТАННІМ — після всіх `/команд` та wizard-хендлерів,
 * щоб не перехоплювати їх.
 */
export function registerAgentFallback(bot: Telegraf<BotContext>): void {
  bot.on('text', async (ctx, next) => {
    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith('/')) {
      await next();
      return;
    }
    if (ctx.session?.pendingReceipt || ctx.session?.pendingWarehouseScan) {
      await next();
      return;
    }
    if (ctx.chat?.type !== 'private') {
      // Group/topic — не реагуємо автоматично (буде окремо у Фазі 2)
      await next();
      return;
    }
    await runAgent(ctx, { text });
  });
}
