import { Markup } from 'telegraf';
import { BotContext } from '../types';

async function isLinked(telegramId: number | undefined): Promise<boolean> {
  if (!telegramId) return false;
  try {
    const { prisma } = await import('../../src/lib/prisma');
    const row = await prisma.telegramBotUser.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { userId: true },
    });
    return !!row?.userId;
  } catch {
    return false;
  }
}

export async function helpCommand(ctx: BotContext) {
  const linked = await isLinked(ctx.from?.id);

  if (linked) {
    const message = `ℹ️ <b>Як користуватися ботом</b>

🤖 Бот побудовано навколо AI-помічника на Gemini 3.0 Flash.

<b>Просто напиши або скажи:</b>
• "Записати чек на 3200 за арматуру у проект Сонячна 12"
• "Що сьогодні треба апрувити?"
• "Мої задачі за пріоритетом"
• "Покажи останні мої звіти"

📸 <b>Фото / 🎙 голос:</b>
Надішли — бот сам розпізнає текст і запропонує дію.

<b>Команди:</b>
/menu — твоє персональне меню
/help — ця довідка

🔔 Бот також надсилає:
• сповіщення про @згадки і нові задачі
• апруви на підтвердження
• нагадування про дедлайни`;

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Меню', 'back_to_menu')],
      ]),
    });
    return;
  }

  const message = `ℹ️ <b>Metrum Group Bot</b>

<b>Команди:</b>
/start — головне меню
/help — довідка

Щоб отримати доступ до внутрішнього функціоналу — згенеруйте Telegram-посилання у профілі Metrum на сайті.

<b>Підтримка:</b>
📱 +380 67 743 0101
📧 contact@metrum.com.ua`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Головна', 'start')]]),
  });
}
