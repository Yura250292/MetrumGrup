import type { NextRequest } from "next/server";
import { sendNotificationEmail } from "./email";

/**
 * Resolve a public base URL (e.g. https://metrum-group.com.ua) so emails can
 * link back to the app. Picks up X-Forwarded-* in production behind Railway.
 */
export function getPublicBaseUrl(req?: NextRequest): string {
  const env =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  if (req) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (host) return `${proto}://${host}`;
  }
  return "https://metrum-group.com.ua";
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function sendRfqInvite(opts: {
  to: string;
  supplierName: string;
  rfqNumber: string;
  deadline: Date | string;
  publicUrl: string;
}): Promise<void> {
  await sendNotificationEmail({
    to: opts.to,
    subject: `Запит ціни ${opts.rfqNumber} — Metrum Group`,
    body:
      `Доброго дня, ${opts.supplierName}. ` +
      `Metrum Group запрошує вас взяти участь у тендері ${opts.rfqNumber}. ` +
      `Перегляньте позиції та подайте пропозицію до ${formatDate(opts.deadline)}.`,
    actionUrl: opts.publicUrl,
    actionLabel: "Переглянути та подати пропозицію",
  });
}

export async function sendRfqReminder(opts: {
  to: string;
  supplierName: string;
  rfqNumber: string;
  deadline: Date | string;
  publicUrl: string;
}): Promise<void> {
  await sendNotificationEmail({
    to: opts.to,
    subject: `Нагадування: тендер ${opts.rfqNumber} ще відкритий`,
    body:
      `Доброго дня, ${opts.supplierName}. ` +
      `Нагадуємо: ваша пропозиція по тендеру ${opts.rfqNumber} ще не подана. ` +
      `Дедлайн — ${formatDate(opts.deadline)}.`,
    actionUrl: opts.publicUrl,
    actionLabel: "Подати пропозицію",
  });
}

export async function sendBidWinner(opts: {
  to: string;
  supplierName: string;
  rfqNumber: string;
  poNumber: string;
  publicUrl: string;
}): Promise<void> {
  await sendNotificationEmail({
    to: opts.to,
    subject: `Ваша пропозиція по ${opts.rfqNumber} прийнята`,
    body:
      `Доброго дня, ${opts.supplierName}. ` +
      `Вашу пропозицію по тендеру ${opts.rfqNumber} обрано переможною. ` +
      `Очікуйте контактів від нашого менеджера з реквізитами замовлення ${opts.poNumber}.`,
    actionUrl: opts.publicUrl,
    actionLabel: "Деталі тендеру",
  });
}

export async function sendBidLoser(opts: {
  to: string;
  supplierName: string;
  rfqNumber: string;
  publicUrl: string;
}): Promise<void> {
  await sendNotificationEmail({
    to: opts.to,
    subject: `Дякуємо за участь у тендері ${opts.rfqNumber}`,
    body:
      `Доброго дня, ${opts.supplierName}. ` +
      `Дякуємо за вашу пропозицію по тендеру ${opts.rfqNumber}. ` +
      `Цього разу переможцем обрано іншого постачальника, але ми збережемо ваші контакти для майбутніх запитів.`,
    actionUrl: opts.publicUrl,
    actionLabel: "Деталі тендеру",
  });
}
