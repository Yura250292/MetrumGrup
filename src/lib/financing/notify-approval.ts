import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { sendPush } from "@/lib/notifications/push";
import { sendTelegramNotification } from "@/lib/notifications/telegram";

/**
 * Approver role set — these users receive approval notifications.
 */
const APPROVER_ROLES = ["SUPER_ADMIN", "FINANCIER"] as const;

type EntryForNotification = {
  id: string;
  title: string;
  type: "EXPENSE" | "INCOME";
  amount: number | string;
  counterparty?: string | null;
  projectTitle?: string | null;
  /// "Малярні роботи / Шпаклювання / Матеріали" — додається в кінці DM
  /// щоб менеджер бачив куди саме лягає витрата без переходу в Metrum.
  breadcrumb?: string | null;
};

function formatBody(entry: EntryForNotification): string {
  const typeLabel = entry.type === "INCOME" ? "Дохід" : "Витрата";
  const amount = Number(entry.amount).toLocaleString("uk-UA", { maximumFractionDigits: 2 });
  const parts = [`${typeLabel} — ${amount} грн`];
  if (entry.counterparty) parts.push(entry.counterparty);
  if (entry.projectTitle) parts.push(entry.projectTitle);
  if (entry.breadcrumb) parts.push(`📂 ${entry.breadcrumb}`);
  return parts.join(" · ");
}

/**
 * Notify all SUPER_ADMIN + FINANCIER users about a new PENDING finance entry.
 * Creates in-app notifications + push + email (respecting user prefs).
 * Fire-and-forget: never throws.
 */
export async function notifyFinanceApprovers(
  entry: EntryForNotification,
  actorId: string,
  opts?: { isReminder?: boolean },
): Promise<void> {
  try {
    const approvers = await prisma.user.findMany({
      where: {
        role: { in: [...APPROVER_ROLES] },
        isActive: true,
        id: { not: actorId },
      },
      select: { id: true, email: true },
    });

    if (approvers.length === 0) return;

    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
    const url = `/admin-v2/financing?pendingId=${entry.id}`;

    const title = opts?.isReminder
      ? `⏰ Нагадування: чек чекає погодження`
      : `💳 Новий чек на погодження`;
    const body = formatBody(entry);
    const type = opts?.isReminder ? "FINANCE_APPROVAL_REMINDER" : "FINANCE_APPROVAL_NEEDED";

    // Create in-app notification records
    await prisma.notification.createMany({
      data: approvers.map((u) => ({
        userId: u.id,
        type,
        title,
        body,
        relatedEntity: "FinanceEntry",
        relatedId: entry.id,
      })),
    });

    const tgKeyboard = opts?.isReminder
      ? [
          [
            { text: "✅ Підтвердити", callback_data: `fin_approve:${entry.id}` },
            { text: "❌ Відхилити", callback_data: `fin_reject:${entry.id}` },
          ],
          [{ text: "📋 Відкрити в Metrum", url: baseUrl + url }],
        ]
      : [
          [
            { text: "✅ Підтвердити", callback_data: `fin_approve:${entry.id}` },
            { text: "❌ Відхилити", callback_data: `fin_reject:${entry.id}` },
          ],
          [{ text: "📋 Відкрити в Metrum", url: baseUrl + url }],
        ];

    // Fan out to push + email + telegram (best-effort, parallel)
    await Promise.allSettled(
      approvers.flatMap((u) => [
        sendPush(u.id, { title, body, url }).catch((e) => {
          console.error("[notify-finance] push error:", e);
        }),
        sendNotificationEmail({
          to: u.email,
          subject: title,
          body,
          actionUrl: baseUrl + url,
          actionLabel: "Переглянути",
        }).catch((e) => {
          console.error("[notify-finance] email error:", e);
        }),
        sendTelegramNotification(u.id, {
          title,
          body,
          url,
          inlineKeyboard: tgKeyboard,
        }).catch((e) => {
          console.error("[notify-finance] telegram error:", e);
        }),
      ]),
    );
  } catch (err) {
    console.error("[notify-finance] failed:", err);
  }
}

/**
 * Notify the original creator when their entry is approved/rejected.
 */
export async function notifyFinanceActor(
  entry: EntryForNotification & { createdById: string },
  resolution: "APPROVED" | "REJECTED",
  resolverId: string,
): Promise<void> {
  try {
    if (entry.createdById === resolverId) return;
    const creator = await prisma.user.findUnique({
      where: { id: entry.createdById },
      select: { id: true, email: true, isActive: true },
    });
    if (!creator || !creator.isActive) return;

    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
    const url = `/admin-v2/financing?entryId=${entry.id}`;
    const title =
      resolution === "APPROVED"
        ? `✅ Ваш чек підтверджено`
        : `❌ Ваш чек відхилено`;
    const body = formatBody(entry);
    const type = resolution === "APPROVED" ? "FINANCE_APPROVED" : "FINANCE_REJECTED";

    await prisma.notification.create({
      data: {
        userId: creator.id,
        type,
        title,
        body,
        relatedEntity: "FinanceEntry",
        relatedId: entry.id,
      },
    });

    await Promise.allSettled([
      sendPush(creator.id, { title, body, url }).catch(() => {}),
      sendNotificationEmail({
        to: creator.email,
        subject: title,
        body,
        actionUrl: baseUrl + url,
      }).catch(() => {}),
    ]);
  } catch (err) {
    console.error("[notify-finance-actor] failed:", err);
  }
}
