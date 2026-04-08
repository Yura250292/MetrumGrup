# Налаштування Cloudflare R2 для великих файлів

Цей гайд допоможе налаштувати Cloudflare R2 для вирішення проблеми **413 Payload Too Large** при генерації кошторисів з великими файлами на продакшені.

---

## Крок 1: Отримання R2 Credentials

### 1.1 Отримати Account ID

1. Зайдіть в [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. В правому сайдбарі знайдіть **Account ID**
3. Скопіюйте його (формат: `1234567890abcdef1234567890abcdef`)

### 1.2 Створити R2 API Token

1. В Cloudflare Dashboard перейдіть в **R2** → **Overview**
2. Натисніть **Manage R2 API Tokens**
3. Натисніть **Create API Token**
4. Оберіть права:
   - **Permission Type:** `Object Read & Write` (або `Admin Read & Write`)
   - **Apply to specific buckets:** Оберіть `metrum-estimates` bucket
5. Натисніть **Create API Token**
6. **ЗБЕРЕЖІТЬ** дані (показуються тільки один раз!):
   - Access Key ID: `abc123...`
   - Secret Access Key: `xyz789...`

---

## Крок 2: Налаштування Environment Variables

### 2.1 На локальному сервері (для тестування)

Відредагуйте файл `.env.local`:

```bash
# Cloudflare R2 Storage
R2_ACCOUNT_ID="ваш-account-id-з-кроку-1.1"
R2_ACCESS_KEY_ID="ваш-access-key-id-з-кроку-1.2"
R2_SECRET_ACCESS_KEY="ваш-secret-access-key-з-кроку-1.2"
R2_BUCKET_NAME="metrum-estimates"
```

### 2.2 На продакшн сервері (metrum-grup.biz.ua)

Залежно від вашого хостингу:

#### Варіант A: Vercel
1. Зайдіть в Vercel Dashboard → ваш проект
2. **Settings** → **Environment Variables**
3. Додайте 4 змінні:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME` (значення: `metrum-estimates`)
4. **Save** і **Redeploy**

#### Варіант B: VPS / Shared Hosting
1. SSH в сервер
2. Відредагуйте `.env` файл в корені проєкту:
   ```bash
   nano /path/to/metrum-group/.env
   ```
3. Додайте змінні (як у 2.1)
4. Перезапустіть додаток:
   ```bash
   pm2 restart metrum-group
   # або
   systemctl restart metrum-group
   ```

---

## Крок 3: Перевірка роботи

### 3.1 Тест на localhost

```bash
cd /Users/admin/Igor-Shiba/metrum-group
npm run dev
```

1. Відкрийте http://localhost:3000/admin/estimates/ai-generate
2. Завантажте файли < 10MB
3. Повинно працювати **без R2** (direct upload)
4. Перевірте консоль браузера - має бути `📁 Direct mode: Sending files directly`

### 3.2 Тест на production

1. Зайдіть на https://metrum-grup.biz.ua/admin/estimates/ai-generate
2. Завантажте файли > 10MB (наприклад, 36MB як у вашому випадку)
3. Перевірте консоль браузера:
   - Має бути `📤 Production mode: Uploading files to R2 first...`
   - Потім `✅ Uploaded X files to R2`
   - Потім генерація кошторису

---

## Крок 4: Перевірка логів (якщо щось не працює)

### 4.1 Перевірити чи R2 налаштований

Відкрийте Developer Tools (F12) → Console і запустіть:

```javascript
fetch('/api/admin/estimates/upload-r2', {
  method: 'POST',
  body: new FormData()
}).then(r => r.json()).then(console.log);
```

**Очікуваний результат:**
- На localhost: `{error: "R2 not needed", useDirectUpload: true}`
- На production без credentials: `{error: "R2 not configured"}`
- На production з credentials: `{error: "No files provided"}`

### 4.2 Перевірити логи сервера

Якщо генерація не працює:

```bash
# Vercel
vercel logs

# PM2
pm2 logs metrum-group --lines 100

# Docker
docker logs metrum-group
```

Шукайте повідомлення:
- `📤 Uploading to R2: ...` - файли завантажуються
- `✅ Uploaded: ...` - успішно
- `❌ R2 upload error: ...` - помилка завантаження

---

## Крок 5: Очищення тимчасових файлів (опціонально)

R2 файли зберігаються в папці `/temp/...` і автоматично не видаляються.

### Автоматичне очищення (рекомендується)

Додайте в Cloudflare R2 **Lifecycle Rule**:

1. Cloudflare Dashboard → R2 → `metrum-estimates` bucket
2. **Settings** → **Lifecycle Rules**
3. **Add Rule**:
   - Name: `Delete temp files after 7 days`
   - Prefix: `temp/`
   - Action: `Delete after X days` → `7`
4. **Save**

Тепер файли в `temp/` видалятимуться через 7 днів.

### Ручне очищення

```bash
# Використовуючи wrangler CLI
npx wrangler r2 object delete metrum-estimates/temp/ --recursive
```

---

## Troubleshooting

### Помилка: "413 Payload Too Large"

**Причина:** R2 не налаштований або не працює.

**Рішення:**
1. Перевірте що всі 4 змінні є в `.env`
2. Перевірте що значення правильні (без пробілів, лапок)
3. Перезапустіть сервер після зміни `.env`

### Помилка: "R2 not configured"

**Причина:** Environment variables не встановлені.

**Рішення:**
1. Перевірте `.env` файл
2. На production перевірте environment variables в панелі хостингу
3. Перезапустіть додаток

### Помилка: "Failed to download ... from R2"

**Причина:** Підписана URL застаріла (>1 година).

**Рішення:**
- Це нормально тільки якщо генерація триває >1 год
- Спробуйте ще раз (нова URL буде створена)

### Файли не завантажуються в R2 на localhost

**Це нормально!** На localhost R2 не використовується (файли < безмежність).

Для тестування R2 на localhost:
1. Змініть в коді умову: `totalSize > 1 * 1024 * 1024` (1MB замість 10MB)
2. Або встановіть `NODE_ENV=production` в `.env.local`

---

## Підсумок

✅ Після налаштування R2:
- На **localhost**: файли відправляються напряму (без R2)
- На **production** з файлами < 10MB: файли відправляються напряму
- На **production** з файлами > 10MB: файли спочатку завантажуються в R2, потім URL передається в API

Це дозволяє обійти ліміт 413 Payload Too Large на продакшн серверах!

---

## Контакти

Якщо виникли проблеми - пишіть в Issues або Telegram.
