# 🚀 Інструкція з деплою Metrum Group

## Архітектура продакшн середовища

- **Vercel Pro** - Next.js додаток (фронтенд + API)
- **Railway Pro** - PostgreSQL база даних
- **Cloudflare R2** - зберігання файлів
- **Nic.ua** - домен

---

## Етап 1: Налаштування бази даних на Railway (15 хв)

### 1.1. Створення PostgreSQL бази

1. Зайдіть на [Railway](https://railway.app/)
2. Натисніть **"New Project"**
3. Оберіть **"Provision PostgreSQL"**
4. Дочекайтесь створення бази (1-2 хвилини)

### 1.2. Отримання DATABASE_URL

1. Відкрийте створену PostgreSQL базу
2. Перейдіть на вкладку **"Variables"**
3. Знайдіть змінну **`DATABASE_URL`**
4. Скопіюйте значення (має вигляд: `postgresql://postgres:password@hostname:5432/railway`)
5. **ВАЖЛИВО**: Додайте в кінець URL `?sslmode=require`

Фінальний URL має виглядати так:
```
postgresql://postgres:xxx@hostname.railway.app:5432/railway?sslmode=require
```

### 1.3. Налаштування з'єднань

1. У налаштуваннях Railway PostgreSQL знайдіть **"Settings"**
2. Переконайтесь що **"Public Networking"** увімкнено
3. Запишіть дані (збережіть в безпечному місці):
   - Database Name
   - Username
   - Password
   - Host
   - Port

---

## Етап 2: Купівля та налаштування домену (10 хв)

### 2.1. Купівля домену на Nic.ua

1. Зайдіть на [Nic.ua](https://nic.ua/)
2. Знайдіть бажаний домен (наприклад: `metrumgroup.com.ua`)
3. Купіть домен
4. Перейдіть в особистий кабінет → Мої послуги → Домени

### 2.2. Налаштування DNS на Nic.ua

**НЕ РОБІТЬ ЦЕ ЗАРАЗ** - спочатку налаштуємо Vercel, потім повернемось!

---

## Етап 3: Деплой на Vercel (20 хв)

### 3.1. Підключення репозиторію

1. Зайдіть на [Vercel](https://vercel.com/)
2. Натисніть **"Add New..."** → **"Project"**
3. Імпортуйте репозиторій `Yura250292/MetrumGrup` з GitHub
4. Дайте доступ Vercel до репозиторію

### 3.2. Налаштування Environment Variables

**ВАЖЛИВО**: Перед деплоєм додайте всі змінні!

1. На сторінці налаштування проекту знайдіть **"Environment Variables"**
2. Додайте наступні змінні:

#### Обов'язкові змінні:

**База даних:**
```env
DATABASE_URL
```
Вставте URL з Railway (з `?sslmode=require`)

**Аутентифікація:**
```env
AUTH_SECRET
```
Згенеруйте командою: `openssl rand -base64 32`

```env
AUTH_URL
```
Спочатку: `https://your-project-name.vercel.app` (пізніше змінимо на ваш домен)

```env
NEXTAUTH_URL
```
Те саме що AUTH_URL

#### Опціональні (AI функції):

```env
GEMINI_API_KEY
```
Ваш Gemini API ключ (якщо хочете AI генерацію кошторисів)

```env
ANTHROPIC_API_KEY
```
Ваш Anthropic ключ (якщо хочете аналіз планів)

```env
OPENAI_API_KEY
```
Ваш OpenAI ключ (якщо хочете редагування кошторисів)

### 3.3. Налаштування Build Settings

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`
- **Root Directory**: `./`

### 3.4. Deploy!

1. Натисніть **"Deploy"**
2. Дочекайтесь завершення (~3-5 хвилин)
3. Після деплою ви отримаєте URL: `https://your-project.vercel.app`

**⚠️ НЕ ПЕРЕХОДЬТЕ НА САЙТ ЩЕ!** Спочатку потрібно налаштувати базу даних.

---

## Етап 4: Міграція бази даних (10 хв)

### 4.1. Встановлення Prisma CLI локально

```bash
cd /Users/admin/Igor-Shiba/metrum-group
npm install
```

### 4.2. Створення production .env файлу

Створіть тимчасовий файл `.env.production.local`:

```bash
cat > .env.production.local << 'EOF'
DATABASE_URL="postgresql://ваш-railway-url?sslmode=require"
EOF
```

### 4.3. Запуск міграції

```bash
# Завантажити змінні з production файлу
export $(cat .env.production.local | xargs)

# Запустити міграцію
npx prisma db push

# Перевірка підключення
npx prisma db execute --stdin <<< "SELECT NOW();"
```

### 4.4. Створення першого адмін акаунту

**Варіант А: Через seed (з тестовими даними)**

```bash
npm run db:seed
```

Буде створено:
- Адмін: admin@metrum.group / password123
- Менеджер: manager@metrum.group / password123
- 2 клієнти + тестові проекти

**⚠️ ОБОВ'ЯЗКОВО** змініть паролі після першого входу!

**Варіант Б: Створити тільки адмін акаунт (рекомендовано)**

Створіть файл `create-admin.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "your-email@example.com"; // ЗМІНІТЬ!
  const password = "your-strong-password"; // ЗМІНІТЬ!
  const name = "Ваше Ім'я"; // ЗМІНІТЬ!

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log("✅ Адмін створено:", admin.email);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Запустіть:
```bash
npx tsx create-admin.ts
rm create-admin.ts  # Видалити після створення
```

### 4.5. Видалення тимчасового .env файлу

```bash
rm .env.production.local
```

---

## Етап 5: Підключення домену до Vercel (15 хв)

### 5.1. Додавання домену у Vercel

1. Відкрийте ваш проект у Vercel
2. Перейдіть **Settings** → **Domains**
3. Натисніть **"Add"**
4. Введіть ваш домен (наприклад: `metrumgroup.com.ua`)
5. Vercel покаже DNS записи, які потрібно додати

### 5.2. Налаштування DNS на Nic.ua

Vercel покаже один з варіантів:

**Варіант А: A записи (рекомендовано)**

У Nic.ua додайте A записи:
```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

**Варіант Б: CNAME (якщо A не підтримується)**

```
Type: CNAME
Name: @
Value: cname.vercel-dns.com

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### 5.3. Очікування поширення DNS (10-30 хвилин)

Vercel автоматично перевірить DNS і видасть SSL сертифікат.

Перевірка статусу:
```bash
# Linux/Mac
dig metrumgroup.com.ua

# Windows
nslookup metrumgroup.com.ua
```

### 5.4. Оновлення Environment Variables

1. У Vercel → Settings → Environment Variables
2. Оновіть змінні:

```env
AUTH_URL=https://metrumgroup.com.ua
NEXTAUTH_URL=https://metrumgroup.com.ua
```

3. Натисніть **"Redeploy"** щоб застосувати зміни

---

## Етап 6: Налаштування Cloudflare R2 для файлів (20 хв)

### 6.1. Створення R2 bucket

1. Зайдіть на [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Перейдіть **R2** → **Create bucket**
3. Назва: `metrum-group-files`
4. Location: Automatic
5. Натисніть **Create bucket**

### 6.2. Створення API токену

1. У R2 перейдіть **Manage R2 API Tokens**
2. Натисніть **Create API token**
3. Налаштування:
   - Token name: `metrum-vercel-access`
   - Permissions: **Object Read & Write**
   - TTL: Never expire
   - Buckets: `metrum-group-files`
4. Натисніть **Create API Token**
5. **ЗБЕРЕЖІТЬ**:
   - Access Key ID
   - Secret Access Key
   - Endpoint (має вигляд: `https://xxx.r2.cloudflarestorage.com`)

### 6.3. Додавання R2 змінних у Vercel

Додайте у Environment Variables:

```env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=metrum-group-files
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://files.metrumgroup.com.ua
```

### 6.4. Налаштування публічного доступу

1. У Cloudflare R2 відкрийте bucket `metrum-group-files`
2. Перейдіть **Settings** → **Public access**
3. Увімкніть **Allow Access**
4. Налаштуйте custom domain: `files.metrumgroup.com.ua`

### 6.5. DNS для файлів

У Nic.ua додайте CNAME запис:
```
Type: CNAME
Name: files
Value: (надасть Cloudflare)
```

---

## Етап 7: Перевірка та тестування (15 хв)

### 7.1. Перевірка доступності

1. Відкрийте: `https://metrumgroup.com.ua`
2. Переконайтесь що:
   - ✅ Сайт відкривається
   - ✅ HTTPS працює (зелений замок)
   - ✅ Немає помилок консолі

### 7.2. Тест авторізації

1. Перейдіть на `/login`
2. Увійдіть з адмін акаунтом
3. Переконайтесь що дашборд відкривається

### 7.3. Тест створення проекту

1. Створіть тестовий проект
2. Перевірте, що він зберігається
3. Завантажте тестове фото

### 7.4. Тест API

Перевірте ключові endpoint'и:
```bash
curl https://metrumgroup.com.ua/api/health
```

---

## Етап 8: Безпека та оптимізація (10 хв)

### 8.1. Зміна тестових паролів

1. Увійдіть як адмін
2. Перейдіть у налаштування користувачів
3. Змініть паролі всіх акаунтів

### 8.2. Налаштування Environment Variables

Переконайтесь що всі змінні встановлені для **Production**:

У Vercel → Settings → Environment Variables → Environment: **Production**

### 8.3. Увімкнення Analytics (опціонально)

У Vercel:
1. Analytics → Enable
2. Speed Insights → Enable
3. Web Vitals → Enable

### 8.4. Налаштування caching

Vercel автоматично кешує статичні файли, але можна оптимізувати:

У `next.config.ts` переконайтесь:
```typescript
images: {
  domains: ['files.metrumgroup.com.ua'],
  formats: ['image/webp'],
},
```

---

## Етап 9: Моніторинг та бекапи (5 хв)

### 9.1. Railway бекапи

1. У Railway відкрийте PostgreSQL
2. Settings → Backups
3. Увімкніть **Automatic Backups**
4. Частота: Daily

### 9.2. Vercel logs

Для перегляду логів:
1. Vercel → Deployments → Logs
2. Налаштуйте alerts для помилок

### 9.3. Моніторинг бази даних

Railway надає метрики:
- CPU usage
- Memory usage
- Connections
- Query performance

---

## Етап 10: Завершення (5 хв)

### 10.1. Checklist

- [ ] База даних працює на Railway
- [ ] Додаток задеплоєно на Vercel
- [ ] Домен підключено та працює HTTPS
- [ ] Cloudflare R2 налаштовано для файлів
- [ ] Адмін акаунт створено
- [ ] Тестові паролі змінено
- [ ] Бекапи налаштовано
- [ ] Аналітика увімкнена

### 10.2. Корисні команди

**Перезапуск деплою:**
```bash
# Через Vercel CLI
vercel --prod

# Або через Dashboard → Deployments → Redeploy
```

**Перегляд логів:**
```bash
vercel logs [deployment-url] --follow
```

**Міграція БД:**
```bash
DATABASE_URL="your-railway-url" npx prisma db push
```

### 10.3. Контакти підтримки

- **Vercel**: support@vercel.com
- **Railway**: team@railway.app
- **Cloudflare**: https://dash.cloudflare.com/support
- **Nic.ua**: support@nic.ua

---

## 🎉 Готово!

Ваш проект тепер працює на продакшні!

**URL**: https://metrumgroup.com.ua
**Адмін панель**: https://metrumgroup.com.ua/admin
**Клієнтський кабінет**: https://metrumgroup.com.ua/dashboard

---

## ⚠️ Важливі нотатки

1. **Ніколи** не коміттьте `.env` файли з реальними даними
2. Регулярно робіть бекапи бази даних
3. Моніторте використання ресурсів Railway та Vercel
4. Оновлюйте залежності: `npm update`
5. Перевіряйте вразливості: `npm audit`

---

## 🆘 Troubleshooting

### Помилка: "Invalid database URL"
- Перевірте що URL містить `?sslmode=require`
- Перевірте що IP не заблоковано Railway firewall

### Помилка: "Build failed"
- Перевірте логи у Vercel
- Переконайтесь що всі environment variables встановлені
- Спробуйте білд локально: `npm run build`

### Помилка: "Authentication failed"
- Перевірте AUTH_URL та NEXTAUTH_URL
- Переконайтесь що AUTH_SECRET встановлено
- Почистіть cookies та спробуйте знову

### DNS не поширюється
- Зачекайте 30-60 хвилин
- Перевірте DNS: `dig your-domain.com`
- Перевірте налаштування у Nic.ua

---

**Успішного деплою! 🚀**
