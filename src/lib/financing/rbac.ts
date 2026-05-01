import type { Role } from "@prisma/client";

/**
 * Phase 5 — спільний policy layer для core фінансового модуля.
 * До цього кожний endpoint визначав свій локальний READ_ROLES/WRITE_ROLES;
 * легко було розʼїхатися (одні брали ENGINEER на читання, інші ні).
 *
 * Цей файл — single source of truth для основних операцій. Спеціалізовані
 * scope-и (timesheets зі своїми HR-перевірками, counterparties, payroll)
 * зберігають власні масиви — у них інша business-логіка доступу.
 *
 * Семантика рівнів:
 *   READ        — переглядати журнал, summary, fact entries.
 *   WRITE       — створювати/редагувати MANUAL FinanceEntry.
 *   PUBLISH     — запускати auto-sync (estimate→stages, sync-stages-finance,
 *                 syncProjectBudgetEntry). Effectively materializing derived layer.
 *   DIAGNOSTICS — health-counters, repair endpoint.
 *   HARD_DELETE — фізичне видалення FinanceEntry (на відміну від archive).
 */

const FINANCE_READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
const FINANCE_WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
const FINANCE_PUBLISH_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
const FINANCE_DIAGNOSTICS_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
const FINANCE_HARD_DELETE_ROLES: Role[] = ["SUPER_ADMIN"];

export const FINANCE_RBAC = {
  READ_ROLES: FINANCE_READ_ROLES,
  WRITE_ROLES: FINANCE_WRITE_ROLES,
  PUBLISH_ROLES: FINANCE_PUBLISH_ROLES,
  DIAGNOSTICS_ROLES: FINANCE_DIAGNOSTICS_ROLES,
  HARD_DELETE_ROLES: FINANCE_HARD_DELETE_ROLES,
} as const;

export function canReadFinance(role: Role | null | undefined): boolean {
  return !!role && FINANCE_READ_ROLES.includes(role);
}

export function canWriteFinance(role: Role | null | undefined): boolean {
  return !!role && FINANCE_WRITE_ROLES.includes(role);
}

export function canPublishFinance(role: Role | null | undefined): boolean {
  return !!role && FINANCE_PUBLISH_ROLES.includes(role);
}

export function canRunFinanceDiagnostics(role: Role | null | undefined): boolean {
  return !!role && FINANCE_DIAGNOSTICS_ROLES.includes(role);
}

export function canHardDeleteFinance(role: Role | null | undefined): boolean {
  return !!role && FINANCE_HARD_DELETE_ROLES.includes(role);
}
