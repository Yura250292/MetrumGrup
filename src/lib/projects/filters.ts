import type { Prisma } from "@prisma/client";

/**
 * Спільні where-фрагменти для виключення тестових проєктів з KPI/аналітики.
 * Тестові проєкти показуються у списках з візуальним приглушенням, але не
 * потрапляють у суми (дохід/витрати/бюджет/платежі тощо).
 */

export const PROJECT_NOT_TEST: Prisma.ProjectWhereInput = {
  isTestProject: false,
};

/**
 * FinanceEntry може бути без проєкту (projectId = null) — такий запис враховуємо.
 * Якщо projectId є, його проєкт не має бути тестовим.
 */
export const FINANCE_ENTRY_NOT_TEST: Prisma.FinanceEntryWhereInput = {
  OR: [{ projectId: null }, { project: { isTestProject: false } }],
};

export const PAYMENT_NOT_TEST: Prisma.PaymentWhereInput = {
  project: { isTestProject: false },
};

export const TASK_NOT_TEST: Prisma.TaskWhereInput = {
  project: { isTestProject: false },
};
