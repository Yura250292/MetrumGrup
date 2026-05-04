import type { Prisma } from "@prisma/client";

export type EmployeeRecord = {
  salaryType?: unknown;
  salaryAmount?: Prisma.Decimal | number | string | null;
  burdenMultiplier?: Prisma.Decimal | number | string | null;
  salaries?: unknown;
} & Record<string, unknown>;

/// Поля, які HR не повинен бачити ні редагувати. Канонічне джерело
/// тепер EmployeeSalary[], але legacy-кеш salary* теж приховуємо.
const SALARY_FIELDS = [
  "salaryAmount",
  "salaryType",
  "burdenMultiplier",
  "salaries",
] as const;

export function isHrRole(role: string | null | undefined): boolean {
  return role === "HR";
}

export function redactSalaryForHr<T extends EmployeeRecord>(
  record: T,
  role: string | null | undefined,
): T {
  if (!isHrRole(role)) return record;
  const cleaned: Record<string, unknown> = { ...record };
  for (const f of SALARY_FIELDS) {
    if (f in cleaned) {
      // salaries — це масив, очищуємо у []. Інше — null.
      cleaned[f] = f === "salaries" ? [] : null;
    }
  }
  return cleaned as T;
}

export function stripSalaryWritesForHr<T extends Record<string, unknown>>(
  body: T,
  role: string | null | undefined,
): T {
  if (!isHrRole(role)) return body;
  const cleaned: Record<string, unknown> = { ...body };
  for (const f of SALARY_FIELDS) {
    if (f in cleaned) delete cleaned[f];
  }
  return cleaned as T;
}
