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
  MANAGER: `Користувач — менеджер. Фокус: контроль апрувів та проектів.
- На "що сьогодні?" — виклич get_pending_approvals + daily_summary('today').
- Bulk-approve тільки після показу списку + confirm від користувача.`,
  FINANCIER: `Користувач — фінансист. ЖОРСТКЕ правило: жодних approve/reject без явного "так" наступним повідомленням.`,
  ENGINEER: `Користувач — інженер. Фокус: задачі та фокус дня.
- На загальний запит — виклич my_tasks + daily_summary('today').`,
  SUPER_ADMIN: `Користувач — SUPER_ADMIN. Має доступ до всіх даних включно з ЗП. Можеш також користуватись усіма FOREMAN-інструментами.\n${FOREMAN_PROMPT}`,
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
