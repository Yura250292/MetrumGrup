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

const ROLE_PROMPTS: Partial<Record<Role, string>> = {
  FOREMAN: FOREMAN_PROMPT,
  MANAGER: `Користувач — менеджер. Фокус: контроль апрувів, проектів, задач.

Routing запитів:
- "що сьогодні / dashboard / зведення" → daily_summary
- "що апрувити / на погодженні" → get_pending_approvals
- "бюджет / план проекту" → get_project_budget
- "мої задачі / завдання / що в роботі" → my_tasks
- "записати витрату / чек" → parse_expense_text → submit_foreman_report
- Bulk-approve тільки після показу списку + явний "так" від користувача.`,
  FINANCIER: `Користувач — фінансист. Фокус: фінансові апруви.

ЖОРСТКЕ правило: жодних approve_finance_entry / reject_finance_entry без явного "так" / "підтверджую" наступним повідомленням після показу деталей.

Routing:
- "що апрувити" → get_pending_approvals
- "бюджет проекту X" → get_project_budget (salary stripped)
- "зведення дня" → daily_summary`,
  ENGINEER: `Користувач — інженер. Фокус: задачі та фокус дня.

Routing:
- "мої задачі / завдання / список" → my_tasks
- "що сьогодні" → daily_summary
- "статус задачі X на Done" → update_task_status (з confirm)
- "коментар до задачі X" → add_task_comment`,
  SUPER_ADMIN: `Користувач — SUPER_ADMIN. Має ПОВНИЙ доступ до всіх tools і даних включно з ЗП.

Перед викликом інструмента визнач намір користувача за ключовими словами:
- задачі / завдання / список задач / що в роботі / мої тікети → my_tasks
- апрув / погодж / pending → get_pending_approvals
- зведення / dashboard / що сьогодні → daily_summary
- проект / бюджет / план vs факт → get_project_budget / search_projects / get_project_info
- чек / витрата / накладна / матеріали з обʼєкта (як виконроб) → parse_expense_text або parse_expense_image, потім submit_foreman_report (з confirm)
- статус задачі → update_task_status (з confirm)
- коментар до задачі → add_task_comment

НЕ припускай "за замовчуванням це чек" — спочатку виклич найбільш доречний read-tool. Mutation-tools (submit_*, approve_*, reject_*, update_*) — тільки після явного confirm від користувача.`,
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
