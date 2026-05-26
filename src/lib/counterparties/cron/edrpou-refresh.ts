import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications/create";
import { lookupEdrpou } from "@/lib/integrations/clarity-project";
import type { CounterpartyTaxStatus } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_AFTER_DAYS = 30;
/// Скільки контрагентів обробити за один tick (rate limit вільного тиру
/// clarity-project ~100/день; беремо невелику пачку).
const BATCH_SIZE = 5;
/// Мінімальна пауза між викликами зовнішнього API (мс).
const REQUEST_INTERVAL_MS = 2_000;
const SYSTEM_ACTOR_ID = "system";

const ALERT_STATUSES: CounterpartyTaxStatus[] = [
  "PROBLEM",
  "BANKRUPT",
  "LIQUIDATED",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Weekly-flavored refresh: contractors з `taxStatusCheckedAt < now - 30d` АБО
 * `taxStatusCheckedAt = null` І `edrpou` заповнений → batch lookup через
 * clarity-project. Якщо `taxStatus` змінився на проблемний (PROBLEM/BANKRUPT/
 * LIQUIDATED) — нотифікуємо менеджерів фірми.
 *
 * Викликається з /api/cron/tick. Не обмежений до Monday — gating через
 * `taxStatusCheckedAt`, тож кожен запис оновлюється не частіше 1 разу на 30 днів.
 *
 * Soft-fail: помилка lookup → пишемо ComplianceCheck(success=false) і
 * продовжуємо.
 */
export async function fireCounterpartyEdrpouRefresh(): Promise<{
  scanned: number;
  updated: number;
  notified: number;
}> {
  const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * DAY_MS);

  const candidates = await prisma.counterparty.findMany({
    where: {
      isActive: true,
      edrpou: { not: null },
      OR: [
        { taxStatusCheckedAt: null },
        { taxStatusCheckedAt: { lt: cutoff } },
      ],
    },
    take: BATCH_SIZE,
    select: {
      id: true,
      name: true,
      edrpou: true,
      taxStatus: true,
      legalForm: true,
      firmId: true,
    },
  });

  let updated = 0;
  let notified = 0;

  for (const cp of candidates) {
    if (!cp.edrpou) continue;

    const result = await lookupEdrpou(cp.edrpou);

    if (!result) {
      await prisma.counterpartyComplianceCheck.create({
        data: {
          counterpartyId: cp.id,
          source: "clarity-project",
          rawResponse: {},
          resultSummary: "Auto-refresh: external source unavailable",
          success: false,
          errorMessage: "lookup returned null",
        },
      });
      await sleep(REQUEST_INTERVAL_MS);
      continue;
    }

    const statusChanged = result.taxStatus !== cp.taxStatus;
    const becameProblem =
      statusChanged &&
      ALERT_STATUSES.includes(result.taxStatus) &&
      !ALERT_STATUSES.includes(cp.taxStatus);

    await prisma.$transaction([
      prisma.counterparty.update({
        where: { id: cp.id },
        data: {
          taxStatus: result.taxStatus,
          taxStatusCheckedAt: new Date(),
          legalForm: cp.legalForm ?? result.legalForm,
        },
      }),
      prisma.counterpartyComplianceCheck.create({
        data: {
          counterpartyId: cp.id,
          source: result.source,
          rawResponse: result.raw as never,
          resultSummary: statusChanged
            ? `Auto-refresh: ${cp.taxStatus} → ${result.taxStatus}`
            : `Auto-refresh: status unchanged (${result.taxStatus})`,
          success: true,
        },
      }),
    ]);
    updated++;

    if (becameProblem) {
      const managers = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ["MANAGER", "SUPER_ADMIN"] },
          firmId: cp.firmId ?? undefined,
        },
        select: { id: true },
      });
      const userIds = managers.map((m) => m.id);
      if (userIds.length > 0) {
        await notifyUsers({
          userIds,
          actorId: SYSTEM_ACTOR_ID,
          type: "COUNTERPARTY_TAX_STATUS_CHANGED",
          title: `Контрагент ${cp.name} — ${result.taxStatus}`,
          body: `Auto-refresh виявив зміну податкового статусу: ${cp.taxStatus} → ${result.taxStatus}. Перевірте співпрацю.`,
          relatedEntity: "counterparty",
          relatedId: cp.id,
          skipActor: false,
        });
        notified += userIds.length;
      }
    }

    await sleep(REQUEST_INTERVAL_MS);
  }

  return { scanned: candidates.length, updated, notified };
}
