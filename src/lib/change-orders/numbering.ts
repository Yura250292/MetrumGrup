import type { Prisma, PrismaClient } from "@prisma/client";

const MAX_RETRY = 5;
const NUMBER_REGEX = /^CO-(\d{4})-(\d{3,})$/;

type TxClient = Prisma.TransactionClient | PrismaClient;

/// Поточний рік у Europe/Kyiv. Використовуємо Intl, щоб не залежати від process tz.
function kyivYear(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
  });
  return Number(fmt.format(now));
}

function formatNumber(year: number, n: number): string {
  return `CO-${year}-${String(n).padStart(3, "0")}`;
}

/// Атомарно генерує наступний CO-номер у межах firmId за поточний рік.
/// Стратегія: SELECT MAX(number) з префіксом + парс N + n+1. Унікальність
/// гарантує @@unique([firmId, number]) — у разі race ловимо P2002 і
/// пробуємо ще раз (до MAX_RETRY разів).
///
/// Викликати ВСЕРЕДИНІ транзакції перед `prisma.changeOrder.create`, щоб
/// номер і запис створювались атомарно.
export async function peekNextCONumber(
  tx: TxClient,
  firmId: string,
  now: Date = new Date(),
): Promise<string> {
  const year = kyivYear(now);
  const prefix = `CO-${year}-`;
  const last = await tx.changeOrder.findFirst({
    where: { firmId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let next = 1;
  if (last) {
    const match = NUMBER_REGEX.exec(last.number);
    if (match) next = Number(match[2]) + 1;
  }
  return formatNumber(year, next);
}

/// Якщо передано лічильник для тестів — використовується замість prisma.
export async function withRetryOnUniqueViolation<T>(
  fn: () => Promise<T>,
  maxRetry = MAX_RETRY,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetry; attempt += 1) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const isUnique =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "P2002";
      if (!isUnique) throw err;
    }
  }
  throw lastError;
}
