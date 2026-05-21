import { canViewFinance } from "@/lib/auth-utils";

export type EmployeeRecord = {
  salaries?: unknown;
} & Record<string, unknown>;

/// Компенсаційні поля. Канонічне джерело — EmployeeSalary[]; інших ЗП-полів
/// на Employee більше нема. Бачать лише ролі з canViewFinance() — решта
/// (HR/MANAGER/ENGINEER/FOREMAN/CLIENT) отримують порожній масив.
const SALARY_FIELDS = ["salaries", "payrollPeriods"] as const;

export function isHrRole(role: string | null | undefined): boolean {
  return role === "HR";
}

/**
 * Чистить ЗП-поля з employee record для всіх, кого `canViewFinance` не пропускає.
 * Назва історична — раніше блокувала лише HR; зараз єдина точка істини для
 * приховування ЗП у відповідях API (правило: ЗП бачать тільки SUPER_ADMIN + FINANCIER).
 */
export function redactSalaryForHr<T extends EmployeeRecord>(
  record: T,
  role: string | null | undefined,
): T {
  if (canViewFinance(role)) return record;
  const cleaned: Record<string, unknown> = { ...record };
  for (const f of SALARY_FIELDS) {
    if (f in cleaned) {
      cleaned[f] = [];
    }
  }
  return cleaned as T;
}

/**
 * Блокує ЗП-поля у тілі запиту (POST/PATCH) для всіх не-фінансових ролей.
 * Запобігає тому, що, напр., HR/MANAGER через прямий PATCH запише `salaries`.
 */
export function stripSalaryWritesForHr<T extends Record<string, unknown>>(
  body: T,
  role: string | null | undefined,
): T {
  if (canViewFinance(role)) return body;
  const cleaned: Record<string, unknown> = { ...body };
  for (const f of SALARY_FIELDS) {
    if (f in cleaned) delete cleaned[f];
  }
  return cleaned as T;
}
