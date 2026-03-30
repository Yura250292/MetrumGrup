# ⚡ Швидкий старт - Деплой за 30 хвилин

## 📋 Передумови

- ✅ Vercel Pro акаунт
- ✅ Railway Pro акаунт
- ✅ Cloudflare акаунт
- ✅ Домен на Nic.ua
- ✅ GitHub акаунт з репозиторієм

---

## 🚀 Крок 1: Railway БД (5 хв)

```bash
1. Railway.app → New Project → PostgreSQL
2. Скопіювати DATABASE_URL
3. Додати в кінець: ?sslmode=require
```

**Приклад:**
```
postgresql://postgres:pass@region.railway.app:5432/railway?sslmode=require
```

---

## 🚀 Крок 2: Vercel (10 хв)

### Import проекту
```
Vercel → New Project → Import з GitHub
```

### Environment Variables
```env
DATABASE_URL=your-railway-url?sslmode=require
AUTH_SECRET=згенеруй через: openssl rand -base64 32
AUTH_URL=https://your-project.vercel.app
NEXTAUTH_URL=https://your-project.vercel.app
GEMINI_API_KEY=optional
ANTHROPIC_API_KEY=optional
OPENAI_API_KEY=optional
```

### Deploy
```
Натиснути Deploy і чекати 3-5 хв
```

---

## 🚀 Крок 3: Міграція БД (5 хв)

### Локально:

```bash
# 1. Створити тимчасовий .env
cat > .env.production.local << 'EOF'
DATABASE_URL="your-railway-url?sslmode=require"
EOF

# 2. Експортувати змінні
export $(cat .env.production.local | xargs)

# 3. Міграція
npm run deploy:migrate

# 4. Створити адміна
ADMIN_EMAIL=your@email.com \
ADMIN_PASSWORD=strong-password \
ADMIN_NAME="Your Name" \
npm run deploy:create-admin

# 5. Видалити тимчасовий файл
rm .env.production.local
```

---

## 🚀 Крок 4: Домен (5 хв)

### У Vercel:
```
Settings → Domains → Add → your-domain.com
```

### У Nic.ua:
```
Додати A запис:
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### Оновити Vercel ENV:
```env
AUTH_URL=https://your-domain.com
NEXTAUTH_URL=https://your-domain.com
```

**Redeploy у Vercel!**

---

## 🚀 Крок 5: Cloudflare R2 (5 хв)

### Створити bucket:
```
Cloudflare → R2 → Create bucket → metrum-files
```

### API Token:
```
Create API token → Read & Write
Зберегти: Access Key ID, Secret, Endpoint
```

### Додати у Vercel ENV:
```env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=key
R2_SECRET_ACCESS_KEY=secret
R2_BUCKET_NAME=metrum-files
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
```

**Redeploy!**

---

## ✅ Готово!

### Перевірка:
```bash
# Відкрити сайт
https://your-domain.com

# Логін
https://your-domain.com/login

# Адмін панель
https://your-domain.com/admin
```

---

## 🛠️ Корисні команди

### Перевірка БД:
```bash
DATABASE_URL="your-url" npm run deploy:db-status
```

### Створити нового адміна:
```bash
DATABASE_URL="your-url" \
ADMIN_EMAIL=new@email.com \
ADMIN_PASSWORD=password \
npm run deploy:create-admin
```

### Перевірка змінних:
```bash
npm run deploy:check-env
```

### Redeploy на Vercel:
```bash
# Через dashboard
Vercel → Deployments → Redeploy

# Або push в GitHub
git push origin main
```

---

## 🆘 Troubleshooting

### "Database connection failed"
```bash
# Перевірити URL
echo $DATABASE_URL

# Має бути: ?sslmode=require в кінці
```

### "Auth error"
```bash
# Перевірити AUTH_URL === домен
# Почистити cookies
# Згенерувати новий AUTH_SECRET
```

### "Build failed"
```bash
# Перевірити логи у Vercel
# Перевірити всі ENV vars
# Спробувати білд локально:
npm run build
```

---

## 📚 Повна документація

Дивись [DEPLOYMENT.md](./DEPLOYMENT.md) для детальних інструкцій.

---

**Успіхів! 🎉**
