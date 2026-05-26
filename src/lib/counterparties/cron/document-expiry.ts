import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications/create";
import type { ProjectNotificationType } from "@/lib/notifications/create";

const DAY_MS = 24 * 60 * 60 * 1000;
/// System-актор для нотифікацій без real-user actor (cron). Існує як seed-user
/// `system@metrum.local` (id="system"). Якщо нема — `notifyUsers` все одно
/// працює, бо skipActor залежить від userId.
const SYSTEM_ACTOR_ID = "system";

interface ExpiryNotification {
  threshold: 30 | 7 | 0;
  type: ProjectNotificationType;
  title: (docTitle: string, cpName: string, daysLeft: number) => string;
  body: (docTitle: string, cpName: string, validUntil: Date) => string;
}

const SCHEDULES: ExpiryNotification[] = [
  {
    threshold: 30,
    type: "COUNTERPARTY_LICENSE_EXPIRING_30",
    title: (doc, cp, days) => `${doc} (${cp}) закінчується через ${days} днів`,
    body: (doc, cp, until) =>
      `Документ "${doc}" контрагента ${cp} закінчиться ${until.toISOString().slice(0, 10)}. Підготуйте поновлення.`,
  },
  {
    threshold: 7,
    type: "COUNTERPARTY_LICENSE_EXPIRING_7",
    title: (doc, cp, days) =>
      `${doc} (${cp}) закінчується ${days === 0 ? "сьогодні" : "через " + days + " дн."}`,
    body: (doc, cp, until) =>
      `Документ "${doc}" контрагента ${cp} закінчиться ${until.toISOString().slice(0, 10)}. Терміново поновити.`,
  },
  {
    threshold: 0,
    type: "COUNTERPARTY_LICENSE_EXPIRED",
    title: (doc, cp) => `${doc} (${cp}) — ПРОСТРОЧЕНО`,
    body: (doc, cp, until) =>
      `Документ "${doc}" контрагента ${cp} прострочено ${until.toISOString().slice(0, 10)}. Не використовувати до поновлення.`,
  },
];

/**
 * Перевіряє всі активні `CounterpartyDocument` з `validUntil` і шле
 * notifications за 30/7/0 днів. Idempotent — використовує timestamp-поля
 * `notified30dAt` / `notified7dAt` / `notifiedExpiredAt` як guards.
 *
 * Викликається з `/api/cron/tick` (Vercel cron, ~ хвилина). Внутрішня логіка
 * сама обмежує себе: notify один раз на кожен поріг per document.
 *
 * Повертає `{ scanned, notified }` для аудит-логу tick.
 */
export async function fireCounterpartyDocumentExpiry(): Promise<{
  scanned: number;
  notified: number;
}> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 31 * DAY_MS);

  const docs = await prisma.counterpartyDocument.findMany({
    where: {
      isActive: true,
      validUntil: { not: null, lte: horizon },
    },
    include: {
      counterparty: { select: { id: true, name: true, firmId: true } },
    },
    take: 500,
  });

  let notified = 0;

  for (const doc of docs) {
    if (!doc.validUntil) continue;
    const msLeft = doc.validUntil.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / DAY_MS);

    // Determine which threshold this doc currently fits.
    let fired = false;
    for (const sched of SCHEDULES) {
      const tsField = (
        sched.threshold === 30
          ? "notified30dAt"
          : sched.threshold === 7
            ? "notified7dAt"
            : "notifiedExpiredAt"
      ) as "notified30dAt" | "notified7dAt" | "notifiedExpiredAt";

      const alreadyFired = doc[tsField];
      if (alreadyFired) continue;

      const eligible =
        sched.threshold === 0
          ? msLeft < 0
          : msLeft <= sched.threshold * DAY_MS && msLeft > 0;
      if (!eligible) continue;

      // Recipients: uploader + всі MANAGER / SUPER_ADMIN тієї ж firmId.
      // Якщо counterparty.firmId=null (shared) — оповіщаємо менеджерів обох firms.
      const targetUsers = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { id: doc.uploadedById },
            {
              role: { in: ["MANAGER", "SUPER_ADMIN"] },
              firmId: doc.counterparty.firmId ?? undefined,
            },
          ],
        },
        select: { id: true },
      });

      const userIds = targetUsers.map((u) => u.id);
      if (userIds.length === 0) {
        // Mark timestamp anyway, щоб не циклити в наступний tick.
        await prisma.counterpartyDocument.update({
          where: { id: doc.id },
          data: { [tsField]: now },
        });
        fired = true;
        break;
      }

      await notifyUsers({
        userIds,
        actorId: SYSTEM_ACTOR_ID,
        type: sched.type,
        title: sched.title(doc.title, doc.counterparty.name, daysLeft),
        body: sched.body(doc.title, doc.counterparty.name, doc.validUntil),
        relatedEntity: "counterparty",
        relatedId: doc.counterpartyId,
        skipActor: false,
      });

      await prisma.counterpartyDocument.update({
        where: { id: doc.id },
        data: { [tsField]: now },
      });
      notified += userIds.length;
      fired = true;
      break;
    }
    void fired;
  }

  return { scanned: docs.length, notified };
}
