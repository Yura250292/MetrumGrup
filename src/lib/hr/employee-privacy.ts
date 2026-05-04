export type EmployeeRecord = {
  salaries?: unknown;
} & Record<string, unknown>;

/// HR не повинен бачити ні редагувати компенсаційні поля. Канонічне
/// джерело — EmployeeSalary[]; інших ЗП-полів на Employee більше нема.
const SALARY_FIELDS = ["salaries"] as const;

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
      cleaned[f] = [];
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
