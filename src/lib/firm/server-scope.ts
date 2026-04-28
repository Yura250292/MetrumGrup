import "server-only";
import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { resolveFirmScope, type FirmScope, KNOWN_FIRMS } from "./scope";

export const FIRM_OVERRIDE_COOKIE = "metrum-firm-override";
/** Спеціальне значення яке означає "усі фірми" (cross-firm) для SUPER_ADMIN. */
export const FIRM_OVERRIDE_ALL = "__all__";

/**
 * Читає cookie `metrum-firm-override`. Повертає:
 *  - undefined — cookie немає, поведінка за замовчуванням
 *  - null — cross-firm view (усі фірми)
 *  - string — конкретний firmId
 *
 * Cookie ставить лише API `/api/firm/switch` (SUPER_ADMIN-only). Для
 * не-SUPER_ADMIN користувачів cookie ігнорується у resolveFirmScope.
 */
export async function getFirmOverrideCookie(): Promise<
  string | null | undefined
> {
  const store = await cookies();
  const raw = store.get(FIRM_OVERRIDE_COOKIE)?.value;
  if (!raw) return undefined;
  if (raw === FIRM_OVERRIDE_ALL) return null;
  if (KNOWN_FIRMS[raw]) return raw;
  return undefined;
}

/**
 * Версія resolveFirmScope що читає cookie. Викликати у server-компонентах
 * та API роутах замість resolveFirmScope(session) — щоб перемикач фірм
 * у хедері впливав на всі сторінки.
 *
 * Пріоритет: explicitOverride > cookie > defaults.
 * Cookie зчитується для УСІХ ролей — щоб керівник студії теж міг перемикатись.
 * Доступ до дій (Фінансування, Проекти) на чужій фірмі обмежується через
 * isHomeFirmFor/assertHomeFirm на рівні сторінок та API.
 */
export async function resolveFirmScopeForRequest(
  session: Pick<Session, "user"> | null | undefined,
  explicitOverride?: string | null,
): Promise<FirmScope> {
  if (explicitOverride !== undefined) {
    return resolveFirmScope(session, explicitOverride);
  }
  const cookieOverride = await getFirmOverrideCookie();
  return resolveFirmScope(session, cookieOverride);
}
