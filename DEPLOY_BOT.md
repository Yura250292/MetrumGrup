# Деплоймент Telegram бота на Railway

## Варіант 1: Railway (Рекомендовано)

### Крок 1: Створити новий сервіс на Railway

1. Зайдіть на https://railway.app
2. Оберіть ваш проект Metrum Group
3. Натисніть **"New Service"** → **"GitHub Repo"**
4. Виберіть репозиторій metrum-group

### Крок 2: Налаштувати змінні оточення

Додайте наступні змінні в Railway:

```bash
# База даних (використовуйте ту саму що й для Next.js)
DATABASE_URL=postgresql://postgres:ZGTFHEbjCDzGYZbTtdvahEWWkPfsyGrC@hopper.proxy.rlwy.net:39073/railway

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
BOT_MODE=polling
ADMIN_PASSWORD=your_password_here

# AI API Keys (отримайте на відповідних сайтах)
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Node
NODE_ENV=production
```

### Крок 3: Налаштувати Build та Start команди

У налаштуваннях сервісу:

**Root Directory:** (залишити порожнім)

**Build Command:**
```bash
npm install && npx prisma generate && npm run bot:build
```

**Start Command:**
```bash
npm run bot:start
```

**або використовуйте tsx (без компіляції):**
```bash
npx tsx bot/index.ts
```

### Крок 4: Deploy

1. Натисніть **"Deploy"**
2. Почекайте 2-3 хвилини
3. Перевірте логи - має бути:
   ```
   🤖 Metrum Group Bot запущено в режимі polling
   ✅ Бот готовий до роботи!
   ```

### Крок 5: Перевірка

Напишіть боту в Telegram - він має відповідати навіть коли ваш комп вимкнений!

---

## Варіант 2: Heroku

### Крок 1: Встановити Heroku CLI

```bash
brew install heroku/brew/heroku
heroku login
```

### Крок 2: Створити додаток

```bash
heroku create metrum-bot
```

### Крок 3: Додати змінні оточення

```bash
heroku config:set DATABASE_URL="postgresql://..." -a metrum-bot
heroku config:set TELEGRAM_BOT_TOKEN="7850566522:AAFzeJGh04Re3_4EXwt_Z0TXHGW0Txy0LM0" -a metrum-bot
heroku config:set GEMINI_API_KEY="AIzaSy..." -a metrum-bot
heroku config:set BOT_MODE="polling" -a metrum-bot
```

### Крок 4: Створити Procfile

```
worker: npx tsx bot/index.ts
```

### Крок 5: Deploy

```bash
git push heroku main
heroku ps:scale worker=1 -a metrum-bot
```

---

## Варіант 3: VPS (Ubuntu/Debian)

### Крок 1: Підключитися до сервера

```bash
ssh root@your-server-ip
```

### Крок 2: Встановити Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Крок 3: Встановити PM2

```bash
npm install -g pm2
```

### Крок 4: Клонувати репозиторій

```bash
cd /var/www
git clone https://github.com/your-username/metrum-group.git
cd metrum-group
```

### Крок 5: Встановити залежності

```bash
npm install
npx prisma generate
```

### Крок 6: Створити .env

```bash
nano .env
# Додайте всі змінні оточення
```

### Крок 7: Запустити через PM2

```bash
pm2 start bot/index.ts --name metrum-bot --interpreter tsx
pm2 save
pm2 startup
```

### Перевірка логів:

```bash
pm2 logs metrum-bot
```

### Перезапуск:

```bash
pm2 restart metrum-bot
```

---

## Варіант 4: Docker (для будь-якого хостингу)

### Крок 1: Збілдити образ

```bash
docker build -f Dockerfile.bot -t metrum-bot .
```

### Крок 2: Запустити контейнер

```bash
docker run -d \
  --name metrum-bot \
  --restart unless-stopped \
  -e DATABASE_URL="postgresql://..." \
  -e TELEGRAM_BOT_TOKEN="7850566522:..." \
  -e GEMINI_API_KEY="AIzaSy..." \
  -e BOT_MODE="polling" \
  metrum-bot
```

### Перевірка логів:

```bash
docker logs -f metrum-bot
```

---

## Рекомендації:

### ✅ Railway (Найпростіше)
- Автоматичний деплоймент з GitHub
- Безкоштовно для невеликих проектів
- Легко масштабувати

### ✅ VPS + PM2 (Повний контроль)
- Повний контроль над сервером
- Можна запускати кілька ботів
- Дешевше для великих проектів

### ⚠️ Heroku (Платний)
- Безкоштовний план більше не доступний
- Від $7/місяць

### 🐳 Docker (Універсальне)
- Працює на будь-якому хостингу
- Ізольоване середовище
- Легко переносити між серверами

---

## Моніторинг

Після деплойменту рекомендую налаштувати:

1. **Uptime моніторинг** (UptimeRobot, BetterStack)
   - Перевірка чи бот відповідає

2. **Логування** (Logtail, Papertrail)
   - Збір та аналіз логів

3. **Сповіщення** (Telegram)
   - Якщо бот впав - отримати повідомлення

---

## Troubleshooting

### Бот не запускається:

1. Перевірте логи
2. Перевірте DATABASE_URL
3. Перевірте TELEGRAM_BOT_TOKEN
4. Перевірте чи згенерований Prisma Client

### Бот працює але не відповідає:

1. Перевірте чи правильний токен бота
2. Перевірте BOT_MODE (має бути "polling")
3. Перевірте чи є інтернет з'єднання

### Помилки з базою даних:

1. `npx prisma db pull` - синхронізувати схему
2. `npx prisma generate` - згенерувати клієнт
3. Перезапустити бота
