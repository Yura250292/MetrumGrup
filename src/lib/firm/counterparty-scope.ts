/**
 * Counterparty firm-scope helper.
 *
 * Постачальники (SUPPLIER) тепер спільні між Metrum Group і Metrum Studio —
 * зберігаються в БД з `firmId=null`. Інші ролі (CLIENT, CONTRACTOR, OTHER)
 * лишаються firm-ізольованими.
 *
 * Цей helper повертає Prisma WHERE-фрагмент який включає "цю фірму + shared":
 *   { OR: [{ firmId }, { firmId: null }] }
 *
 * Викликати в кожному `prisma.counterparty.findMany/findFirst` де треба
 * скоупити по фірмі. Не використовувати для FinanceEntry/SupplierPayment —
 * там firmId завжди конкретний (записи belong to firm, not to counterparty).
 */
export function counterpartyFirmWhere(
  firmId: string | null | undefined,
): { firmId: string } | { OR: [{ firmId: string }, { firmId: null }] } | {} {
  if (!firmId) return {};
  return { OR: [{ firmId }, { firmId: null }] };
}

/**
 * Чи має юзер доступ до Counterparty-запису. На відміну від
 * `assertCanAccessFirm`, цей хелпер трактує firmId=null як "спільний"
 * (доступний з будь-якої фірми), а не як legacy-Group.
 */
export function canAccessCounterparty(args: {
  userFirmId: string | null | undefined;
  userIsSuperAdmin: boolean;
  counterpartyFirmId: string | null;
}): boolean {
  if (args.userIsSuperAdmin) return true;
  if (args.counterpartyFirmId === null) return true; // shared
  return args.userFirmId === args.counterpartyFirmId;
}
