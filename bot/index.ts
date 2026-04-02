import { Telegraf, session } from 'telegraf';
import dotenv from 'dotenv';
import { sessionMiddleware } from './middleware/auth';
import { registerCommands } from './commands';
import { BotContext } from './types';

// Завантажити змінні оточення
dotenv.config();

// Перевірка наявності токену
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не знайдено в .env файлі');
  process.exit(1);
}

// Створення бота
const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN);

// Додати session middleware (в пам'яті)
bot.use(session());
bot.use(sessionMiddleware);

// Логування всіх вхідних повідомлень
bot.use((ctx, next) => {
  console.log('📨 Incoming message:', ctx.message ? (ctx.message as any).text || 'non-text' : 'callback_query');
  return next();
});

// Зареєструвати команди
registerCommands(bot);

// Обробка помилок
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Сталася помилка. Спробуйте пізніше або зверніться до підтримки.');
});

// Запуск бота
const botMode = process.env.BOT_MODE || 'polling';

if (botMode === 'webhook' && process.env.BOT_WEBHOOK_URL) {
  // Production webhook mode
  bot.launch({
    webhook: {
      domain: process.env.BOT_WEBHOOK_URL,
      port: parseInt(process.env.BOT_PORT || '3001')
    }
  });
  console.log('🤖 Metrum Group Bot запущено в режимі webhook');
} else {
  // Development polling mode
  bot.launch();
  console.log('🤖 Metrum Group Bot запущено в режимі polling');
}

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n⏹ Зупинка бота...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n⏹ Зупинка бота...');
  bot.stop('SIGTERM');
});

console.log('✅ Бот готовий до роботи!');
