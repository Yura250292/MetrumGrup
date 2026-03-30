# 🎯 Команди для деплою - Копіюй і вставляй

## 📦 Підготовка (одноразово)

### Клонування репозиторію (якщо на новій машині)
```bash
git clone https://github.com/Yura250292/MetrumGrup.git
cd MetrumGrup
npm install
```

---

## 🗄️ КРОК 1: Railway Database

### 1. Створення бази:
- Перейти на https://railway.app/
- New Project → PostgreSQL
- Зачекати створення

### 2. Отримати DATABASE_URL:
```
Railway → PostgreSQL → Variables → DATABASE_URL
```

**ВАЖЛИВО:** Додати в кінець `?sslmode=require`

**Приклад фінального URL:**
```
postgresql://postgres:password@hostname.railway.app:5432/railway?sslmode=require
```

---

## 🚀 КРОК 2: Vercel Deployment

### 1. Імпорт проекту:
- https://vercel.com/new
- Import Git Repository
- GitHub → Yura250292/MetrumGrup

### 2. Environment Variables (додати ВСІ):

#### Обов'язкові:
```bash
# DATABASE
DATABASE_URL=postgresql://...?sslmode=require

# AUTH - згенерувати локально:
openssl rand -base64 32
# Скопіювати результат нижче:
AUTH_SECRET=тут_вставити_результат

# URLs (спочатку Vercel URL, пізніше замінити на домен)
AUTH_URL=https://your-project.vercel.app
NEXTAUTH_URL=https://your-project.vercel.app
```

#### Опціональні (AI функції):
```bash
GEMINI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key
```

### 3. Deploy:
- Натиснути **Deploy**
- Чекати 3-5 хвилин

---

## 🗄️ КРОК 3: Міграція БД та створення адміна

### На вашій машині:

```bash
# 1. Перейти в папку проекту
cd /Users/admin/Igor-Shiba/metrum-group

# 2. Встановити залежності (якщо ще не встановлено)
npm install

# 3. Створити тимчасовий .env файл
cat > .env.production.local << 'EOF'
DATABASE_URL="вставити_тут_railway_url_з_sslmode=require"
EOF

# 4. Експортувати змінні
export $(cat .env.production.local | xargs)

# 5. Запустити міграцію
npm run deploy:migrate

# 6. Перевірка статусу БД
npm run deploy:db-status

# 7. Створити адмін акаунт
ADMIN_EMAIL="ваш@email.com" \
ADMIN_PASSWORD="надійний-пароль-123" \
ADMIN_NAME="Ваше Ім'я" \
ADMIN_PHONE="+380501234567" \
npm run deploy:create-admin

# 8. ВАЖЛИВО! Записати дані для входу:
# Email: ваш@email.com
# Password: надійний-пароль-123

# 9. Видалити тимчасовий файл
rm .env.production.local
unset DATABASE_URL
```

---

## 🌐 КРОК 4: Домен на Nic.ua

### 1. Купівля домену:
- https://nic.ua/
- Знайти та купити домен
- Приклад: `metrumgroup.com.ua`

### 2. Додати домен у Vercel:
```
Vercel → Settings → Domains → Add
Ввести: metrumgroup.com.ua
```

### 3. DNS налаштування на Nic.ua:

**Спосіб 1: A записи (рекомендовано)**
```
Запис 1:
Type: A
Name: @
Value: 76.76.21.21
TTL: 3600

Запис 2:
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 3600
```

**Спосіб 2: Тільки CNAME**
```
Запис 1:
Type: CNAME
Name: @
Value: cname.vercel-dns.com

Запис 2:
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### 4. Чекати поширення DNS (15-30 хвилин)

### 5. Перевірка DNS:
```bash
# Mac/Linux
dig metrumgroup.com.ua

# Windows
nslookup metrumgroup.com.ua
```

### 6. Оновити Environment Variables у Vercel:
```
AUTH_URL=https://metrumgroup.com.ua
NEXTAUTH_URL=https://metrumgroup.com.ua
```

### 7. Redeploy у Vercel:
```
Vercel → Deployments → ... (три крапки) → Redeploy
```

---

## 📁 КРОК 5: Cloudflare R2 (Опціонально для файлів)

### 1. Створити Bucket:
```
Cloudflare → R2 → Create bucket
Name: metrum-group-files
Location: Automatic
```

### 2. Створити API Token:
```
R2 → Manage R2 API Tokens → Create API Token
Name: metrum-vercel-access
Permissions: Object Read & Write
Bucket: metrum-group-files
```

**ЗБЕРЕГТИ:**
- Access Key ID
- Secret Access Key
- Endpoint

### 3. Додати у Vercel Environment Variables:
```bash
R2_ACCOUNT_ID=ваш-account-id
R2_ACCESS_KEY_ID=скопійований-access-key
R2_SECRET_ACCESS_KEY=скопійований-secret-key
R2_BUCKET_NAME=metrum-group-files
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://files.metrumgroup.com.ua
```

### 4. Public Access (для відображення файлів):
```
R2 → metrum-group-files → Settings → Public access
Enable: Allow Access
Custom domain: files.metrumgroup.com.ua
```

### 5. DNS для файлів на Nic.ua:
```
Type: CNAME
Name: files
Value: (надасть Cloudflare, щось на кшталт xxx.r2.dev)
```

### 6. Redeploy Vercel

---

## ✅ Перевірка роботи

### 1. Відкрити сайт:
```
https://metrumgroup.com.ua
```

### 2. Перевірити HTTPS:
- Зелений замок в браузері
- Сертифікат валідний

### 3. Тест логіну:
```
https://metrumgroup.com.ua/login
Email: ваш@email.com (який створювали)
Password: ваш_пароль
```

### 4. Адмін панель:
```
https://metrumgroup.com.ua/admin
```

### 5. Створити тестовий проект:
- Admin → Проєкти → Новий проєкт
- Заповнити форму
- Зберегти

---

## 🔧 Корисні команди після деплою

### Перевірка стану БД:
```bash
DATABASE_URL="your-railway-url" npm run deploy:db-status
```

### Створити нового адміністратора:
```bash
DATABASE_URL="your-railway-url" \
ADMIN_EMAIL="new-admin@email.com" \
ADMIN_PASSWORD="secure-password" \
ADMIN_NAME="Admin Name" \
npm run deploy:create-admin
```

### Перевірка environment variables:
```bash
npm run deploy:check-env
```

### Vercel redeploy через CLI:
```bash
# Встановити Vercel CLI
npm i -g vercel

# Логін
vercel login

# Redeploy
vercel --prod
```

### Vercel logs:
```bash
vercel logs [deployment-url] --follow
```

---

## 🆘 Швидкі фікси

### Помилка: "Database connection failed"
```bash
# Перевірити що URL має ?sslmode=require
echo $DATABASE_URL

# Має закінчуватись на:
# ...railway.app:5432/railway?sslmode=require
```

### Помилка: "Invalid AUTH_SECRET"
```bash
# Згенерувати новий
openssl rand -base64 32

# Додати у Vercel ENV vars
# Redeploy
```

### Помилка: "Not found" після деплою
```bash
# Перевірити що AUTH_URL === ваш домен
# У Vercel → Settings → Environment Variables
AUTH_URL=https://your-actual-domain.com
NEXTAUTH_URL=https://your-actual-domain.com

# Redeploy!
```

### Сайт працює, але файли не завантажуються
```bash
# Перевірити R2 змінні у Vercel
# Перевірити Public access у Cloudflare
# Перевірити DNS запис для files.domain.com
```

---

## 📊 Моніторинг

### Vercel:
```
Dashboard → Analytics
Dashboard → Logs
```

### Railway:
```
PostgreSQL → Metrics
PostgreSQL → Logs
```

### Перевірка uptime:
```bash
curl -I https://metrumgroup.com.ua
# Має повернути: HTTP/2 200
```

---

## 🔄 Оновлення проекту

### Після змін в коді:
```bash
# 1. Закомітити зміни
git add .
git commit -m "feat: your changes"

# 2. Запушити на GitHub
git push origin main

# 3. Vercel автоматично задеплоїть!
# (якщо підключено auto-deploy)
```

### Ручний redeploy:
```
Vercel → Deployments → Latest → ... → Redeploy
```

---

## 🗒️ Важливі URL (записати для себе)

```
GitHub Repo: https://github.com/Yura250292/MetrumGrup
Vercel Dashboard: https://vercel.com/dashboard
Railway Dashboard: https://railway.app/dashboard
Cloudflare Dashboard: https://dash.cloudflare.com/

Production URL: https://_______________
Admin Panel: https://_____________/admin
Database Host: _______________
R2 Bucket: metrum-group-files

Admin Email: _______________
Admin Password: _______________ (зберегти безпечно!)
```

---

## 📚 Повна документація

- **Детальний гайд**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Швидкий старт**: [QUICK-START.md](./QUICK-START.md)
- **Checklist**: [.deployment-checklist.md](./.deployment-checklist.md)
- **Безпека**: [SECURITY.md](./SECURITY.md)

---

**Успішного деплою! 🚀**

Якщо виникли питання - дивіться DEPLOYMENT.md або пишіть в issues на GitHub.
