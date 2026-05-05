import { prisma } from "@/lib/prisma";

const TELEGRAM_API = "https://api.telegram.org";

type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

type TelegramPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
  /// Optional inline keyboard (rows of buttons). If passed, the message is
  /// sent without the trailing "Open" link — buttons replace it.
  inlineKeyboard?: InlineButton[][];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMessage(payload: TelegramPayload, baseUrl: string): string {
  const title = escapeHtml(payload.title);
  const body = payload.body ? escapeHtml(payload.body) : "";
  const linkUrl = payload.url ? `${baseUrl}${payload.url}` : null;

  let text = `<b>${title}</b>`;
  if (body) text += `\n\n${body}`;
  // When inline buttons are provided, callers usually include an "Open" button
  // there — skip the redundant link in body.
  if (linkUrl && !payload.inlineKeyboard) {
    text += `\n\n<a href="${escapeHtml(linkUrl)}">Відкрити</a>`;
  }
  return text;
}

/**
 * Send a Telegram notification to a Metrum user (by Metrum userId).
 * Silently no-ops if the user hasn't linked Telegram.
 */
export async function sendTelegramNotification(
  userId: string,
  payload: TelegramPayload,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set; skipping");
    return;
  }

  const botUser = await prisma.telegramBotUser.findUnique({
    where: { userId },
    select: { telegramId: true },
  });
  if (!botUser) return;

  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
  const text = formatMessage(payload, baseUrl);

  const body: Record<string, unknown> = {
    chat_id: botUser.telegramId.toString(),
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (payload.inlineKeyboard && payload.inlineKeyboard.length > 0) {
    body.reply_markup = { inline_keyboard: payload.inlineKeyboard };
  }

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[telegram] sendMessage failed for user ${userId}: ${res.status} ${errText}`,
    );
  }
}
