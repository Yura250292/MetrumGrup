import type { Prisma, PrismaClient } from "@prisma/client";

const NUMBER_REGEX = /^PRJ-(\d{4})-(\d{3,})$/;

type TxClient = Prisma.TransactionClient | PrismaClient;

function kyivYear(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
  });
  return Number(fmt.format(now));
}

function formatCode(year: number, n: number): string {
  return `PRJ-${year}-${String(n).padStart(3, "0")}`;
}

/// Атомарно генерує наступний project code PRJ-YYYY-NNN у межах
/// фірми + року. Викликати ВСЕРЕДИНІ транзакції перед
/// `prisma.project.create`, щоб номер і запис створювались атомарно.
///
/// Унікальність гарантує `@unique` на Project.code — у разі race ловимо
/// P2002 у `withRetryOnUniqueViolation`.
export async function peekNextProjectCode(
  tx: TxClient,
  firmId: string | null | undefined,
  now: Date = new Date(),
): Promise<string> {
  const year = kyivYear(now);
  const prefix = `PRJ-${year}-`;
  const last = await tx.project.findFirst({
    where: {
      firmId: firmId ?? undefined,
      code: { startsWith: prefix },
    },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let next = 1;
  if (last?.code) {
    const match = NUMBER_REGEX.exec(last.code);
    if (match) next = Number(match[2]) + 1;
  }
  return formatCode(year, next);
}
