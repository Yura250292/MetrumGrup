import type { Prisma } from "@prisma/client";

export type EmployeeRecord = {
  salaryType?: unknown;
  salaryAmount?: Prisma.Decimal | number | string | null;
  burdenMultiplier?: Prisma.Decimal | number | string | null;
} & Record<string, unknown>;

const SALARY_FIELDS = ["salaryAmount", "salaryType", "burdenMultiplier"] as const;

// HR не повинен бачити ні редагувати компенсаційні поля. SUPER_ADMIN/MANAGER —
// бачать. Викликається на API-боці і для read, і для write.
export function isHrRole(role: string | null | undefined): boolean {
  return role === "HR";
}

export function redactSalaryForHr<T extends EmployeeRecord>(
  record: T,
  role: string | null | undefined,
): T {
  if (!isHrRole(role)) return record;
  const cleaned = { ...record };
  for (const f of SALARY_FIELDS) {
    if (f in cleaned) cleaned[f] = null;
  }
  return cleaned;
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
