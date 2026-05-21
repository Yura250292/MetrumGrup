import { Markup } from 'telegraf';
import type { Role } from '@prisma/client';
import { BotContext } from '../types';

type LinkedInfo = {
  userId: string;
  role: Role | null;
  name: string | null;
  firmId: string | null;
} | null;

async function resolveLinked(telegramId: number | undefined): Promise<LinkedInfo> {
  if (!telegramId) return null;
  const { prisma } = await import('../../src/lib/prisma');
  const row = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: {
      userId: true,
      user: { select: { role: true, name: true, firmId: true, isActive: true } },
    },
  });
  if (!row?.userId || !row.user || !row.user.isActive) return null;
  return {
    userId: row.userId,
    role: row.user.role,
    name: row.user.name,
    firmId: row.user.firmId,
  };
}

function presetButton(label: string, slug: string) {
  return Markup.button.callback(label, `ai:preset:${slug}`);
}

function menuForRole(role: Role | null) {
  const aiHint = '\n\n💡 Просто пиши або говори — AI зрозуміє.';
  if (role === 'FOREMAN') {
    return {
      text:
        '🔧 <b>Меню виконроба</b>\n\nЗапис витрат, перегляд звітів, контакт із менеджером.' +
        aiHint,
      keyboard: Markup.inlineKeyboard([
        [presetButton('🧾 Записати витрату', 'foreman.new_expense')],
        [presetButton('📋 Мої звіти', 'foreman.my_reports')],
        [presetButton('📊 Що по моїх проектах', 'foreman.my_projects')],
      ]),
    };
  }
  if (role === 'MANAGER' || role === 'FINANCIER') {
    return {
      text:
        `📊 <b>Меню ${role === 'MANAGER' ? 'менеджера' : 'фінансиста'}</b>\n\n` +
        'Апруви, зведення дня, бюджети.' +
        aiHint,
      keyboard: Markup.inlineKeyboard([
        [presetButton('⏳ Що треба апрувити', 'manager.pending_approvals')],
        [presetButton('📈 Зведення дня', 'manager.daily_summary')],
        [presetButton('🗂 Активні проекти', 'manager.active_projects')],
      ]),
    };
  }
  if (role === 'ENGINEER' || role === 'HR' || role === 'OWNER') {
    return {
      text:
        '🧠 <b>Меню</b>\n\nТвої задачі, фокус дня, проекти.' + aiHint,
      keyboard: Markup.inlineKeyboard([
        [presetButton('✅ Мої задачі', 'engineer.my_tasks')],
        [presetButton('📈 Що сьогодні', 'engineer.daily_summary')],
        [presetButton('🗂 Активні проекти', 'manager.active_projects')],
      ]),
    };
  }
  if (role === 'SUPER_ADMIN') {
    return {
      text:
        '🛠 <b>Меню адміністратора</b>\n\nПовний доступ — від апрувів до фінансів.' +
        aiHint,
      keyboard: Markup.inlineKeyboard([
        [presetButton('⏳ Що треба апрувити', 'manager.pending_approvals')],
        [presetButton('📈 Зведення дня', 'manager.daily_summary')],
        [presetButton('🧾 Записати чек', 'foreman.new_expense')],
        [presetButton('🗂 Активні проекти', 'manager.active_projects')],
      ]),
    };
  }
  if (role === 'CLIENT') {
    return {
      text: '🏠 <b>Меню клієнта</b>\n\nТвої проекти та платежі.' + aiHint,
      keyboard: Markup.inlineKeyboard([
        [presetButton('🏗 Мій проект', 'client.my_project')],
      ]),
    };
  }
  return {
    text:
      '👋 <b>Вітаю в Metrum Group Bot</b>\n\n' +
      'Щоб користуватись усім функціоналом, прив\'яжіть обліковий запис Metrum:\n' +
      '1. Зайдіть у профіль на сайті\n' +
      '2. Згенеруйте Telegram-посилання\n' +
      '3. Відкрийте його — і повертайтесь сюди',
    keyboard: Markup.inlineKeyboard([
      [Markup.button.url('🌐 Відкрити сайт', 'https://www.metrum-grup.biz.ua')],
    ]),
  };
}

export async function menuCommand(ctx: BotContext) {
  const linked = await resolveLinked(ctx.from?.id);

  // Backwards-compat: legacy password admin (без user-linking) — простий чек-flow
  if (!linked && ctx.session?.isAdmin) {
    await ctx.reply(
      '🔧 <b>Меню прораба (legacy)</b>\n\nДоступний швидкий запис чека.',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🧾 Додати чек', 'admin:receipt')],
          [Markup.button.callback('🚪 Вийти', 'admin:logout')],
        ]),
      },
    );
    return;
  }

  const { text, keyboard } = menuForRole(linked?.role ?? null);
  await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

export const PRESET_PROMPTS: Record<string, string> = {
  // FOREMAN
  'foreman.new_expense':
    'Готовий записати витрату. Просто напиши матеріал/роботу і суму, або надішли фото чека.',
  'foreman.my_reports': 'Покажи мої останні звіти виконроба зі статусами.',
  'foreman.my_projects': 'Список моїх активних проектів з короткою інфою.',
  // MANAGER / FINANCIER
  'manager.pending_approvals': 'Що сьогодні треба апрувити? Покажи список.',
  'manager.daily_summary': 'Дай зведення дня: апруви, нові витрати, мої задачі.',
  'manager.active_projects': 'Покажи активні проекти з прогресом.',
  // ENGINEER
  'engineer.my_tasks': 'Які мої відкриті задачі за пріоритетом і дедлайном?',
  'engineer.daily_summary': 'Що сьогодні в фокусі? Задачі і дедлайни на найближчі 3 дні.',
  // CLIENT
  'client.my_project': 'Який статус мого проекту? Прогрес, останні новини, платежі.',
};
