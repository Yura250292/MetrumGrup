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

/// Поточний запис ЗП для співробітника на момент asOf (за замовченням now).
/// Бере perш-effectiveFrom <= asOf, відсортованих за effectiveFrom desc.
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

/// Сума ЗП у конкретному записі: baseSalary + coefficient. Офіційна
/// частина входить в baseSalary, тому окремо її не додаємо.
export function computeMonthlyTotal(
  baseSalary: Prisma.Decimal | number | string,
  coefficient: Prisma.Decimal | number | string | null | undefined,
): number {
  return Number(baseSalary) + Number(coefficient ?? 0);
}

/// Після зміни історії ЗП (insert/update/delete) синхронізуємо кеш на
/// Employee.salaryAmount, щоб legacy payroll/forecast мали актуальне значення
/// без переписування. Викликати з тієї ж транзакції що й мутація.
export async function syncEmployeeSalaryCache(
  employeeId: string,
  client: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient,
): Promise<void> {
  const active = await findActiveSalary(employeeId, new Date(), client);
  if (!active) {
    await client.employee.update({
      where: { id: employeeId },
      data: { salaryAmount: null },
    });
    return;
  }
  const total = computeMonthlyTotal(active.baseSalary, active.coefficient);
  await client.employee.update({
    where: { id: employeeId },
    data: {
      salaryAmount: total,
      currency: active.currency,
      // salaryType поки що завжди MONTHLY у новій моделі ЗП.
      salaryType: "MONTHLY",
    },
  });
}
