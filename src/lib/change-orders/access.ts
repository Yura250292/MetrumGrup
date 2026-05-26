import type { Role } from "@prisma/client";
import { canViewFinance } from "@/lib/auth-utils";

/// Хто може створити CO у статусі DRAFT (узгоджено з користувачем 2026-05-25).
const CO_CREATORS: ReadonlyArray<Role> = [
  "MANAGER",
  "ENGINEER",
  "SUPER_ADMIN",
];

export function canCreateCO(role: Role | string | null | undefined): boolean {
  if (!role) return false;
  return (CO_CREATORS as ReadonlyArray<string>).includes(role);
}

/// Маскує фінансові поля для не-SUPER_ADMIN response shape.
/// Залишає null замість сум, щоб UI міг показати "***". Викликати ЗАВЖДИ
/// у API-handler-ах перед NextResponse.json — не покладатись на UI.
export function maskCostImpact<T extends { costImpact?: unknown; items?: unknown }>(
  co: T,
  role: Role | string | null | undefined,
): T {
  if (canViewFinance(role)) return co;
  const masked: Record<string, unknown> = { ...co, costImpact: null };
  if (Array.isArray((co as { items?: unknown[] }).items)) {
    masked.items = ((co as { items: Array<Record<string, unknown>> }).items).map(
      (item) => ({ ...item, unitPrice: null, totalPrice: null }),
    );
  }
  return masked as T;
}

/// Список ролей, які можуть скасувати власний DRAFT (cancel) — додатково перевірити
/// що user.id === co.requestedById на рівні handler-а.
export function canCancelOwnDraft(role: Role | string | null | undefined): boolean {
  if (!role) return false;
  return (CO_CREATORS as ReadonlyArray<string>).includes(role);
}
