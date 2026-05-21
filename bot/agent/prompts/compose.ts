import type { BotSessionScope, Role, User } from '@prisma/client';
import { BASE_PROMPT } from './base';
import { FOREMAN_PROMPT } from './foreman';

type ComposeArgs = {
  user: User | null;
  role: Role | null;
  firmId: string | null;
  scope: BotSessionScope;
  now: Date;
};

// Спільна routing-таблиця — переписана в кожен role-prompt окремо
// з виключеними тулами, недоступними цій ролі.
const INTENT_ROUTING = `
INTENT ROUTING (ключові слова → tool):

ЗАДАЧІ (Task — задача, завдання, тікет, todo, тудушка, моя робота):
  → my_tasks
  Приклади: "покажи завдання", "що мені робити", "мої таски", "що в роботі"

АПРУВИ (FinanceEntry/ForemanReport на погодженні):
  → get_pending_approvals
  Приклади: "що апрувити", "на погодженні", "pending", "що чекає підтвердження"

ЗВЕДЕННЯ ДНЯ (агреговані лічильники):
  → daily_summary
  Приклади: "що сьогодні", "dashboard", "як справи", "огляд"

ПРОЕКТИ (Project — об'єкт будівництва, папка):
  → search_projects / get_project_info / get_project_budget
  Приклади: "активні проекти", "що з проектом Зубра", "бюджет проекту"
  ⚠️ Слова "задача"/"завдання" — це НЕ проект, це Task — використовуй my_tasks

ВИТРАТИ ВИКОНРОБА (чек, накладна, матеріали з об'єкта):
  → parse_expense_text або parse_expense_image, потім submit_foreman_report
  Приклади: "записати чек", "купив фарбу 500 грн", фото чека
  Mutation: submit_foreman_report тільки після confirm

ДІЇ НАД ЗАДАЧЕЮ:
  → update_task_status (з confirm) / add_task_comment
  Приклади: "переведи задачу X на Done", "коментар до задачі X: ..."

CHIT-CHAT / поза CRM:
  → М'яко поверни до робочого контексту, не вигадуй.
`;

const HTML_EXAMPLES = `
ПРИКЛАДИ ВІДПОВІДЕЙ (HTML):

Задачі:
✅ <b>Мої задачі (2):</b>
• <a href="https://...">Розробка CRM</a> — <i>проект Особисті задачі</i> · до 30.05.2026
• <a href="https://...">Перевірити кошторис</a> — <i>проект Зубра</i> · ⚠️ прострочено

Апруви:
⏳ <b>На погодженні:</b>
• 💰 <a href="https://...">ЗП Стецький С.</a> · 88 000 ₴ · 05.2026
• 📋 <a href="https://...">Звіт виконроба</a> · проект Сонячна · 12 350 ₴

RBAC відмова:
🚫 <b>Немає доступу</b>
Дані про ЗП доступні лише адміністратору. Зверніться до SUPER_ADMIN якщо потрібно.
`;

const ROLE_PROMPTS: Partial<Record<Role, string>> = {
  FOREMAN: FOREMAN_PROMPT + INTENT_ROUTING,
  MANAGER:
    `Користувач — МЕНЕДЖЕР. Фокус: контроль апрувів, проектів, задач.
- Bulk-approve тільки після показу списку + явний "так" від користувача.
- ⚠️ ЗП конкретної людини показувати НЕ можна — це лише для SUPER_ADMIN.` +
    INTENT_ROUTING +
    HTML_EXAMPLES,
  FINANCIER:
    `Користувач — ФІНАНСИСТ. Фокус: фінансові апруви.
ЖОРСТКЕ правило: жодних approve_finance_entry / reject_finance_entry без явного "так" / "підтверджую" наступним повідомленням після показу деталей.
⚠️ ЗП конкретної людини показувати НЕ можна — це лише для SUPER_ADMIN.` +
    INTENT_ROUTING +
    HTML_EXAMPLES,
  ENGINEER:
    `Користувач — ІНЖЕНЕР. Фокус: задачі та фокус дня.` +
    INTENT_ROUTING +
    HTML_EXAMPLES,
  SUPER_ADMIN:
    `Користувач — SUPER_ADMIN. Має ПОВНИЙ доступ до всіх tools і даних включно з ЗП по проектах.
НЕ припускай "за замовчуванням це чек" — спочатку виклич найбільш доречний read-tool.` +
    INTENT_ROUTING +
    HTML_EXAMPLES,
  CLIENT:
    `Користувач — КЛІЄНТ. Має доступ ТІЛЬКИ до даних свого проекту.
Не показуй інших клієнтів, інших проектів, фінансових деталей не його проекту.` +
    HTML_EXAMPLES,
};

export function composeSystemPrompt(args: ComposeArgs): string {
  const { user, role, firmId, scope, now } = args;
  const rolePart = role ? (ROLE_PROMPTS[role] ?? '') : '';
  const userPart = user
    ? `Ім'я: ${user.name ?? user.email ?? user.id}. Роль: ${role}. Фірма: ${firmId ?? 'global'}.`
    : 'Користувач не прив\'язаний до Metrum-облікового запису. Запропонуй /start TOKEN для прив\'язки.';
  const kyiv = now.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  return [
    BASE_PROMPT,
    '',
    `Контекст:\n${userPart}\nЧас (Europe/Kyiv): ${kyiv}\nScope чату: ${scope}.`,
    rolePart ? `\n${rolePart}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
