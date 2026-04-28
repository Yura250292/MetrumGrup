import type { Prisma } from "@prisma/client";
import {
  firmWhereForFinance,
  firmWhereForPayment,
  firmWhereForProject,
  firmWhereForTask,
} from "@/lib/firm/scope";

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

/**
 * Firm-aware варіанти. firmId=null означає cross-firm (без обмеження).
 * Зазвичай firmId приходить з resolveFirmScope(session).
 */

export function projectNotTestByFirm(
  firmId: string | null,
): Prisma.ProjectWhereInput {
  return { AND: [PROJECT_NOT_TEST, firmWhereForProject(firmId)] };
}

export function financeEntryNotTestByFirm(
  firmId: string | null,
): Prisma.FinanceEntryWhereInput {
  return { AND: [FINANCE_ENTRY_NOT_TEST, firmWhereForFinance(firmId)] };
}

export function paymentNotTestByFirm(
  firmId: string | null,
): Prisma.PaymentWhereInput {
  return { AND: [PAYMENT_NOT_TEST, firmWhereForPayment(firmId)] };
}

export function taskNotTestByFirm(
  firmId: string | null,
): Prisma.TaskWhereInput {
  return { AND: [TASK_NOT_TEST, firmWhereForTask(firmId)] };
}
