# Task 15 — Native Mobile App (Capacitor wrapper або Enhanced PWA)

> **Priority:** 🟡 SHOULD-HAVE | **Estimate:** Option A — 4–6 тижнів / Option B — 2 тижні | **Owner:** ___
> **Спрінт:** після стабілізації push-notification інфраструктури

---

## Mission

Дати PM / керівнику / SUPER_ADMIN зручний мобільний доступ до Metrum Group: швидкий перегляд KPI, прийняття/підтвердження foreman-звітів, push-нагадування про дедлайни, біометричний вхід.

**Дві опції:**
- **Option A — Capacitor wrapper** над існуючою PWA → нативні застосунки в App Store / Google Play.
- **Option B — Enhanced PWA** → доводимо існуючу PWA до native-like UX без app-stores.

**Рекомендація:** **Option B як MVP** (2 тижні, без apple-developer-coast, без app-store gates), через 3-6 міс оцінити чи треба Option A на основі реального користування.

---

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), next-auth, Anthropic + Gemini, Jest.
**PWA інфраструктура:** Service Worker **v5.3.0** (motion + premium CSS перенесено з Edyshyn 2026-04-27). Manifest у `public/manifest.webmanifest`.
**Foreman PWA:** `src/app/foreman/*` — kiosk-режим уже працює.
**Notifications:** `src/lib/notifications/` — multi-channel (in-app + Telegram).
**Telegram bot:** `bot/` — alternative push-канал (вже доступний).

---

## Business Goal

**Прибрати friction "відкрити браузер → залогінитись → знайти потрібне" для керівника, який 80% часу в полі.**

**Метрики успіху:**
- ≥70% активних SUPER_ADMIN/MANAGER користуються mobile-режимом (≥3 рази/тиждень).
- ≥50% push-нотифікацій про деделдайни → клік → дія за <60 сек.
- Час від отримання foreman-звіту до approve/reject (mobile) → <2 хв.
- Biometric login → 95% успішних спроб з першого разу.

**Чому це окупається:**
- Зараз керівник пропускає важливі апруви бо "пізніше з ноутбуком" → проєкт стопиться.
- Push з Telegram bot — не всі читають. Push з власної іконки на хоум-екрані — читають.

---

## 🎯 Порівняльна матриця Option A vs B

| Критерій                       | Option A — Capacitor               | Option B — Enhanced PWA          |
|--------------------------------|------------------------------------|----------------------------------|
| **Час до релізу**              | 4–6 тижнів                         | 2 тижні                          |
| **App Store присутність**      | ✅ Так (іконка, рейтинг, search)   | ❌ Ні ("Add to Home Screen")     |
| **Push notifications iOS**     | ✅ APNs (надійно з 2010)           | ⚠️ Web Push (iOS 16.4+, обмеження) |
| **Push notifications Android** | ✅ FCM                             | ✅ Web Push (стабільно)          |
| **Biometric auth**             | ✅ Native Touch/Face ID            | ✅ WebAuthn (iOS 17+, Android 14+) |
| **Камера (вибір об'єктиву)**   | ✅ Повний контроль                 | ⚠️ Базовий через `<input capture>` |
| **Offline-first**              | ✅ Native FS + SQLite              | ✅ SW v5.3.0 + IndexedDB         |
| **Home screen widget**         | ✅ iOS WidgetKit / Android AppWidget (нативний Swift/Kotlin окремо) | ❌ Ні |
| **Geolocation background**     | ✅ Capacitor BG plugins            | ⚠️ Тільки foreground             |
| **Distribution**               | TestFlight + Internal Testing      | URL → "Add to Home Screen"       |
| **Apple Dev Account**          | $99/year                           | $0                               |
| **Google Play Account**        | $25 одноразово                     | $0                               |
| **Auto-update без store**      | ⚠️ Capgo ($) / Microsoft CodePush (deprecated) | ✅ Service Worker hot reload |
| **Підтримка (maintenance)**    | 2 платформи + web (3x complexity)  | 1 codebase                       |
| **Доступ до сервісних API**    | ✅ Все що дають plugins            | Тільки веб-API                   |
| **Performance**                | Native UI = native feel            | Близько до native (з SW кешем)   |
| **Estimate**                   | 4–6 тижнів + ongoing maintenance   | 2 тижні + мінімальний ongoing    |
| **Ризики**                     | Apple review reject, plugin compat | iOS Web Push edge-cases, "Add to Home Screen" UX |

**Рекомендація:** **Option B зараз → Option A через 3-6 міс якщо дані підтверджують.**

Якщо ≥70% SUPER_ADMIN/MANAGER реально клікають push і користуються PWA — інвестувати в Option A.
Якщо ні — Telegram bot + Web Push покривають 90% сценарію за 10% бюджету.

---

## Out of Scope (для обох опцій)

- ❌ Окрема mobile-only UX (повного дизайн-редизайну не робимо — використовуємо existing admin-v2 responsive).
- ❌ Multi-language (UA-only).
- ❌ In-app purchases (не наша модель).
- ❌ Tablet/iPad-specific layouts (тільки phone-first).
- ❌ Apple Watch / WearOS companion app.

---

## Prerequisites (обидві опції)

- [ ] **Узгодити з користувачем:** Option A, Option B чи фазована (B зараз → A потім)?
- [ ] **VAPID keys** для Web Push — згенерувати `web-push generate-vapid-keys`, зберігати в ENV.
- [ ] **Іконки/сплеші** — підготувати:
  - PWA icons: 192, 256, 384, 512 (PNG, maskable + any)
  - Apple touch icons: 180×180 precomposed
  - iOS splash screens: ~20 розмірів (iPhone SE → iPhone 16 Pro Max)
  - Apple Developer Account ($99) — тільки для Option A.
- [ ] **Узгодити дизайн "Add to Home Screen" prompt** компонента (для iOS — instructional UI, для Android — beforeinstallprompt).
- [ ] **Узгодити: які scenarios push-критичні** (рекомендую: ForemanReport submitted, Task assigned, Mention in chat, Deadline approaching).
- [ ] **Узгодити retention:** як довго зберігаємо `PushSubscription` після last use (рекомендую 90 днів неактивності → авто-видалення).

---

## 🚨 Parallel Conflicts

| Файл                                          | Конфлікт з           | Стратегія              |
| --------------------------------------------- | -------------------- | ---------------------- |
| `prisma/schema.prisma`                        | **усі task-и**       | 🔴 серіалізувати       |
| `public/sw.js` (Service Worker v5.3.0)        | будь-які SW зміни    | 🔴 узгодити (bump до v6.0.0) |
| `public/manifest.webmanifest`                 | 12 (kiosk PWA)       | 🟡 узгодити            |
| `src/lib/notifications/dispatch.ts`           | 12, 13               | 🟡 додати `push` channel |
| `src/components/auth/BiometricLogin.tsx`      | новий — без конфлікту | 🟢                     |
| `src/lib/push/*`                              | нові — без конфлікту | 🟢                     |
| `src/app/api/me/push-subscriptions/*`         | нові — без конфлікту | 🟢                     |
| `src/app/api/internal/push/send/*`            | нові — без конфлікту | 🟢                     |
| `package.json` (`web-push`)                   | усі                  | 🟡                     |

**Якщо Option A додатково:**
| Файл                                          | Конфлікт             | Стратегія              |
| --------------------------------------------- | -------------------- | ---------------------- |
| `capacitor.config.ts` (новий)                 | — | 🟢 |
| `ios/*` (новий)                               | — | 🟢 окрема директорія |
| `android/*` (новий)                           | — | 🟢 окрема директорія |
| `next.config.ts` (`output: 'export'`?)        | усі SSR-залежні task-и | 🔴 БЛОКЕР — потребує перегляду |

---

## Data Model (Prisma) — обидві опції

```prisma
enum PushChannel {
  WEB                // Web Push API (Option B)
  IOS                // APNs (Option A)
  ANDROID            // FCM (Option A)
}

model PushSubscription {
  id              String       @id @default(cuid())
  userId          String
  channel         PushChannel  @default(WEB)
  endpoint        String       @unique                                  // Web Push endpoint URL АБО device token (APNs/FCM)
  keys            Json?                                                 // {p256dh, auth} для Web Push; null для native
  userAgent       String?
  deviceLabel     String?                                               // "iPhone 15, Safari" / "Pixel 8, Chrome"
  createdAt       DateTime     @default(now())
  lastUsedAt      DateTime     @default(now())                          // оновлюється при успішному send
  isActive        Boolean      @default(true)
  failureCount    Int          @default(0)                              // лічильник failed sends; >5 → деактивуємо

  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isActive])
  @@index([lastUsedAt])                                                 // для cron очищення старих
}

model PushDeliveryLog {
  id                  String              @id @default(cuid())
  subscriptionId      String?
  userId              String
  title               String
  body                String              @db.Text
  payload             Json?                                             // deep-link data
  status              String                                            // SENT|FAILED|EXPIRED|CLICKED
  sentAt              DateTime            @default(now())
  errorMessage        String?
  ms                  Int?

  subscription        PushSubscription?   @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)
  user                User                @relation(fields: [userId], references: [id])

  @@index([userId, sentAt])
  @@index([status, sentAt])
}

// === Зміни в існуючих моделях ===

model User {
  // ... існуючі поля
  pushSubscriptions   PushSubscription[]
  pushDeliveryLogs    PushDeliveryLog[]
  webauthnCredentials Json?                                             // для біометрії WebAuthn (Option B)
}
```

---

## Migration Strategy

1. Локально `prisma migrate dev --name add_push_subscriptions --create-only`.
2. Production: `prisma migrate deploy`. Без backfill — нові таблиці.
3. ENV: додати `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:admin@metrum.ua).
4. Service Worker bump до v6.0.0 (форс-update існуючим клієнтам) — додає push event handler.

---

## Option B — Enhanced PWA (РЕКОМЕНДОВАНО)

### Service Worker (v6.0.0)

Розширити `public/sw.js`:

```js
// Push event handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'Metrum Group';
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: data.url, payload: data.payload },
    tag: data.tag || 'default',          // de-duplication
    renotify: data.renotify ?? false,
    requireInteraction: data.priority === 'high',
    actions: data.actions || [],         // [{action: 'approve', title: 'Approve'}, ...]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      const existing = windowClients.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
  // Telemetry: POST /api/internal/push/click з payload
});

// Background Sync (для offline-форм)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-foreman-reports') {
    event.waitUntil(syncQueuedForemanReports());
  }
});
```

### Service `src/lib/push/web-push.ts`

```ts
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;          // deep-link
  tag?: string;          // de-dup
  priority?: 'normal' | 'high';
  actions?: Array<{ action: string; title: string }>;
  payload?: Record<string, unknown>;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  // 1. fetch active PushSubscription[] для userId
  // 2. для кожної — webpush.sendNotification(sub, JSON.stringify(payload))
  // 3. catch 410 Gone / 404 → sub.isActive=false
  // 4. catch інші помилки → failureCount++; >5 → isActive=false
  // 5. лог у PushDeliveryLog
}
```

### Інтеграція з `src/lib/notifications/`

Додати `push` channel у `dispatch.ts`:
```ts
const channels = preferences.channels; // ['in-app', 'telegram', 'push']
if (channels.includes('push')) {
  await sendPushToUser(userId, { title, body, url: deepLink });
}
```

### Frontend hooks

`src/lib/push/client.ts`:
- `subscribeToPush()` — request permission → register SW → subscribe → POST до `/api/me/push-subscriptions`.
- `unsubscribeFromPush()` — unsubscribe + DELETE.
- `isPushSupported()` — feature detection.

UI компонент `src/components/notifications/PushPermissionPrompt.tsx`:
- Показуємо не при першому visit (Apple guidelines — annoying), а коли user пропустив 2 важливі notifications.
- iOS specific: вимагає що PWA вже встановлена ("Add to Home Screen") — інакше permission не доступний.

### WebAuthn біометрія

`src/components/auth/BiometricLogin.tsx`:
- Registration: при перших success login → propose "Enable Face ID / Touch ID" → `navigator.credentials.create({ publicKey })`.
- Login: на login screen — кнопка "Continue with Face ID" → `navigator.credentials.get({ publicKey })`.
- Server: `src/lib/auth/webauthn.ts` — challenge generation + verification (бібліотека `@simplewebauthn/server`).

### iOS PWA polish

- `app/layout.tsx` meta:
  ```tsx
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Metrum" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
  <meta name="theme-color" content="#1a1a1a" />
  ```
- Splash screens — генерувати через `pwa-asset-generator` (npm) для всіх розмірів.
- Status bar handling в standalone-mode (safe-area-inset-* у CSS).

### "Add to Home Screen" UX

Компонент `src/components/pwa/InstallPrompt.tsx`:
- **iOS Safari** detection → показуємо modal "Tap Share → Add to Home Screen" з SVG-інструкцією.
- **Android Chrome** → listen `beforeinstallprompt` event → показуємо нашу кнопку → `event.prompt()`.
- Cooldown: не показуємо знову якщо dismiss-нули за останні 30 днів (localStorage).

### Background Sync для offline-форм

- Foreman заповнив звіт у метро без інтернету → submit → SW ставить у IndexedDB queue → `sync-foreman-reports` tag.
- При появі connectivity — SW з sync event піднімає queue → POST на API → видаляє з queue.

---

## Option A — Capacitor wrapper (OUTLINE)

### Setup

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`.
2. `npx cap init "Metrum" "ua.metrum.app"`.
3. `capacitor.config.ts`:
   ```ts
   export default {
     appId: 'ua.metrum.app',
     appName: 'Metrum',
     webDir: 'out',                     // якщо `next export`
     server: { url: 'https://app.metrum.ua', cleartext: false }, // АБО bundled static
   };
   ```

### Two distribution strategies

**Strategy 1 — Hybrid (рекомендую):**
- App-bundle = тонкий shell (splash + login screen).
- Весь UI вантажиться з `https://app.metrum.ua` через WebView.
- + Простіше оновлення (server-side).
- − Не працює offline-first.

**Strategy 2 — Static bundle:**
- `next build && next export` (потребує перегляду всього SSR коду — БЛОКЕР для Metrum через next-auth/API routes).
- + Працює offline.
- − Складна синхронізація API endpoints + auth.

### Native plugins

- `@capacitor/push-notifications` — FCM/APNs registration + handling.
- `@capacitor/biometric-auth` (community) — Touch/Face ID.
- `@capacitor/camera` — фото з вибором lens (для foreman).
- `@capacitor/geolocation` — site visit check-in.
- `@capacitor/filesystem` — local file cache.
- `@capacitor/network` — connectivity events.
- `@capacitor/local-notifications` — local reminders без push server.

### Home Widget (БОНУС, окремо)

- iOS: WidgetKit (Swift) — окремий extension у Xcode-проєкті. Не покривається Capacitor.
- Android: AppWidget (Kotlin) — окремий module.
- Дані: widget читає з shared keychain/UserDefaults куди main app пише snapshot.
- Estimate: +1 тиждень Swift/Kotlin розробки.

### Distribution

- **iOS:** TestFlight (internal beta) → App Store Review (5-7 днів) → production. Apple Developer Program $99/year.
- **Android:** Google Play Internal Track → Closed Testing → Production. $25 one-time.

### Auto-update без app-store

- Native code (Swift/Kotlin) update — тільки через store.
- Web content (WebView) update — миттєво (server-side).
- Capgo (commercial, ~$30/міс) для bundled Strategy 2.
- Microsoft CodePush — deprecated для нових апп з 2024.

---

## API Endpoints (обидві опції)

```
# Subscription management
GET    /api/me/push-subscriptions               # list мої
POST   /api/me/push-subscriptions               # register нову
DELETE /api/me/push-subscriptions/:id           # unregister
PATCH  /api/me/push-subscriptions/:id           # update deviceLabel

# Internal (server-side)
POST   /api/internal/push/send                  # для service callers (тільки internal token)
POST   /api/internal/push/click                 # telemetry callback від SW

# WebAuthn (Option B)
POST   /api/auth/webauthn/register-challenge
POST   /api/auth/webauthn/register
POST   /api/auth/webauthn/login-challenge
POST   /api/auth/webauthn/login

# Admin
GET    /api/admin/push/delivery-stats           # для аналітики (SUPER_ADMIN)
POST   /api/admin/push/cleanup-inactive         # cron: видалити sub з lastUsedAt > 90d
```

---

## UI Changes

### Нові компоненти

- `src/components/pwa/InstallPrompt.tsx` — iOS/Android-aware install banner.
- `src/components/notifications/PushPermissionPrompt.tsx` — soft-ask permission.
- `src/components/notifications/PushSubscriptionsList.tsx` — у settings: список девайсів з можливістю logout девайса.
- `src/components/auth/BiometricLogin.tsx` — WebAuthn enroll + login.
- `src/components/auth/BiometricEnrollPrompt.tsx` — після успішного login пропонує enable.

### Settings page

`src/app/admin-v2/settings/notifications/page.tsx`:
- "Активні пристрої" — список PushSubscription, кнопка "Вийти на пристрої".
- Toggle "Web Push notifications" (per-channel preference).
- Toggle "Telegram notifications".
- "Біометричний вхід" — enable/disable WebAuthn.

### Foreman PWA enhancement

- Background Sync: offline-форми (звіт без інтернету → синхронізується пізніше).
- Install prompt — після 3-го візиту запропонувати додати на хоум-екран.

---

## Implementation Plan — Option B (детально, 2 тижні)

### Тиждень 1

1. **Узгодити open questions** (B vs A, які scenarios push-критичні).
2. **VAPID keys** + ENV setup.
3. **Prisma schema:** PushSubscription + PushDeliveryLog + User extensions.
4. **Service: `src/lib/push/web-push.ts`** з `web-push` npm package.
5. **API endpoints**: 5 routes (`/api/me/push-subscriptions/*`, `/api/internal/push/send`, `/api/internal/push/click`).
6. **SW bump до v6.0.0** — push handler + notificationclick + Background Sync.
7. **Frontend hooks `src/lib/push/client.ts`** — subscribe/unsubscribe/feature-detect.
8. **InstallPrompt компонент** — iOS instructions + Android beforeinstallprompt.
9. **Інтеграція з `src/lib/notifications/dispatch.ts`** — додати `push` channel.

### Тиждень 2

10. **iOS PWA polish:** apple-touch-icon, splash screens (20+ розмірів через pwa-asset-generator), meta tags.
11. **PushPermissionPrompt** — soft-ask UX (не на першому visit).
12. **Settings page** для управління subscriptions.
13. **WebAuthn registration + login** flow (бібліотека `@simplewebauthn/server`).
14. **BiometricLogin компонент**.
15. **Background Sync для foreman-форм** (IndexedDB queue + sync event).
16. **Cleanup cron** — деактивувати subscriptions з lastUsedAt > 90 днів.
17. **Tests:** subscription lifecycle, VAPID signature, fallback на in-app.
18. **QA на пристроях:** iPhone (Safari, Chrome), Android (Chrome, Samsung Internet), desktop Chrome/Edge/Firefox/Safari.
19. **Документація:** `docs/pwa/INSTALL_GUIDE.md` для користувачів + `docs/pwa/DEVOPS.md` про VAPID rotation.
20. **Production deploy** + monitoring delivery rate перші 2 тижні.

---

## Implementation Plan — Option A (outline, 4–6 тижнів)

1. Setup Capacitor (1-2 дні).
2. Apple Developer enrollment ($99, потребує DUNS — 2 тижні очікування для першого разу!).
3. Google Play Console ($25 одноразово).
4. Native iOS shell + plugin integration (1 тиждень).
5. Native Android shell + plugin integration (1 тиждень).
6. Push notifications setup (APNs certificates + FCM project) — 3-5 днів.
7. App Store review prep: screenshots, privacy policy, App Privacy details — 1 тиждень.
8. TestFlight beta → feedback → fixes — 1 тиждень.
9. App Store submission → review (5-7 днів) → production.
10. Home Widget (опційно, +1 тиждень).

---

## Acceptance Criteria

### Option B (MVP)

- [ ] User subscribes to push з iPhone Safari (PWA installed) → отримує test notification за <10 сек.
- [ ] User subscribes з Android Chrome → notification приходить навіть при закритій вкладці.
- [ ] Click on notification → відкриває deep-link URL у PWA (а не в новому tab).
- [ ] Soft-ask permission з'являється тільки після 2-х missed notifications (не на першому visit).
- [ ] Subscription з failureCount > 5 авто-деактивується.
- [ ] Cron видаляє subscriptions з lastUsedAt > 90 днів.
- [ ] Biometric login через WebAuthn працює на iOS 17+ і Android 14+.
- [ ] Foreman заповнює форму без інтернету → з'являється в admin після підключення (Background Sync).
- [ ] Install prompt не показується знову після dismiss (cooldown 30 днів).
- [ ] PushDeliveryLog містить кожну спробу send з status.

### Option A (додатково)

- [ ] App пройшла Apple Review без rejection.
- [ ] App опублікована в TestFlight + Google Play Internal Track.
- [ ] APNs push доставляється за <3 сек у foreground і background.
- [ ] Touch/Face ID login працює без падінь на тестових моделях.
- [ ] OTA update web-частини (без store) — реально оновлює UI.

---

## Testing

- `src/lib/push/__tests__/web-push.test.ts` — subscription lifecycle, VAPID signature.
- `src/lib/push/__tests__/dispatch-fallback.test.ts` — якщо push failed → in-app notification створюється.
- `src/lib/push/__tests__/cleanup.test.ts` — cron видаляє рівно ті, що > 90d.
- `src/lib/auth/__tests__/webauthn.test.ts` — challenge/response cycle.
- `src/components/pwa/__tests__/InstallPrompt.test.tsx` — iOS vs Android branches.
- E2E (Playwright): permission grant → subscribe → отримання notification (mock VAPID server).
- Manual QA matrix:
  - iPhone (Safari, Chrome) — iOS 16.4, 17, 18
  - Android (Chrome, Samsung Internet) — 13, 14, 15
  - Desktop (Chrome, Edge, Firefox, Safari)

Run: `npm run test:unit -- push`

---

## Open Questions

1. **Option A vs B vs phased** — основне рішення.
2. **VAPID subject** — який email/URL? (рекомендую `mailto:admin@metrum.ua`).
3. **iOS PWA limit:** Apple обмежує Web Push квотою — після ~3 missed notifications can revoke. Як обробляти?
4. **WebAuthn passkeys vs platform-only** — passkeys (синхронізовані через iCloud/Google) безпечніші для recovery. Рекомендую passkeys.
5. **Background Sync API** — підтримка тільки в Chromium-браузерах. На iOS Safari — fallback на periodic check at app foreground?
6. **Push payload максимум** ~4KB — як обробляти "довгі" повідомлення (e.g. full chat message)? Truncate + deep-link.
7. **Telemetry:** як трекати click rate без zero-PII? (Логуємо тільки aggregate по типу notification).
8. **Якщо Option A — Hybrid (WebView над metrum.ua) чи Static (next export)?** Hybrid простіше, але блокує offline-first для foreman.

---

## References

**PWA / Web Push:**
- [web.dev — Push notifications overview](https://web.dev/explore/notifications)
- [web-push npm package](https://www.npmjs.com/package/web-push)
- [WebKit — Web Push for iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [VAPID generation](https://www.npmjs.com/package/web-push) — `web-push generate-vapid-keys`
- [pwa-asset-generator](https://github.com/onderceylan/pwa-asset-generator)

**WebAuthn:**
- [@simplewebauthn/server](https://simplewebauthn.dev/)
- [Passkeys overview](https://passkeys.dev/)

**Capacitor (Option A):**
- [Capacitor docs](https://capacitorjs.com/docs)
- [Capgo — OTA updates](https://capgo.app/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design 3](https://m3.material.io/)

**Internal:**
- `public/sw.js` (v5.3.0 → bump до v6.0.0)
- `public/manifest.webmanifest`
- `src/lib/notifications/dispatch.ts`
- `src/lib/auth.ts`
- `bot/` (Telegram bot як паралельний push-канал)
