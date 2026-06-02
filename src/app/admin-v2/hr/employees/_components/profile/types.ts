/** Спільні типи + хелпери для картки профілю співробітника. */

export type DeferralType = "NONE" | "RESERVATION" | "DEFERMENT";
export type EmploymentType = "FULL" | "PART" | "CONTRACT";
export type TimeOffType = "VACATION" | "SICK" | "PERSONAL" | "HOLIDAY";

export type LinkedUser = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  avatar: string | null;
};

export type SalaryPeriod = {
  id: string;
  baseSalary: number | string;
  officialPart: number | string | null;
  coefficient: number | string;
  description: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
};

export type PayrollPeriod = {
  id: string;
  period: string;
  isVacation: boolean;
  officialPart: number | string | null;
  pdfo: number | string | null;
  vz: number | string | null;
  esv: number | string | null;
  taxesTotal: number | string | null;
  salaryToCard: number | string | null;
  totalSum: number | string | null;
  advance: number | string | null;
  sickLeave: number | string | null;
  vacationPay: number | string | null;
  bonus: number | string | null;
  metrumExpenses: number | string | null;
  currency: string;
  sourceFile: string | null;
  notes: string | null;
  createdAt: string;
};

export type TimeOffRecord = {
  id: string;
  type: TimeOffType;
  startDate: string;
  endDate: string;
  notes: string | null;
  approvedAt: string | null;
};

export type Employee = {
  id: string;
  fullName: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  employeeNumber: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  birthDate: string | null;
  hiredAt: string | null;
  terminatedAt: string | null;
  notes: string | null;
  isActive: boolean;
  employmentType: EmploymentType;
  employmentRate: number | string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  deferralType: DeferralType;
  deferralUntil: string | null;
  userId: string | null;
  user: LinkedUser | null;
  salaries: SalaryPeriod[];
  payrollPeriods: PayrollPeriod[];
  createdAt: string;
  updatedAt: string;
};

/** Поля Employee, які можна редагувати через PATCH /api/admin/hr/employees. */
export type FieldKey =
  | "lastName"
  | "firstName"
  | "middleName"
  | "position"
  | "phone"
  | "email"
  | "birthDate"
  | "hiredAt"
  | "terminatedAt"
  | "departmentId"
  | "deferralType"
  | "deferralUntil"
  | "notes"
  | "isActive"
  | "employmentType"
  | "employmentRate";

export const DEFERRAL_LABEL: Record<DeferralType, string> = {
  NONE: "Відсутня",
  RESERVATION: "Бронювання",
  DEFERMENT: "Відстрочка",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL: "Повна",
  PART: "Неповна",
  CONTRACT: "Договір",
};

export const TIMEOFF_LABEL: Record<TimeOffType, string> = {
  VACATION: "Щорічна",
  SICK: "Лікарняний",
  PERSONAL: "За свій рахунок",
  HOLIDAY: "Святковий",
};

export const DASH = "—";

export function formatDate(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString("uk-UA");
}

export function calcAge(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function formatTenure(
  hired: string | null,
  terminated: string | null,
): string | null {
  if (!hired) return null;
  const start = new Date(hired);
  const end = terminated ? new Date(terminated) : new Date();
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    end.getMonth() -
    start.getMonth();
  if (months < 1) return "< 1 міс";
  if (months < 12) return `${months} міс`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} р ${rem} міс` : `${years} р`;
}

export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Кількість днів у періоді відпустки (включно з обома кінцями). */
export function daysBetween(from: string, to: string): number | null {
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  const ms = b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0);
  return Math.floor(ms / 86400000) + 1;
}

export function initialsOf(emp: Pick<Employee, "lastName" | "firstName" | "fullName">): string {
  const ln = emp.lastName?.[0] ?? emp.fullName?.[0] ?? "";
  const fn = emp.firstName?.[0] ?? "";
  return (ln + fn).toUpperCase() || "—";
}

/** «Прізвище І.П.» — скорочене ПІБ. */
export function shortName(emp: Pick<Employee, "lastName" | "firstName" | "middleName" | "fullName">): string {
  if (!emp.lastName) return emp.fullName;
  const fn = emp.firstName ? `${emp.firstName[0]}.` : "";
  const mn = emp.middleName ? `${emp.middleName[0]}.` : "";
  return `${emp.lastName} ${fn}${mn}`.trim();
}
