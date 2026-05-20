/**
 * Live feature inventory of the Metrum platform itself — injected into AI context
 * when a task is detected as "meta" (i.e. user is working on developing the CRM,
 * not on a construction project).
 *
 * Keep this file up-to-date as modules ship. The AI uses it to give concrete
 * next-step plans instead of generic advice.
 */

export const PLATFORM_STATE = `
**Стек:** Next.js (App Router) + React 19 + TypeScript + Tailwind v4, Prisma + PostgreSQL, NextAuth, OpenAI/Anthropic/Gemini.
**Канонічна адмінка:** \`/admin-v2/*\` (стара \`/admin/*\` — legacy shell, не чіпати).
**Multi-firm:** ізоляція даних між \`metrum-group\` і \`metrum-studio\` через \`resolveFirmScope\`. Будь-яка нова агрегація має бути firm-aware.

---

### 🟢 Постачальники / Контрагенти — РОБОЧИЙ модуль
- Сторінка: \`/admin-v2/counterparties\` ([counterparty-list.tsx](src/app/admin-v2/counterparties/_components/counterparty-list.tsx), ~926 рядків)
- Досьє контрагента: \`/admin-v2/counterparties/[id]\`
- Платежі постачальникам: \`/admin-v2/financing/supplier-payments\` + модель \`SupplierPayment\` + \`SupplierPaymentAllocation\`
- Foreman flow підтримує supplier resolution через \`src/lib/foreman/\`
- ROLES які мають доступ: SUPER_ADMIN, MANAGER, FINANCIER, ENGINEER, HR
- **Що типово ще треба:** імпорт з Excel, ЄДРПОУ/ІПН валідація, auto-merge дублікатів, інтеграція з \`Counterparty\` ↔ \`FinanceEntry\` категоріями

### 🟢 Працівники — РОБОЧИЙ модуль (об'єднаний)
- Колишній розділ "Користувачі" (\`/admin-v2/users\`) РЕДІРЕКТИТЬ на \`/admin-v2/hr/employees\` — тепер єдина сторінка
- \`/admin-v2/hr/employees\` ([employees-table.tsx](src/app/admin-v2/hr/employees/_components/employees-table.tsx), ~1059 рядків) — таблиця з відділами, дос'є, аватарами
- SUPER_ADMIN бачить таб "Зовнішні акаунти" — User-и без Employee профілю (CLIENT/USER)
- Моделі: \`Employee\`, \`EmployeeSalary\`, departments
- Excel import: \`hr/_components/excel-import-modal.tsx\` (DONE)
- \`/admin-v2/hr/subcontractors\` — субпідрядники
- **Що типово ще треба:** прив'язка User↔Employee для всіх, ставки за період, історія посад/підвищень

### 🟡 Доступи (ролі / RBAC) — БАЗА Є, потребує доробки
- Ролі (enum Role): SUPER_ADMIN, OWNER, MANAGER, ENGINEER, FINANCIER, HR, FOREMAN, CLIENT, USER
- **CRITICAL правило фінансів:** цифри/ЗП бачить ТІЛЬКИ SUPER_ADMIN — реалізовано через \`canViewFinance()\`, \`FINANCE_ROLES=[SUPER_ADMIN]\` (\`src/lib/financing/rbac\`)
- Multi-firm scope: \`resolveFirmScope\` / \`getActiveRoleFromSession\` (\`src/lib/firm/scope.ts\`)
- ACL у API: явні role+ownership перевірки (НЕ покладатись на UI/redirect)
- **Що типово ще треба:** UI для адміна щоб призначати ролі без SQL, audit log дій SUPER_ADMIN, тимчасові делегування прав, інвайт-лінки з преднастроєною роллю+firm

### 🟡 Очищення старих даних — ЧАСТКОВО
- \`isArchived\` поля на \`Task\`, можливо інших моделях — soft-delete є
- \`/admin-v2/financing/audit\` + \`migration-audit\` + \`migration-plan\` — існують але це для фін. міграцій, не для general cleanup
- **Чого нема (типово):** UI cron-задача "архівувати закриті проєкти старше N років", bulk-видалення тестових даних, очистка orphan \`AiConversation\`/\`AiMessage\`, очистка дублікатів \`Counterparty\`, утиліта seed-reset для прод

### 🟡 Фінансування — РОБОЧИЙ, але СКЛАДНИЙ модуль (обережно!)
- \`/admin-v2/financing\` (224 рядків page), \`/financing/pivot\`, \`/financing/suppliers\`, \`/financing/supplier-payments\`, \`/financing/audit\`, \`/financing/diagnostics\`
- KB2-акти, cashflow, budget matrix, RBAC — все в \`src/lib/financing/\`, прикрите тестами (\`financing/__tests__\`)
- Foreman → ForemanReport(DRAFT) → manager approve → \`FinanceEntry(kind=FACT, source=FOREMAN_REPORT)\`
- **⚠️ Не чіпати інваріанти без \`npm run test:unit\`** — найбільш fragile частина платформи
- **Що типово ще треба:** план/факт по статтях, експорт у 1С, прогноз cashflow, графік за період

---

### Інші модулі (для контексту, не з task list юзера)
- 🟢 Проєкти, етапи, прогрес — \`/admin-v2/projects/*\`
- 🟢 Завдання + AI помічник по задачах — \`/admin-v2/me\`, чеклісти, залежності, time-trackking
- 🟢 Кошториси: ручні + AI генератор (\`/ai-estimate-v2\`)
- 🟢 Матеріали, обладнання, склад — \`/admin-v2/resources/*\`
- 🟢 Чат — \`/admin-v2/chat\` (DM, проєктні чати)
- 🟡 Bot нотифікації — Telegram bot ще не повністю підключений до notifyUsers
- 🟢 CMS — новини/портфоліо (\`/admin-v2/cms\`)
- 🟢 Foreman PWA — \`/foreman\` (kiosk режим для виконробів)
- 🟢 AI-візуалізація кімнат — \`/dashboard/visualizer\`

---

### Як давати кроки для МЕТА-задач CRM:
1. **НЕ кажи** "впровадити модуль X" якщо X вже є в списку 🟢 — натомість назви що саме лишилось доробити в існуючому модулі.
2. Якщо модуль 🟡 — починай кроки з конкретної прогалини (наприклад "Доступи: написати admin UI для зміни ролі юзера в /admin-v2/hr/employees/[id]", а не "впровадити RBAC").
3. Перед загальними кроками use \`get_task_list({ projectId })\` щоб подивитись що вже у backlog'у цього ж проєкту — можливо частина пунктів вже там.
4. Якщо чіпаєте financing/estimates — попередь що там тести і складні інваріанти.
5. Згадуй конкретні файли/шляхи маршрутів.
`;

const META_KEYWORDS = [
  "crm",
  "платформ",
  "platform",
  "адмінк",
  "admin",
  "metrum",
  "система",
  "доробити",
  "доробка",
  "доступ",
  "rbac",
  "ролі",
  "користувач",
  "очищення",
  "очистка",
  "cleanup",
  "постачальник",
  "контрагент",
  "працівник",
  "співробітн",
  "фінансування",
];

const MODULE_MAP: Record<string, string> = {
  постачальник: "Постачальники",
  контрагент: "Постачальники/Контрагенти",
  працівник: "Працівники",
  співробітн: "Працівники",
  hr: "Працівники",
  доступ: "Доступи (RBAC)",
  ролі: "Доступи (RBAC)",
  rbac: "Доступи (RBAC)",
  rights: "Доступи (RBAC)",
  очищення: "Очищення даних",
  очистка: "Очищення даних",
  cleanup: "Очищення даних",
  фінансування: "Фінансування",
  фінанс: "Фінансування",
  cashflow: "Фінансування",
  кошторис: "Кошториси",
  estimate: "Кошториси",
  проєкт: "Проєкти",
  задач: "Завдання",
  task: "Завдання",
};

/**
 * Detect whether a task is about developing the Metrum platform itself
 * (so AI should treat it as meta, not as a construction project task).
 */
export function detectMetaTask(input: {
  taskTitle?: string | null;
  projectTitle?: string | null;
  pathname?: string | null;
}): { isMeta: boolean; modules: string[] } {
  const haystack = [input.taskTitle, input.projectTitle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack) return { isMeta: false, modules: [] };

  const hits = META_KEYWORDS.filter((kw) => haystack.includes(kw));
  if (hits.length === 0) return { isMeta: false, modules: [] };

  const modules = Array.from(
    new Set(
      Object.entries(MODULE_MAP)
        .filter(([kw]) => haystack.includes(kw))
        .map(([, mod]) => mod),
    ),
  );

  return { isMeta: true, modules };
}
