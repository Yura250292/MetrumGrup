import "server-only";
import type { Prisma } from "@prisma/client";

export class AccountSyncError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type EmployeeNameSlice = {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
};

function composeName(slice: EmployeeNameSlice): string {
  const composed = [slice.lastName, slice.firstName, slice.middleName]
    .map((p) => p?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return composed || slice.fullName.trim() || slice.email || "Користувач";
}

/**
 * Дзеркалить редаговані поля Employee у привʼязаний User у тій самій транзакції.
 * Якщо email вже зайнятий іншим юзером — кидає AccountSyncError(409).
 * Якщо userId не передано — нічого не робить.
 */
export async function syncUserFromEmployee(
  tx: Prisma.TransactionClient,
  userId: string,
  slice: EmployeeNameSlice,
): Promise<void> {
  if (slice.email) {
    const existing = await tx.user.findUnique({
      where: { email: slice.email },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      throw new AccountSyncError(
        `Email ${slice.email} вже використовується іншим користувачем`,
        409,
      );
    }
  }

  await tx.user.update({
    where: { id: userId },
    data: {
      name: composeName(slice),
      firstName: slice.firstName,
      lastName: slice.lastName,
      // User.email є обовʼязковим — оновлюємо лише якщо Employee.email непорожній.
      ...(slice.email ? { email: slice.email } : {}),
      phone: slice.phone,
      isActive: slice.isActive,
    },
  });
}

export function buildEmployeeNameSlice(employee: {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}): EmployeeNameSlice {
  return {
    lastName: employee.lastName,
    firstName: employee.firstName,
    middleName: employee.middleName,
    fullName: employee.fullName,
    email: employee.email,
    phone: employee.phone,
    isActive: employee.isActive,
  };
}
