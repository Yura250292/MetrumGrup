import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 хвилин

function buildDeepLink(token: string): string | null {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) return null;
  const clean = botUsername.startsWith("@") ? botUsername.slice(1) : botUsername;
  return `https://t.me/${clean}?start=${token}`;
}

/**
 * GET /api/admin/profile/telegram
 * Returns current Telegram link status.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  const botUser = await prisma.telegramBotUser.findUnique({
    where: { userId: session.user.id },
    select: {
      telegramId: true,
      firstName: true,
      lastName: true,
      username: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    linked: Boolean(botUser),
    telegram: botUser
      ? {
          telegramId: botUser.telegramId.toString(),
          firstName: botUser.firstName,
          lastName: botUser.lastName,
          username: botUser.username,
          linkedAt: botUser.createdAt,
        }
      : null,
  });
}

/**
 * POST /api/admin/profile/telegram
 * Generate a one-time link token and return the deep-link URL.
 */
export async function POST(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  const token = randomBytes(16).toString("base64url");

  await prisma.telegramLinkToken.create({
    data: {
      token,
      userId: session.user.id,
      expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
    },
  });

  const deepLink = buildDeepLink(token);
  if (!deepLink) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_USERNAME не налаштовано на сервері" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deepLink,
    expiresInSec: LINK_TOKEN_TTL_MS / 1000,
  });
}

/**
 * DELETE /api/admin/profile/telegram
 * Unlink Telegram for the current user. Keeps TelegramBotUser row but clears userId.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  await prisma.telegramBotUser.updateMany({
    where: { userId: session.user.id },
    data: { userId: null },
  });

  return NextResponse.json({ ok: true });
}
