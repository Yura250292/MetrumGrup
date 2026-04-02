import { BotContext } from '../types';
import { Markup } from 'telegraf';

export async function helpCommand(ctx: BotContext) {
  const isAdmin = ctx.session?.isAdmin;

  const message = isAdmin
    ? `ℹ️ <b>Довідка - Режим прораба</b>

<b>Доступні команди:</b>

/menu - Головне меню прораба
/projects - Всі проекти
/payments - Всі платежі
/estimates - Всі кошториси
/materials - Каталог матеріалів
/status - Загальна статистика
/logout - Вийти з режиму прораба

<b>AI Асистент:</b>

📝 Пишіть запити українською мовою:
• "Покажи активні проекти"
• "Скільки витратили на фундамент?"
• "Статус платежів по проекту X"
• "Розрахуй ПДВ на 100000"
• "Коли завершимо проект?"

🎙️ <b>Голосові повідомлення:</b>
Надсилайте голосові повідомлення - бот автоматично розпізнає мову і виконає команду!

Бот автоматично знайде потрібну інформацію та виконає розрахунки.`
    : `ℹ️ <b>Metrum Group Bot - Довідка</b>

<b>Доступні команди:</b>

/start - Головне меню
/admin - Вхід для прораба
/help - Ця довідка

<b>Підтримка:</b>
📱 +380 67 743 0101
📧 contact@metrum.com.ua`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback(isAdmin ? '🔙 Назад до меню' : '🏠 Головна', isAdmin ? 'back_to_menu' : 'start')]
    ])
  });
}
