import type { Prisma, PrismaClient } from "@prisma/client";

export type SequenceScope = "PR" | "RFQ" | "PO";

export type Tx = Prisma.TransactionClient | PrismaClient;

function pad(n: number, width = 4): string {
  return n.toString().padStart(width, "0");
}

function scopeKey(scope: SequenceScope, firmId: string, year: number): string {
  return `${scope}:${firmId}:${year}`;
}

/**
 * Atomic counter для внутрішніх номерів `PR-2026-0001`, `RFQ-2026-0001`,
 * `PO-2026-0001`. Per-firm + per-prefix + per-year — Group і Studio мають
 * незалежні журнали. Викликати ВИКЛЮЧНО у транзакції — інакше можливі гонки
 * при паралельних запитах.
 *
 * Реалізація: upsert через `findUnique + update` під row-lock (`UPDATE ...
 * RETURNING` у Postgres). На першому виклику для нового scope створюється
 * рядок з lastValue=1. Unique-constraint на `<entity>.internalNumber` як
 * defensе-in-depth — якщо колись Sequence пропустить тик, повторний номер
 * впаде з P2002.
 */
export async function nextNumber(
  tx: Tx,
  scope: SequenceScope,
  firmId: string,
  year = new Date().getUTCFullYear(),
): Promise<string> {
  const key = scopeKey(scope, firmId, year);
  // Upsert-then-update. Prisma's upsert на самій моделі повертає увесь рядок
  // після створення, але без atomic increment у одному round-trip. Тож:
  //  1) `upsert` створює рядок з lastValue=0 якщо нема (race-safe — primary key collision).
  //  2) Окремий `update` з `increment: 1` атомарний у тій же транзакції.
  await tx.sequence.upsert({
    where: { scope: key },
    update: {},
    create: { scope: key, lastValue: 0 },
  });
  const updated = await tx.sequence.update({
    where: { scope: key },
    data: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  return `${scope}-${year}-${pad(updated.lastValue)}`;
}
