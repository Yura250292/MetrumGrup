import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SalaryPeriodInput = {
  baseSalary: number;
  officialPart?: number | null;
  coefficient?: number;
  description?: string | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  currency?: string;
};

/// Сума ЗП у конкретному записі: baseSalary + coefficient. Офіційна
/// частина входить в baseSalary, тому окремо її не додаємо.
export function computeMonthlyTotal(
  baseSalary: Prisma.Decimal | number | string,
  coefficient: Prisma.Decimal | number | string | null | undefined,
): number {
  return Number(baseSalary) + Number(coefficient ?? 0);
}

/// Поточний запис ЗП для співробітника на момент asOf (за замовченням now).
/// Бере перш-effectiveFrom <= asOf, відсортованих за effectiveFrom desc.
export async function findActiveSalary(
  employeeId: string,
  asOf: Date = new Date(),
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.employeeSalary.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

/// Минімальний "snapshot" ЗП-періоду для клієнт-сайд калькуляторів
/// (forecast / payroll preview). Дати нормалізовані у ISO-стрінги, щоб
/// безпечно проходити через JSON serialization Server Component → Client.
export type SalaryPeriodSnapshot = {
  baseSalary: number;
  coefficient: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
};

/// Усі записи ЗП співробітника у вигляді snapshot-ів (для DTO).
export async function listSalarySnapshots(
  employeeId: string,
): Promise<SalaryPeriodSnapshot[]> {
  const rows = await prisma.employeeSalary.findMany({
    where: { employeeId },
    orderBy: [{ effectiveFrom: "desc" }],
  });
  return rows.map((r) => ({
    baseSalary: Number(r.baseSalary),
    coefficient: Number(r.coefficient ?? 0),
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    currency: r.currency,
  }));
}

/// Знаходить snapshot активний на дату. Працює із заздалегідь
/// завантаженим списком (форкаст ходить по 12-24 місяцях, не варто
/// йти у БД на кожен).
export function pickSalaryAt(
  snapshots: SalaryPeriodSnapshot[],
  asOf: Date,
): SalaryPeriodSnapshot | null {
  const t = asOf.getTime();
  let best: SalaryPeriodSnapshot | null = null;
  let bestStart = -Infinity;
  for (const s of snapshots) {
    const start = new Date(s.effectiveFrom).getTime();
    const end = s.effectiveTo ? new Date(s.effectiveTo).getTime() : Infinity;
    if (start <= t && t <= end && start > bestStart) {
      best = s;
      bestStart = start;
    }
  }
  return best;
}

/// Pure обчислення місячної ЗП на дату (forecast / report).
export function monthlyTotalAt(
  snapshots: SalaryPeriodSnapshot[],
  asOf: Date,
): number {
  const s = pickSalaryAt(snapshots, asOf);
  if (!s) return 0;
  return s.baseSalary + s.coefficient;
}

/// No-op після повного рефакторингу — Employee.salaryAmount/salaryType/currency
/// видалені, кешу більше нема. Лишаємо сигнатуру щоб не торкатися викликів.
/// При наступному CRUD-перегляді запис ЗП можна remove call і сам helper.
export async function syncEmployeeSalaryCache(
  _employeeId: string,
  _client?: unknown,
): Promise<void> {
  return;
}
