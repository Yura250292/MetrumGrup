import type { Prisma, Role } from "@prisma/client";
import type { Session } from "next-auth";

export const DEFAULT_FIRM_ID = "metrum-group";
export const STUDIO_FIRM_ID = "metrum-studio";

export const KNOWN_FIRMS: Record<string, { id: string; name: string }> = {
  [DEFAULT_FIRM_ID]: { id: DEFAULT_FIRM_ID, name: "Metrum Group" },
  [STUDIO_FIRM_ID]: { id: STUDIO_FIRM_ID, name: "Metrum Studio" },
};

/**
 * Брендинг кожної фірми. Використовується у sidebar (іконка-плашка) та як
 * PWA theme-color (статус-бар на мобільних). Зміна при перемиканні фірми
 * дає миттєву візуальну орієнтацію.
 */
export const FIRM_BRAND: Record<
  string,
  { primary: string; gradient: string; pwaThemeColor: string }
> = {
  [DEFAULT_FIRM_ID]: {
    primary: "#3B5BFF",
    gradient: "linear-gradient(135deg, #1a2b5e 0%, #3B5BFF 100%)",
    pwaThemeColor: "#0B0F17",
  },
  [STUDIO_FIRM_ID]: {
    primary: "#F5A623",
    gradient: "linear-gradient(135deg, #8C5A0F 0%, #F5A623 100%)",
    pwaThemeColor: "#1F1407",
  },
};

/** Повертає branding для firmId або дефолтний для Metrum Group. */
export function getFirmBrand(firmId: string | null | undefined) {
  if (firmId && FIRM_BRAND[firmId]) return FIRM_BRAND[firmId];
  return FIRM_BRAND[DEFAULT_FIRM_ID];
}

export type FirmScope = {
  /** firmId до якого треба обмежити запити; null = жодних обмежень (cross-firm). */
  firmId: string | null;
  /** Поточний стан користувача — закріплений за фірмою чи має глобальний доступ. */
  userFirmId: string | null;
  isSuperAdmin: boolean;
};

type SessionLike = Pick<Session, "user"> | null | undefined;

/**
 * Визначає firm-scope для поточного запиту.
 *
 * Правила:
 * - Якщо передано explicit override (incl. null = cross-firm) — застосовуємо його незалежно
 *   від ролі. Це дозволяє керівнику студії перемикати firm через cookie/dropdown і
 *   працювати у різних фірмах (з обмеженнями на чутливі сторінки — див. isHomeFirmFor).
 * - Без override:
 *   - SUPER_ADMIN → DEFAULT_FIRM_ID (Metrum Studio за замовчуванням не показується)
 *   - інші ролі → firmId з сесії (їх "home firm")
 *
 * ВАЖЛИВО: scope лише обмежує які дані запитувати. Заборона на дії (Фінансування,
 * Проекти на чужій фірмі) виконується через isHomeFirmFor/assertHomeFirm на рівні сторінок.
 */
export function resolveFirmScope(
  session: SessionLike,
  override?: string | null,
): FirmScope {
  const user = session?.user;
  const userFirmId = user?.firmId ?? null;
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  if (override !== undefined) {
    return { firmId: override, userFirmId, isSuperAdmin };
  }

  if (isSuperAdmin) {
    return { firmId: DEFAULT_FIRM_ID, userFirmId, isSuperAdmin };
  }

  return {
    firmId: userFirmId ?? DEFAULT_FIRM_ID,
    userFirmId,
    isSuperAdmin,
  };
}

/**
 * Перевіряє чи активна фірма — це "home firm" поточного користувача.
 * Home = SUPER_ADMIN (доступ скрізь) АБО home firm з сесії АБО запис у firmAccess.
 *
 * Використовується сторінками Фінансування/Проектів щоб заблокувати редагування,
 * коли користувач перемкнувся у фірму, де у нього немає прав.
 */
export function isHomeFirmFor(
  session: SessionLike,
  activeFirmId: string | null,
): boolean {
  const user = session?.user;
  if (user?.role === "SUPER_ADMIN") return true;
  if (activeFirmId === null) return false;
  const userFirmId = user?.firmId ?? DEFAULT_FIRM_ID;
  if (userFirmId === activeFirmId) return true;
  // Per-firm доступ: shymilo93 на Studio через UserFirmAccess.
  const access = (user as { firmAccess?: Record<string, Role> } | undefined)
    ?.firmAccess;
  return Boolean(access && access[activeFirmId]);
}

/**
 * Повертає роль користувача у контексті заданої фірми.
 *
 * Правила:
 * - Базовий role=SUPER_ADMIN → завжди SUPER_ADMIN (узгоджена поведінка для існуючих
 *   адмінів — вони лишаються SUPER_ADMIN на всіх фірмах).
 * - На своїй home фірмі — User.role.
 * - На іншій фірмі — UserFirmAccess[firmId].role якщо є; інакше null (немає доступу).
 * - Cross-firm view (firmId=null): тільки SUPER_ADMIN.
 */
export function getActiveRoleFromSession(
  session: SessionLike,
  activeFirmId: string | null,
): Role | null {
  const user = session?.user;
  if (!user) return null;
  if (user.role === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (activeFirmId === null) return null;
  const userFirmId = user.firmId ?? DEFAULT_FIRM_ID;
  if (userFirmId === activeFirmId) return user.role;
  const access = (user as { firmAccess?: Record<string, Role> } | undefined)
    ?.firmAccess;
  return access?.[activeFirmId] ?? null;
}

/**
 * Список firmId, до яких користувач має повний доступ (home + firmAccess).
 * SUPER_ADMIN отримує всі відомі фірми. Використовується FirmSwitcher щоб
 * не показувати фірми, де у користувача немає прав.
 */
export function getAccessibleFirmIds(session: SessionLike): string[] {
  const user = session?.user;
  if (!user) return [];
  if (user.role === "SUPER_ADMIN") return Object.keys(KNOWN_FIRMS);
  const homeFirmId = user.firmId ?? DEFAULT_FIRM_ID;
  const access = (user as { firmAccess?: Record<string, Role> } | undefined)
    ?.firmAccess ?? {};
  return Array.from(new Set([homeFirmId, ...Object.keys(access)]));
}

/** Кидає 403 якщо активна фірма — не home для користувача. */
export function assertHomeFirm(
  session: SessionLike,
  activeFirmId: string | null,
): void {
  if (!isHomeFirmFor(session, activeFirmId)) {
    const error = new Error(
      "Forbidden: ця дія дозволена лише на home-фірмі користувача",
    ) as Error & { status: number };
    error.status = 403;
    throw error;
  }
}

/** Project where-фрагмент. Якщо firmId=null — порожній (все). */
export function firmWhereForProject(
  firmId: string | null,
): Prisma.ProjectWhereInput {
  return firmId ? { firmId } : {};
}

/**
 * FinanceEntry where-фрагмент. Скоупає по власному firmId запису, який має кожен FinanceEntry
 * (включно з projectless company-level записами).
 */
export function firmWhereForFinance(
  firmId: string | null,
): Prisma.FinanceEntryWhereInput {
  return firmId ? { firmId } : {};
}

/** Payment не має власного firmId — скоупаємо через project. */
export function firmWhereForPayment(
  firmId: string | null,
): Prisma.PaymentWhereInput {
  return firmId ? { project: { firmId } } : {};
}

/** Task — те саме, скоупаємо через project. */
export function firmWhereForTask(firmId: string | null): Prisma.TaskWhereInput {
  return firmId ? { project: { firmId } } : {};
}

/**
 * Перевіряє, чи поточний користувач має право бачити сутність конкретної фірми.
 * Кидає Error з властивістю `status=403` якщо ні — handler-и API повертають
 * NextResponse зі статусом 403 при цьому.
 */
export function assertCanAccessFirm(
  session: SessionLike,
  entityFirmId: string | null | undefined,
): void {
  const userFirmId = session?.user?.firmId ?? null;
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  if (isSuperAdmin) return;

  // Якщо користувач закріплений за фірмою — entity мусить належати тій самій фірмі.
  // Сутності без firmId (legacy / projectless без firmId) трактуємо як metrum-group.
  const effectiveEntityFirm = entityFirmId ?? DEFAULT_FIRM_ID;
  const effectiveUserFirm = userFirmId ?? DEFAULT_FIRM_ID;

  if (effectiveEntityFirm !== effectiveUserFirm) {
    const error = new Error("Forbidden: cross-firm access denied") as Error & {
      status: number;
    };
    error.status = 403;
    throw error;
  }
}

/**
 * Зручний хелпер: повертає firmId, який треба stamp-ати на новій сутності,
 * створюваній цим користувачем. Не довіряти firmId, що приходить від клієнта.
 */
export function firmIdForNewEntity(
  session: SessionLike,
  fallback: string = DEFAULT_FIRM_ID,
): string {
  const user = session?.user;
  if (user?.firmId) return user.firmId;
  return fallback;
}
